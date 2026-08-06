const sharp = require('sharp');
const path = require('path');

async function fixFloorReflection() {
  const originalSource = 'C:\\Users\\Hamza\\.gemini\\antigravity-ide\\brain\\fd4eaeb1-8153-435e-ba23-84fe283035c3\\bareeq_user_bmw_hero_bg_1786026909079.png';
  const outputPath = path.join(__dirname, '../public/images/bareeq_user_bmw_hero_bg_faded.png');
  
  const metadata = await sharp(originalSource).metadata();
  const width = metadata.width; // 1024
  const height = metadata.height; // 1024

  console.log(`Original Image size: ${width}x${height}`);

  // Specifically target ONLY the floor reflection light area on the right (x: 780 to 1024, y: 420 to 750)
  // We use a linear gradient for the lower half of the right side so the floor light reflection fades seamlessly before hitting x=1024.
  const svgOverlay = `
    <svg width="${width}" height="${height}">
      <defs>
        <!-- Floor Reflection Gradient: Fades floor light reflection on the right from x=760 to 1024 -->
        <linearGradient id="floorReflectionFade" x1="760" y1="0" x2="1024" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#000000" stop-opacity="0" />
          <stop offset="35%" stop-color="#000000" stop-opacity="0.3" />
          <stop offset="70%" stop-color="#000000" stop-opacity="0.8" />
          <stop offset="100%" stop-color="#000000" stop-opacity="1" />
        </linearGradient>
        <!-- Very subtle upper right wall fade for overall harmony -->
        <linearGradient id="wallRightFade" x1="900" y1="0" x2="1024" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#000000" stop-opacity="0" />
          <stop offset="100%" stop-color="#000000" stop-opacity="0.9" />
        </linearGradient>
      </defs>

      <!-- Upper right wall fade (y: 0 to 420, x: 900 to 1024) -->
      <rect x="900" y="0" width="124" height="420" fill="url(#wallRightFade)" />

      <!-- Lower right floor reflection fade (y: 420 to 1024, x: 760 to 1024) -->
      <rect x="760" y="420" width="264" height="604" fill="url(#floorReflectionFade)" />
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

  console.log('Successfully fixed floor reflection right-edge cutoff at ' + outputPath);
}

fixFloorReflection().catch(console.error);
