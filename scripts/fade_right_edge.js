const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function fadeRightEdge() {
  const originalSource = 'C:\\Users\\Hamza\\.gemini\\antigravity-ide\\brain\\fd4eaeb1-8153-435e-ba23-84fe283035c3\\bareeq_user_bmw_hero_bg_1786026909079.png';
  const outputPath = path.join(__dirname, '../public/images/bareeq_user_bmw_hero_bg_faded.png');
  
  const metadata = await sharp(originalSource).metadata();
  const width = metadata.width; // 1024
  const height = metadata.height; // 1024

  console.log(`Original Image size: ${width}x${height}`);

  // Fade ONLY the far right edge (last 140px, x=884 to 1024) so the studio image stays 100% bright
  const fadeStartPixel = 884; 
  const fadeEndPixel = 1024;
  
  const svgOverlay = `
    <svg width="${width}" height="${height}">
      <defs>
        <linearGradient id="rightEdgeFade" x1="${fadeStartPixel}" y1="0" x2="${fadeEndPixel}" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#000000" stop-opacity="0" />
          <stop offset="40%" stop-color="#000000" stop-opacity="0.4" />
          <stop offset="85%" stop-color="#000000" stop-opacity="0.9" />
          <stop offset="100%" stop-color="#000000" stop-opacity="1" />
        </linearGradient>
      </defs>
      <!-- Gradient rect only at far right edge (884px to 1024px) -->
      <rect x="${fadeStartPixel}" y="0" width="${fadeEndPixel - fadeStartPixel}" height="${height}" fill="url(#rightEdgeFade)" />
    </svg>
  `;

  await sharp(originalSource)
    .composite([
      {
        input: Buffer.from(svgOverlay),
        top: 0,
        left: 0
      }
    ])
    .png({ quality: 100 })
    .toFile(outputPath);

  console.log('Successfully created seamless right-edge faded image at ' + outputPath);
}

fadeRightEdge().catch(console.error);
