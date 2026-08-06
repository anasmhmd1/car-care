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

  // Fade right edge starting at x=480 (right behind car rear) to x=780 so mobile view (which crops at ~650-700px) is 100% black
  const fadeStartPixel = 480; 
  const fadeEndPixel = 780;
  
  const svgOverlay = `
    <svg width="${width}" height="${height}">
      <defs>
        <linearGradient id="rightEdgeFade" x1="${fadeStartPixel}" y1="0" x2="${fadeEndPixel}" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#000000" stop-opacity="0" />
          <stop offset="35%" stop-color="#000000" stop-opacity="0.5" />
          <stop offset="75%" stop-color="#000000" stop-opacity="0.92" />
          <stop offset="100%" stop-color="#000000" stop-opacity="1" />
        </linearGradient>
      </defs>
      <!-- Gradient rect from 480px to 780px -->
      <rect x="${fadeStartPixel}" y="0" width="${fadeEndPixel - fadeStartPixel}" height="${height}" fill="url(#rightEdgeFade)" />
      <!-- Solid black rect from 780px to 1024px -->
      <rect x="${fadeEndPixel}" y="0" width="${width - fadeEndPixel}" height="${height}" fill="#000000" />
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
