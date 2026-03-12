// Inspect dated records and list all unique field names
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

const zipBuf = readFileSync('scripts/dataverse-schema/activities_export.zip');
let eocd = -1;
for (let i = zipBuf.length - 22; i >= 0; i--) {
  if (zipBuf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
}
const cdTotal  = zipBuf.readUInt16LE(eocd + 10);
const cdOffset = zipBuf.readUInt32LE(eocd + 16);

let pos = cdOffset;
for (let i = 0; i < cdTotal; i++) {
  const method   = zipBuf.readUInt16LE(pos + 10);
  const compSize = zipBuf.readUInt32LE(pos + 20);
  const nameLen  = zipBuf.readUInt16LE(pos + 28);
  const extraLen = zipBuf.readUInt16LE(pos + 30);
  const commLen  = zipBuf.readUInt16LE(pos + 32);
  const localOff = zipBuf.readUInt32LE(pos + 42);
  const name     = zipBuf.toString('utf8', pos + 46, pos + 46 + nameLen);
  pos += 46 + nameLen + extraLen + commLen;

  if (!name.includes('data.xml')) continue;

  const lnLen  = zipBuf.readUInt16LE(localOff + 26);
  const leLen  = zipBuf.readUInt16LE(localOff + 28);
  const dStart = localOff + 30 + lnLen + leLen;
  const raw    = zipBuf.slice(dStart, dStart + compSize);
  const xml    = (method === 0 ? raw : inflateRawSync(raw)).toString('utf8');

  // Find records that have startdate
  const recRe = /<record([^>]*)>([\s\S]*?)<\/record>/g;
  const fieldRe = /<field\s+name="([^"]+)"\s+value="([^"]*)"/g;
  let m, datedCount = 0;

  while ((m = recRe.exec(xml)) !== null) {
    const body = m[2];
    if (!body.includes('cr809_startdate')) continue;
    datedCount++;
    if (datedCount <= 3) {
      console.log(`\n--- Dated record ${datedCount} ---`);
      console.log(m[0].trim().slice(0, 500));
    }
  }
  console.log(`\nTotal dated records: ${datedCount}`);

  // Also count records with each field name
  const fieldCounts = {};
  const allFieldRe = /<field\s+name="([^"]+)"/g;
  let f;
  while ((f = allFieldRe.exec(xml)) !== null) {
    fieldCounts[f[1]] = (fieldCounts[f[1]] ?? 0) + 1;
  }
  console.log('\nField occurrence counts:');
  for (const [k, v] of Object.entries(fieldCounts).sort((a,b) => b[1]-a[1])) {
    console.log(`  ${k}: ${v}`);
  }
}
