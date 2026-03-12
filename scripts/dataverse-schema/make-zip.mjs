// Creates AddProgressColumn.zip in the same directory
import { createWriteStream } from 'fs';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const out = join(__dir, 'AddProgressColumn.zip');

function crc32(buf) {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c;
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function u16le(v) { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; }
function u32le(v) { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; }

function localHeader(name, data) {
  const n = Buffer.from(name, 'utf8');
  return Buffer.concat([
    u32le(0x04034B50), u16le(20), u16le(0), u16le(0), u16le(0), u16le(0),
    u32le(crc32(data)), u32le(data.length), u32le(data.length),
    u16le(n.length), u16le(0), n
  ]);
}

function centralRecord(name, data, offset) {
  const n = Buffer.from(name, 'utf8');
  return Buffer.concat([
    u32le(0x02014B50), u16le(20), u16le(20), u16le(0), u16le(0), u16le(0), u16le(0),
    u32le(crc32(data)), u32le(data.length), u32le(data.length),
    u16le(n.length), u16le(0), u16le(0), u16le(0), u16le(0), u32le(0),
    u32le(offset), n
  ]);
}

const files = [
  ['[Content_Types].xml', readFileSync(join(__dir, '[Content_Types].xml'))],
  ['solution.xml',        readFileSync(join(__dir, 'solution.xml'))],
  ['customizations.xml',  readFileSync(join(__dir, 'customizations.xml'))],
];

const parts = [];
const dirs = [];
let offset = 0;

for (const [name, data] of files) {
  const hdr = localHeader(name, data);
  dirs.push(centralRecord(name, data, offset));
  offset += hdr.length + data.length;
  parts.push(hdr, Buffer.from(data));
}

const cd = Buffer.concat(dirs);
const eocd = Buffer.concat([
  u32le(0x06054B50), u16le(0), u16le(0),
  u16le(files.length), u16le(files.length),
  u32le(cd.length), u32le(offset),
  u16le(0)
]);

const ws = createWriteStream(out);
for (const p of [...parts, cd, eocd]) ws.write(p);
ws.end(() => console.log('Created:', out));
