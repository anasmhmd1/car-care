const fs = require('fs');
const path = require('path');

const srcFile = 'C:/Users/Hamza/.gemini/antigravity-ide/brain/1130ec83-0328-41fd-b549-c9e719e217da/.user_uploaded/media_1786979062212.png';

const targetPng1 = path.join(__dirname, '..', 'public', 'images', 'bareeq_official_logo.png');
const targetPng2 = path.join(__dirname, '..', 'public', 'logo.png');
const targetSvg1 = path.join(__dirname, '..', 'public', 'images', 'bareeq_official_logo.svg');
const targetSvg2 = path.join(__dirname, '..', 'public', 'logo.svg');

// 1. Copy exact original file to PNG paths
fs.copyFileSync(srcFile, targetPng1);
fs.copyFileSync(srcFile, targetPng2);

// 2. Generate pure SVG containing the exact untouched original file data with zero modification
const buf = fs.readFileSync(srcFile);
const b64 = buf.toString('base64');
const dataUri = 'data:image/png;base64,' + b64;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 66" width="300" height="66">
  <image href="${dataUri}" width="300" height="66" preserveAspectRatio="xMidYMid meet" />
</svg>
`;

fs.writeFileSync(targetSvg1, svg, 'utf8');
fs.writeFileSync(targetSvg2, svg, 'utf8');

console.log('SUCCESS: Placed exact untouched logo into all targets!');
