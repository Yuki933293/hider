// Convert PNG to ICO format (pure Node.js, no dependencies)
// ICO is just a container wrapping PNG data
// Usage: node scripts/png-to-ico.js

const fs = require('fs');
const path = require('path');

const buildDir = path.join(__dirname, '..', 'build');
const pngPath = path.join(buildDir, 'icon.png');

// Generate multiple sizes from the 1024px source using sips
const sizes = [256, 128, 64, 48, 32, 16];
const tmpPngs = [];

const { execSync } = require('child_process');

for (const size of sizes) {
  const tmp = path.join(buildDir, `_tmp_${size}.png`);
  execSync(`sips -z ${size} ${size} "${pngPath}" --out "${tmp}" 2>/dev/null`);
  tmpPngs.push({ size, path: tmp, data: fs.readFileSync(tmp) });
}

// Build ICO file
const numImages = tmpPngs.length;
const headerSize = 6;
const dirEntrySize = 16;
const dataOffset = headerSize + dirEntrySize * numImages;

// Header: reserved(2) + type(2, ICO=1) + count(2)
const header = Buffer.alloc(headerSize);
header.writeUInt16LE(0, 0);      // reserved
header.writeUInt16LE(1, 2);      // type = ICO
header.writeUInt16LE(numImages, 4);

// Directory entries + image data
const dirEntries = [];
let currentOffset = dataOffset;

for (const img of tmpPngs) {
  const entry = Buffer.alloc(dirEntrySize);
  const w = img.size >= 256 ? 0 : img.size; // 0 means 256
  const h = img.size >= 256 ? 0 : img.size;
  entry.writeUInt8(w, 0);          // width
  entry.writeUInt8(h, 1);          // height
  entry.writeUInt8(0, 2);          // color palette
  entry.writeUInt8(0, 3);          // reserved
  entry.writeUInt16LE(1, 4);       // color planes
  entry.writeUInt16LE(32, 6);      // bits per pixel
  entry.writeUInt32LE(img.data.length, 8);  // image size
  entry.writeUInt32LE(currentOffset, 12);   // data offset
  dirEntries.push(entry);
  currentOffset += img.data.length;
}

const ico = Buffer.concat([
  header,
  ...dirEntries,
  ...tmpPngs.map(img => img.data)
]);

const icoPath = path.join(buildDir, 'icon.ico');
fs.writeFileSync(icoPath, ico);

// Cleanup temp files
for (const img of tmpPngs) {
  fs.unlinkSync(img.path);
}

console.log(`ICO written to ${icoPath} (${sizes.join(', ')}px, ${(ico.length / 1024).toFixed(0)}KB)`);
