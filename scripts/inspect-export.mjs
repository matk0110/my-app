// Quick inspection of the exported data.xml
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

const zipBuf = readFileSync('scripts/dataverse-schema/activities_export.zip');

// Find EOCD
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

  const lnLen  = zipBuf.readUInt16LE(localOff + 26);
  const leLen  = zipBuf.readUInt16LE(localOff + 28);
  const dStart = localOff + 30 + lnLen + leLen;
  const raw    = zipBuf.slice(dStart, dStart + compSize);
  const data   = method === 0 ? raw : inflateRawSync(raw);
  const xml    = data.toString('utf8');

  console.log(`\n=== FILE: ${name} (${data.length} bytes) ===`);
  // Print first 3000 chars
  console.log(xml.slice(0, 3000));
}
