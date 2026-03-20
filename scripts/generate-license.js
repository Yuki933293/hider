#!/usr/bin/env node
// License key generator for Hider Pro
// Usage: node scripts/generate-license.js [count]
// Keep this script private — do not distribute

const LICENSE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LICENSE_SALT = 'HiderPro2026';

function computeChecksum(payload) {
  let hash = 5381;
  const str = LICENSE_SALT + payload;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xFFFFFFFF;
  }
  hash = hash >>> 0;
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += LICENSE_CHARS[hash % LICENSE_CHARS.length];
    hash = Math.floor(hash / LICENSE_CHARS.length);
  }
  return result;
}

function randomSegment() {
  let seg = '';
  for (let i = 0; i < 5; i++) {
    seg += LICENSE_CHARS[Math.floor(Math.random() * LICENSE_CHARS.length)];
  }
  return seg;
}

function generateKey() {
  const s1 = randomSegment();
  const s2 = randomSegment();
  const s3 = randomSegment();
  const payload = s1 + s2 + s3;
  const s4 = computeChecksum(payload);
  return `HIDER-${s1}-${s2}-${s3}-${s4}`;
}

const count = parseInt(process.argv[2]) || 1;
for (let i = 0; i < count; i++) {
  console.log(generateKey());
}
