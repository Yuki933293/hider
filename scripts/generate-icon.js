// Generate app icon using Node.js + Electron's nativeImage
// Run: node scripts/generate-icon.js
// Produces: build/icon.png (1024x1024)

const fs = require('fs');
const path = require('path');

// Create a 1024x1024 PNG icon using raw pixel data
// We'll create an SVG first, then use sips to convert

const size = 1024;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea"/>
      <stop offset="100%" style="stop-color:#764ba2"/>
    </linearGradient>
    <linearGradient id="book" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#ffffff;stop-opacity:0.95"/>
      <stop offset="100%" style="stop-color:#e8e8f0;stop-opacity:0.9"/>
    </linearGradient>
  </defs>
  <!-- Rounded square background -->
  <rect width="${size}" height="${size}" rx="220" ry="220" fill="url(#bg)"/>

  <!-- Book shape - left page -->
  <path d="M300 280 Q512 320 512 320 L512 750 Q512 750 300 710 Z"
        fill="url(#book)" opacity="0.9"/>
  <!-- Book shape - right page -->
  <path d="M724 280 Q512 320 512 320 L512 750 Q512 750 724 710 Z"
        fill="url(#book)" opacity="0.85"/>
  <!-- Book spine -->
  <line x1="512" y1="310" x2="512" y2="750" stroke="rgba(102,126,234,0.3)" stroke-width="3"/>

  <!-- Text lines on left page -->
  <line x1="350" y1="400" x2="480" y2="408" stroke="rgba(102,126,234,0.25)" stroke-width="12" stroke-linecap="round"/>
  <line x1="350" y1="440" x2="460" y2="448" stroke="rgba(102,126,234,0.2)" stroke-width="12" stroke-linecap="round"/>
  <line x1="350" y1="480" x2="490" y2="488" stroke="rgba(102,126,234,0.15)" stroke-width="12" stroke-linecap="round"/>
  <line x1="350" y1="520" x2="440" y2="528" stroke="rgba(102,126,234,0.1)" stroke-width="12" stroke-linecap="round"/>

  <!-- Text lines on right page -->
  <line x1="544" y1="408" x2="674" y2="400" stroke="rgba(102,126,234,0.25)" stroke-width="12" stroke-linecap="round"/>
  <line x1="544" y1="448" x2="654" y2="440" stroke="rgba(102,126,234,0.2)" stroke-width="12" stroke-linecap="round"/>
  <line x1="544" y1="488" x2="684" y2="480" stroke="rgba(102,126,234,0.15)" stroke-width="12" stroke-linecap="round"/>

  <!-- "H" letter watermark -->
  <text x="512" y="260" text-anchor="middle" font-family="SF Pro Display, Helvetica Neue, Arial"
        font-size="120" font-weight="700" fill="rgba(255,255,255,0.35)" letter-spacing="-4">H</text>
</svg>`;

const buildDir = path.join(__dirname, '..', 'build');
const svgPath = path.join(buildDir, 'icon.svg');
const pngPath = path.join(buildDir, 'icon.png');

fs.writeFileSync(svgPath, svg);
console.log('SVG written to', svgPath);
console.log('Now run:');
console.log(`  sips -s format png "${svgPath}" --out "${pngPath}" -z 1024 1024`);
console.log(`  rm "${svgPath}"`);
