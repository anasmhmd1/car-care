const fs = require('fs');
const path = require('path');

// New logo uploaded by user (300x66 transparent PNG)
const newLogoSrc = 'C:/Users/Hamza/.gemini/antigravity/brain/797c9a2f-d842-4155-b3f3-25f6b76b79dd/.user_uploaded/media__1786561229904.png';

const rootAssetInput = path.join(__dirname, '..', 'Asset_6_logo_input.png');
const targetPng1 = path.join(__dirname, '..', 'public', 'logo.png');
const targetPng2 = path.join(__dirname, '..', 'public', 'images', 'bareeq_official_logo.png');
const targetSvg1 = path.join(__dirname, '..', 'public', 'logo.svg');
const targetSvg2 = path.join(__dirname, '..', 'public', 'images', 'bareeq_official_logo.svg');

if (!fs.existsSync(newLogoSrc)) {
  console.error('New uploaded logo PNG not found at:', newLogoSrc);
  process.exit(1);
}

// 1. Overwrite root Asset_6_logo_input.png with new logo
fs.copyFileSync(newLogoSrc, rootAssetInput);

// 2. Overwrite public PNG logos
fs.copyFileSync(newLogoSrc, targetPng1);
fs.copyFileSync(newLogoSrc, targetPng2);

// 3. Generate clean SVG wrapper with the exact 300x66 viewBox matching the new transparent logo
const pngBuf = fs.readFileSync(newLogoSrc);
const base64Png = pngBuf.toString('base64');
const dataUri = 'data:image/png;base64,' + base64Png;

const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 66" width="100%" height="100%">
  <image href="${dataUri}" width="300" height="66" />
</svg>`;

fs.writeFileSync(targetSvg1, svgContent);
fs.writeFileSync(targetSvg2, svgContent);

console.log('Successfully replaced ALL old logo files with the user\'s new modified logo (300x66)!');
