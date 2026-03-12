import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { inflateRawSync } from 'node:zlib';

function argValue(name, fallback) {
  const key = `--${name}`;
  const idx = process.argv.indexOf(key);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return fallback;
}

function toDate(value) {
  const d = new Date(value ?? '');
  return Number.isNaN(d.getTime()) ? null : d;
}

function toNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function findZipEntry(zipBuf, targetName) {
  let eocd = -1;
  for (let i = zipBuf.length - 22; i >= 0; i--) {
    if (zipBuf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Could not locate zip EOCD marker.');

  const totalEntries = zipBuf.readUInt16LE(eocd + 10);
  const cdOffset = zipBuf.readUInt32LE(eocd + 16);

  let pos = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (zipBuf.readUInt32LE(pos) !== 0x02014b50) {
      throw new Error(`Invalid central directory entry at ${pos}.`);
    }

    const method = zipBuf.readUInt16LE(pos + 10);
    const compSize = zipBuf.readUInt32LE(pos + 20);
    const nameLen = zipBuf.readUInt16LE(pos + 28);
    const extraLen = zipBuf.readUInt16LE(pos + 30);
    const commLen = zipBuf.readUInt16LE(pos + 32);
    const localOff = zipBuf.readUInt32LE(pos + 42);
    const name = zipBuf.toString('utf8', pos + 46, pos + 46 + nameLen);

    pos += 46 + nameLen + extraLen + commLen;

    if (name.toLowerCase() !== targetName.toLowerCase()) continue;

    const lnLen = zipBuf.readUInt16LE(localOff + 26);
    const leLen = zipBuf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lnLen + leLen;
    const raw = zipBuf.slice(dataStart, dataStart + compSize);
    return method === 0 ? raw : inflateRawSync(raw);
  }

  throw new Error(`Entry '${targetName}' not found in zip.`);
}

function loadDataXmlRecords(zipPath) {
  const abs = resolve(zipPath);
  if (!existsSync(abs)) throw new Error(`Input zip not found: ${abs}`);

  const zip = readFileSync(abs);
  const xml = findZipEntry(zip, 'data.xml').toString('utf8');

  const records = [];
  const recordRe = /<record\b[^>]*>([\s\S]*?)<\/record>/g;
  const fieldRe = /<field\s+name="([^"]+)"\s+value="([^"]*)"\s*\/?\s*>/g;

  let rm;
  while ((rm = recordRe.exec(xml)) !== null) {
    const body = rm[1];
    const map = {};
    let fm;
    while ((fm = fieldRe.exec(body)) !== null) {
      map[fm[1]] = fm[2];
    }
    records.push(map);
  }

  return records;
}

function normalizeGuid(value) {
  if (!value) return '';
  return String(value).replace(/[{}]/g, '').trim().toLowerCase();
}

function computeSnapshot(projectRecs, assetRecs, activityRecs, dateKey) {
  const assetToProject = new Map();
  for (const asset of assetRecs) {
    const assetId = normalizeGuid(asset.cr809_assetid);
    const projectId = normalizeGuid(asset.cr809_project);
    if (assetId && projectId) assetToProject.set(assetId, projectId);
  }

  const today = new Date(`${dateKey}T00:00:00.000Z`);
  const nowMs = today.getTime();

  const activities = activityRecs.map((r) => {
    const start = toDate(r.cr809_startdate);
    const end = toDate(r.cr809_enddate);
    const status = String(r.cr809_status ?? '');
    const progress = toNum(r.cr809_progress, 0);
    const isVendor = toNum(r.cr809_isvendoractivity, 0) === 1;
    const projectId = normalizeGuid(r.cr809_project) || assetToProject.get(normalizeGuid(r.cr809_asset)) || '';

    return {
      start,
      end,
      status,
      progress,
      isVendor,
      projectId,
    };
  });

  const completedCode = '804270002';
  const blockedCode = '804270003';

  const atRisk = activities.filter((a) => {
    if (a.status === completedCode) return false;
    if (!a.start || !a.end) return false;
    const s = a.start.getTime();
    const e = a.end.getTime();
    if (e <= s) return false;
    const elapsed = Math.min(1, Math.max(0, (nowMs - s) / (e - s)));
    if (elapsed <= 0) return false;
    return a.progress / 100 < elapsed;
  }).length;

  const onTrackPct = activities.length > 0
    ? Math.round(((activities.length - atRisk) / activities.length) * 100)
    : 100;
  const blockedCount = activities.filter((a) => a.status === blockedCode).length;
  const vendorCount = activities.filter((a) => a.isVendor).length;

  const projectRiskDays = new Map();
  const projectBlocked = new Map();

  for (const activity of activities) {
    if (!activity.projectId || !activity.start || !activity.end) continue;
    if (activity.status === blockedCode) {
      projectBlocked.set(activity.projectId, (projectBlocked.get(activity.projectId) ?? 0) + 1);
    }

    if (activity.status === completedCode) continue;

    const s = activity.start.getTime();
    const e = activity.end.getTime();
    if (e <= s) continue;

    const elapsed = Math.min(1, Math.max(0, (nowMs - s) / (e - s)));
    if (elapsed <= 0) continue;

    const progress = Math.min(1, Math.max(0, activity.progress / 100));
    const variance = Math.max(0, elapsed - progress);
    const durationDays = Math.max(1, Math.round((e - s) / 86400000));

    const next = (projectRiskDays.get(activity.projectId) ?? 0) + variance * durationDays;
    projectRiskDays.set(activity.projectId, next);
  }

  let criticalDelayDays = 0;
  for (const rec of projectRecs) {
    const projectId = normalizeGuid(rec.cr809_projectid);
    if (!projectId) continue;

    const riskDays = projectRiskDays.get(projectId) ?? 0;
    const blocked = projectBlocked.get(projectId) ?? 0;
    const projectedSlip = Math.max(0, Math.round(riskDays * 0.7 + blocked * 0.75));
    if (projectedSlip > criticalDelayDays) criticalDelayDays = projectedSlip;
  }

  return {
    dateKey,
    onTrackPct,
    blockedCount,
    vendorCount,
    criticalDelayDays,
  };
}

function loadHistory(path) {
  const abs = resolve(path);
  if (!existsSync(abs)) return [];

  try {
    const text = readFileSync(abs, 'utf8');
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function main() {
  const projectsZip = argValue('projectsZip', 'scripts/dataverse-schema/projects_enrich_audit_export.zip');
  const assetsZip = argValue('assetsZip', 'scripts/dataverse-schema/assets_enrich_audit_export.zip');
  const activitiesZip = argValue('activitiesZip', 'scripts/dataverse-schema/activities_enrich_audit_export.zip');
  const out = argValue('out', 'public/insights/trend-history.json');
  const maxPoints = Math.max(7, toNum(argValue('maxPoints', '180'), 180));
  const dateKey = argValue('date', new Date().toISOString().slice(0, 10));

  const projectRecs = loadDataXmlRecords(projectsZip);
  const assetRecs = loadDataXmlRecords(assetsZip);
  const activityRecs = loadDataXmlRecords(activitiesZip);

  const snapshot = computeSnapshot(projectRecs, assetRecs, activityRecs, dateKey);
  const current = loadHistory(out);

  const mergedMap = new Map();
  for (const row of [...current, snapshot]) {
    if (!row || typeof row.dateKey !== 'string') continue;
    mergedMap.set(row.dateKey, row);
  }

  const merged = [...mergedMap.values()]
    .sort((a, b) => String(a.dateKey).localeCompare(String(b.dateKey)))
    .slice(-maxPoints);

  const outAbs = resolve(out);
  if (!existsSync(dirname(outAbs))) mkdirSync(dirname(outAbs), { recursive: true });
  writeFileSync(outAbs, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');

  process.stdout.write(`Trend snapshot updated: ${outAbs}\n`);
  process.stdout.write(`Date: ${snapshot.dateKey}, OnTrack: ${snapshot.onTrackPct}%, Blocked: ${snapshot.blockedCount}, Vendor: ${snapshot.vendorCount}, CriticalDelayDays: ${snapshot.criticalDelayDays}\n`);
}

main();
