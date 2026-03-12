/**
 * seed-from-export.mjs
 *
 * Reads pac CMT export zips for all three tables, computes demo-ready
 * progress + status values calibrated to March 24 (demo day), writes
 * import zips, then calls pac data import for each table.
 *
 * Usage:
 *   node scripts/seed-from-export.mjs             # compute + import all tables
 *   node scripts/seed-from-export.mjs --dry-run   # preview only, no writes
 *
 * Export prerequisites (run once per table):
 *   pac data export --schemaFile scripts/dataverse-schema/activity-schema.xml --dataFile scripts/dataverse-schema/activities_export.zip --overwrite
 *   pac data export --schemaFile scripts/dataverse-schema/asset-schema.xml    --dataFile scripts/dataverse-schema/assets_export.zip    --overwrite
 *   pac data export --schemaFile scripts/dataverse-schema/project-schema.xml  --dataFile scripts/dataverse-schema/projects_export.zip  --overwrite
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { inflateRawSync, deflateRawSync } from 'node:zlib';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir  = dirname(fileURLToPath(import.meta.url));
const ROOT   = resolve(__dir, '..');
const SCHEMA = resolve(ROOT, 'scripts/dataverse-schema');
const PAC    = 'C:\\Users\\matthewkarr\\AppData\\Roaming\\Code\\User\\globalStorage\\microsoft-isvexptools.powerplatform-vscode\\pac\\tools\\pac.exe';

const DEMO_DATE = new Date('2026-03-24T00:00:00.000Z');
const DRY_RUN   = process.argv.includes('--dry-run');

// pac CMT requires this file in every import zip (matches what pac data export produces)
const CONTENT_TYPES_XML = Buffer.from(
  '\uFEFF<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/octet-stream" /></Types>',
  'utf8',
);

const STATUS = {
  NotStarted: 804270000,
  InProgress: 804270001,
  Completed:  804270002,
  Blocked:    804270003,
};
const STATUS_LABEL = Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [v, k]));

// ── ZIP reader ────────────────────────────────────────────────────────────────
function readZipEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65558); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP EOCD not found');

  const cdTotal  = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);

  const entries = {};
  let pos = cdOffset;
  for (let i = 0; i < cdTotal; i++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) throw new Error(`Bad central dir sig at ${pos}`);
    const method      = buf.readUInt16LE(pos + 10);
    const compSize    = buf.readUInt32LE(pos + 20);
    const uncompSize  = buf.readUInt32LE(pos + 24);
    const nameLen     = buf.readUInt16LE(pos + 28);
    const extraLen    = buf.readUInt16LE(pos + 30);
    const commentLen  = buf.readUInt16LE(pos + 32);
    const localOff    = buf.readUInt32LE(pos + 42);
    const name        = buf.toString('utf8', pos + 46, pos + 46 + nameLen);
    pos += 46 + nameLen + extraLen + commentLen;

    const lnLen  = buf.readUInt16LE(localOff + 26);
    const leLen  = buf.readUInt16LE(localOff + 28);
    const dStart = localOff + 30 + lnLen + leLen;
    const raw    = buf.slice(dStart, dStart + compSize);

    entries[name] = method === 0 ? raw : inflateRawSync(raw);
  }
  return entries;
}

// ── ZIP writer ────────────────────────────────────────────────────────────────
function crc32(buf) {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = t[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function u16(v) { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; }
function u32(v) { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; }

function buildZip(files) {
  const parts = [], cds = [];
  let offset = 0;

  for (const [name, raw] of files) {
    const n    = Buffer.from(name, 'utf8');
    const comp = deflateRawSync(raw, { level: 6 });
    const crc  = crc32(raw);

    const local = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0), u16(8),
      u16(0), u16(0),
      u32(crc), u32(comp.length), u32(raw.length),
      u16(n.length), u16(0), n,
    ]);
    const cd = Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(8),
      u16(0), u16(0),
      u32(crc), u32(comp.length), u32(raw.length),
      u16(n.length), u16(0), u16(0), u16(0), u16(0), u32(0),
      u32(offset), n,
    ]);

    parts.push(local, comp);
    cds.push(cd);
    offset += local.length + comp.length;
  }

  const cdBuf = Buffer.concat(cds);
  const eocd  = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0),
    u16(files.length), u16(files.length),
    u32(cdBuf.length), u32(offset), u16(0),
  ]);

  return Buffer.concat([...parts, cdBuf, eocd]);
}

// ── XML parsing ───────────────────────────────────────────────────────────────
function getAttr(tag, attr) {
  const m = new RegExp(`${attr}="([^"]*)"`, 'i').exec(tag);
  return m ? m[1] : null;
}

function parseRecords(xml) {
  const records = [];
  const recRe = /<record\b([^>]*)>([\s\S]*?)<\/record>/g;
  let m;
  while ((m = recRe.exec(xml)) !== null) {
    const id     = getAttr(m[1], 'id');
    const fields = {};
    const fRe    = /<field\s+name="([^"]+)"\s+value="([^"]*)"/g;
    let f;
    while ((f = fRe.exec(m[2])) !== null) fields[f[1]] = f[2];
    if (id) records.push({ id, ...fields });
  }
  return records;
}

function getDataXml(entries) {
  const key = Object.keys(entries).find(k => k.toLowerCase().includes('data') && k.endsWith('.xml'));
  if (!key) throw new Error('No data XML found in zip. Files: ' + Object.keys(entries).join(', '));
  return entries[key].toString('utf8');
}

// ── Activity seeding ──────────────────────────────────────────────────────────
// Activities need both cr809_progress and cr809_status for color-coding to work.
//  • Dated activities  (17)  → use elapsed time vs demo date
//  • Undated activities (387) → use sequence rank within each asset group
function buildActivitySeeds(activities) {
  const seeds  = [];
  const demoMs = DEMO_DATE.getTime();
  let   bucket = 0;

  const dated   = activities.filter(a => a.cr809_startdate || a.cr809_enddate);
  const undated = activities.filter(a => !a.cr809_startdate && !a.cr809_enddate);

  // ── dated activities: calibrate to elapsed ratio at demo date ──
  for (const a of dated) {
    const start = new Date(a.cr809_startdate || a.cr809_enddate).getTime();
    const end   = new Date(a.cr809_enddate   || a.cr809_startdate).getTime();
    const span  = end - start;

    if (span <= 0) {
      seeds.push({ id: a.cr809_activityid, name: a.cr809_activityname, progress: 100, status: STATUS.Completed });
      continue;
    }

    const elapsed = (demoMs - start) / span;

    if (elapsed <= 0) {
      seeds.push({ id: a.cr809_activityid, name: a.cr809_activityname, progress: 0, status: STATUS.NotStarted });
    } else if (elapsed >= 1) {
      seeds.push({ id: a.cr809_activityid, name: a.cr809_activityname, progress: 100, status: STATUS.Completed });
    } else {
      const b = bucket % 5;
      bucket++;
      let progress, status;

      if (b === 0 || b === 1) {
        progress = Math.min(95, Math.round((elapsed + 0.22) * 100));
        status   = STATUS.InProgress;
      } else if (b === 2) {
        progress = Math.round(elapsed * 100);
        status   = STATUS.InProgress;
      } else if (b === 3) {
        progress = Math.max(5, Math.round((elapsed - 0.24) * 100));
        status   = STATUS.InProgress;
      } else {
        progress = Math.max(8, Math.round((elapsed - 0.15) * 100));
        status   = STATUS.Blocked;
      }
      seeds.push({ id: a.cr809_activityid, name: a.cr809_activityname, progress, status });
    }
  }

  // ── undated activities: use sequence rank within each asset group ──
  // Simulate that the project is ~70% through its sequence timeline:
  //   first 20% of an asset's activities  → Completed
  //   next 60% → InProgress with variety (bucket rotation)
  //   last 20% → NotStarted
  const byAsset = {};
  for (const a of undated) {
    const key = a.cr809_assetid || '__unlinked__';
    (byAsset[key] = byAsset[key] || []).push(a);
  }
  for (const group of Object.values(byAsset)) {
    group.sort((a, b) => Number(a.cr809_sequence || 0) - Number(b.cr809_sequence || 0));
  }

  for (const group of Object.values(byAsset)) {
    const n = group.length;
    for (let i = 0; i < n; i++) {
      const a   = group[i];
      const pos = n > 1 ? i / (n - 1) : 0.5; // 0=first-in-sequence, 1=last

      let progress, status;
      if (pos <= 0.20) {
        // Early activities in the sequence are done
        progress = 100;
        status   = STATUS.Completed;
      } else if (pos >= 0.80) {
        // Late activities haven't started yet
        progress = 0;
        status   = STATUS.NotStarted;
      } else {
        // Middle activities are in-progress with variety
        const mid = (pos - 0.20) / 0.60; // 0=just-entered-middle, 1=about-to-leave
        const b   = bucket % 5;
        bucket++;

        if (b === 0 || b === 1) {
          progress = Math.min(95, Math.round((0.70 - mid * 0.30) * 100));
          status   = STATUS.InProgress;
        } else if (b === 2) {
          progress = Math.round((0.55 - mid * 0.20) * 100);
          status   = STATUS.InProgress;
        } else if (b === 3) {
          progress = Math.max(10, Math.round((0.40 - mid * 0.25) * 100));
          status   = STATUS.InProgress;
        } else {
          progress = Math.max(8, Math.round((0.35 - mid * 0.20) * 100));
          status   = STATUS.Blocked;
        }
      }
      seeds.push({ id: a.cr809_activityid, name: a.cr809_activityname, progress, status });
    }
  }

  return seeds;
}

// ── Asset / Project seeding ───────────────────────────────────────────────────
// Only cr809_progress is set (no status field on these tables).
// Deterministic variety based on record index mod 5.
function buildSimpleSeeds(records, idField, nameField) {
  return records.map((r, i) => {
    let progress;
    const b = i % 5;
    if      (b === 0) progress = 100;
    else if (b === 1) progress = 75 + (i % 15);
    else if (b === 2) progress = 50 + (i % 15);
    else if (b === 3) progress = 20 + (i % 20);
    else              progress = 0;
    return { id: r[idField], name: r[nameField], progress };
  });
}

// ── XML builders ──────────────────────────────────────────────────────────────
function buildActivityImportDataXml(seeds) {
  const records = seeds.map(s => `    <record id="${s.id}" action="CreateOrUpdate">
      <field name="cr809_activityid" value="${s.id}" />
      <field name="cr809_progress" value="${s.progress}" />
      <field name="cr809_status" value="${s.status}" />
    </record>`).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<entities>
  <entity name="cr809_activity">
    <records>
${records}
    </records>
  </entity>
</entities>`;
}

function buildActivityImportSchemaXml() {
  return `<?xml version="1.0" encoding="utf-8"?>
<entities>
  <entity name="cr809_activity" displayname="Activity" primaryidfield="cr809_activityid" primarynamefield="cr809_activityname" disableplugins="false">
    <fields>
      <field displayname="Activity" name="cr809_activityid" type="guid" primaryKey="true" />
      <field displayname="Status"   name="cr809_status"     type="optionsetvalue" />
      <field displayname="Progress" name="cr809_progress"   type="number" />
    </fields>
  </entity>
</entities>`;
}

function buildSimpleImportDataXml(entityName, idField, seeds) {
  const records = seeds.map(s => `    <record id="${s.id}" action="CreateOrUpdate">
      <field name="${idField}" value="${s.id}" />
      <field name="cr809_progress" value="${s.progress}" />
    </record>`).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<entities>
  <entity name="${entityName}">
    <records>
${records}
    </records>
  </entity>
</entities>`;
}

function buildSimpleImportSchemaXml(entityName, idField, displayName, nameField) {
  return `<?xml version="1.0" encoding="utf-8"?>
<entities>
  <entity name="${entityName}" displayname="${displayName}" primaryidfield="${idField}" primarynamefield="${nameField}" disableplugins="false">
    <fields>
      <field displayname="${displayName}" name="${idField}"        type="guid"   primaryKey="true" />
      <field displayname="Progress"       name="cr809_progress"   type="number" />
    </fields>
  </entity>
</entities>`;
}

// ── Project-specific seeding ──────────────────────────────────────────────────
// Each project gets a named assignment so the Gantt shows the right color at demo date.
//   Assembly Ergonomics → ahead (blue)       — progress just above elapsed (~96%)
//   paint line refurbishment → not started (gray) — progress = 0
//   Demo Dry Run → behind (red)              — dates fixed to Jan–Jun, progress = 20%
//   anything else → on target (blue)         — progress ≈ elapsed
function buildProjectSeeds(projects) {
  const demoMs = DEMO_DATE.getTime();
  let paintLineSeen = false;

  return projects.map(p => {
    const name = (p.cr809_projectname || '').toLowerCase().trim();

    const start = p.cr809_startdate ? new Date(p.cr809_startdate).getTime() : 0;
    const end   = p.cr809_enddate   ? new Date(p.cr809_enddate).getTime()   : 0;
    const span  = end - start;
    const elapsed = span > 0 ? Math.min(1, Math.max(0, (demoMs - start) / span)) : 0.5;

    if (name.includes('paint line')) {
      if (!paintLineSeen) {
        // First occurrence → on target (progress ≈ elapsed at demo date)
        paintLineSeen = true;
        return { id: p.cr809_projectid, name: p.cr809_projectname, progress: Math.round(elapsed * 100) };
      } else {
        // Second occurrence → not started
        return { id: p.cr809_projectid, name: p.cr809_projectname, progress: 0 };
      }
    }

    if (name.includes('assembly ergonomics') || name.includes('ergo')) {
      // elapsed ≈ 96% at demo date — set to 99% so it reads ahead
      const progress = Math.min(99, Math.round((elapsed + 0.03) * 100));
      return { id: p.cr809_projectid, name: p.cr809_projectname, progress };
    }

    if (name.includes('demo dry run')) {
      // Current dates are start == end (Feb 25), so elapsed is always 0 → always "ahead".
      // Override with a meaningful range: Jan 1 → Jun 30 2026.
      // Elapsed at demo date (Mar 24): 83/181 ≈ 46% → set progress = 20% → red (behind).
      return {
        id:        p.cr809_projectid,
        name:      p.cr809_projectname,
        progress:  20,
        startdate: '2026-01-01T00:00:00.000Z',
        enddate:   '2026-06-30T00:00:00.000Z',
      };
    }

    // Default: on target
    return { id: p.cr809_projectid, name: p.cr809_projectname, progress: Math.round(elapsed * 100) };
  });
}

function buildProjectImportDataXml(seeds) {
  const records = seeds.map(s => {
    const dateFields = s.startdate
      ? `\n      <field name="cr809_startdate" value="${s.startdate}" />\n      <field name="cr809_enddate"   value="${s.enddate}" />`
      : '';
    return `    <record id="${s.id}" action="CreateOrUpdate">
      <field name="cr809_projectid" value="${s.id}" />
      <field name="cr809_progress"  value="${s.progress}" />${dateFields}
    </record>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<entities>
  <entity name="cr809_project">
    <records>
${records}
    </records>
  </entity>
</entities>`;
}

function buildProjectImportSchemaXml() {
  return `<?xml version="1.0" encoding="utf-8"?>
<entities>
  <entity name="cr809_project" displayname="Project" primaryidfield="cr809_projectid" primarynamefield="cr809_projectname" disableplugins="false">
    <fields>
      <field displayname="Project"    name="cr809_projectid"   type="guid"     primaryKey="true" />
      <field displayname="Start Date" name="cr809_startdate"   type="datetime" />
      <field displayname="End Date"   name="cr809_enddate"     type="datetime" />
      <field displayname="Progress"   name="cr809_progress"    type="number" />
    </fields>
  </entity>
</entities>`;
}

// ── Summary printer ───────────────────────────────────────────────────────────
function printActivitySummary(seeds, activities) {
  const counts = { NotStarted: 0, Ahead: 0, OnTime: 0, Behind: 0, Blocked: 0, Completed: 0 };
  for (const s of seeds) {
    const label = STATUS_LABEL[s.status];
    if (label === 'InProgress') {
      const a = activities.find(x => x.cr809_activityid === s.id);
      if (a && a.cr809_startdate) {
        const elapsed = (DEMO_DATE - new Date(a.cr809_startdate)) /
                        (new Date(a.cr809_enddate) - new Date(a.cr809_startdate));
        if (s.progress / 100 >= elapsed - 0.05) counts.Ahead++;
        else counts.Behind++;
      } else {
        // undated — classify by progress level
        if (s.progress >= 60) counts.Ahead++;
        else counts.Behind++;
      }
    } else if (label === 'Blocked') {
      counts.Blocked++;
    } else {
      counts[label] = (counts[label] ?? 0) + 1;
    }
  }

  console.log('─'.repeat(56));
  console.log(' Category                    Count');
  console.log('─'.repeat(56));
  console.log(` Not Started (gray)           ${counts.NotStarted}`);
  console.log(` In Progress — ahead (blue)   ${counts.Ahead}`);
  console.log(` In Progress — behind (red)   ${counts.Behind}`);
  console.log(` Blocked (amber)              ${counts.Blocked}`);
  console.log(` Completed (green)            ${counts.Completed}`);
  console.log('─'.repeat(56));
  console.log(` Total                        ${seeds.length}`);
  console.log('─'.repeat(56) + '\n');

  console.log('Sample (first 30):');
  for (const s of seeds.slice(0, 30)) {
    const lbl  = STATUS_LABEL[s.status].padEnd(12);
    const prog = String(s.progress).padStart(3) + '%';
    const name = (s.name ?? s.id).slice(0, 48);
    console.log(`  [${lbl}] ${prog}  ${name}`);
  }
  if (seeds.length > 30) console.log(`  … and ${seeds.length - 30} more`);
}

function printSimpleSummary(seeds) {
  for (const s of seeds.slice(0, 20)) {
    const prog = String(s.progress).padStart(3) + '%';
    const name = (s.name ?? s.id).slice(0, 52);
    console.log(`  ${prog}  ${name}`);
  }
  if (seeds.length > 20) console.log(`  … and ${seeds.length - 20} more`);
}

// ── import helper ─────────────────────────────────────────────────────────────
function runImport(importZip) {
  const cmd = `"${PAC}" data import --data "${importZip}"`;
  console.log(`  Running: pac data import --data ${importZip}`);
  try {
    const out = execSync(cmd, { encoding: 'utf8', timeout: 300_000 });
    console.log(out);
  } catch (e) {
    console.error('pac import error:', e.stdout || e.message);
    process.exit(1);
  }
}

// ── main ──────────────────────────────────────────────────────────────────────
function main() {
  console.log(`Demo date : ${DEMO_DATE.toDateString()}`);
  console.log(DRY_RUN ? '*** DRY RUN — no writes ***\n' : '\n');

  // ── 1. Activities ──────────────────────────────────────────────────────────
  const actExport = resolve(SCHEMA, 'activities_export.zip');
  const actImport = resolve(SCHEMA, 'activities_import.zip');

  if (!existsSync(actExport)) {
    console.error(`Activities export not found: ${actExport}`);
    console.error('Run: pac data export --schemaFile scripts/dataverse-schema/activity-schema.xml --dataFile scripts/dataverse-schema/activities_export.zip --overwrite\n');
  } else {
    console.log('── ACTIVITIES ────────────────────────────────────────────────');
    const zipBuf     = readFileSync(actExport);
    const entries    = readZipEntries(zipBuf);
    const xml        = getDataXml(entries);
    const activities = parseRecords(xml);
    console.log(`  ${activities.length} records loaded from export.`);

    const seeds = buildActivitySeeds(activities);
    printActivitySummary(seeds, activities);

    if (!DRY_RUN) {
      const dataXml   = Buffer.from(buildActivityImportDataXml(seeds), 'utf8');
      const schemaXml = Buffer.from(buildActivityImportSchemaXml(), 'utf8');
      writeFileSync(actImport, buildZip([['data.xml', dataXml], ['data_schema.xml', schemaXml], ['[Content_Types].xml', CONTENT_TYPES_XML]]));
      console.log(`  Written: ${actImport}`);
      runImport(actImport);
    }
  }

  // ── 2. Assets ──────────────────────────────────────────────────────────────
  const assetExport = resolve(SCHEMA, 'assets_export.zip');
  const assetImport = resolve(SCHEMA, 'assets_import.zip');

  if (!existsSync(assetExport)) {
    console.log('\n── ASSETS ────────────────────────────────────────────────────');
    console.log('  Export not found — skipping.');
    console.log('  Run: pac data export --schemaFile scripts/dataverse-schema/asset-schema.xml --dataFile scripts/dataverse-schema/assets_export.zip --overwrite');
  } else {
    console.log('\n── ASSETS ────────────────────────────────────────────────────');
    const zipBuf = readFileSync(assetExport);
    const xml    = getDataXml(readZipEntries(zipBuf));
    const assets = parseRecords(xml);
    console.log(`  ${assets.length} records loaded from export.`);

    const seeds = buildSimpleSeeds(assets, 'cr809_assetid', 'cr809_assetname');
    printSimpleSummary(seeds);

    if (!DRY_RUN) {
      const dataXml   = Buffer.from(buildSimpleImportDataXml('cr809_asset', 'cr809_assetid', seeds), 'utf8');
      const schemaXml = Buffer.from(buildSimpleImportSchemaXml('cr809_asset', 'cr809_assetid', 'Asset', 'cr809_assetname'), 'utf8');
      writeFileSync(assetImport, buildZip([['data.xml', dataXml], ['data_schema.xml', schemaXml], ['[Content_Types].xml', CONTENT_TYPES_XML]]));
      console.log(`  Written: ${assetImport}`);
      runImport(assetImport);
    }
  }

  // ── 3. Projects ────────────────────────────────────────────────────────────
  const projExport = resolve(SCHEMA, 'projects_export.zip');
  const projImport = resolve(SCHEMA, 'projects_import.zip');

  if (!existsSync(projExport)) {
    console.log('\n── PROJECTS ──────────────────────────────────────────────────');
    console.log('  Export not found — skipping.');
    console.log('  Run: pac data export --schemaFile scripts/dataverse-schema/project-schema.xml --dataFile scripts/dataverse-schema/projects_export.zip --overwrite');
  } else {
    console.log('\n── PROJECTS ──────────────────────────────────────────────────');
    const zipBuf   = readFileSync(projExport);
    const xml      = getDataXml(readZipEntries(zipBuf));
    const projects = parseRecords(xml);
    console.log(`  ${projects.length} records loaded from export.`);

    const seeds = buildProjectSeeds(projects);
    printSimpleSummary(seeds);

    if (!DRY_RUN) {
      const dataXml   = Buffer.from(buildProjectImportDataXml(seeds), 'utf8');
      const schemaXml = Buffer.from(buildProjectImportSchemaXml(), 'utf8');
      writeFileSync(projImport, buildZip([['data.xml', dataXml], ['data_schema.xml', schemaXml], ['[Content_Types].xml', CONTENT_TYPES_XML]]));
      console.log(`  Written: ${projImport}`);
      runImport(projImport);
    }
  }

  if (DRY_RUN) console.log('\n*** DRY RUN complete — no data was written. ***');
  else console.log('\nAll done.');
}

main();
