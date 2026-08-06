const sharp = require('sharp');
const path = require('path');

async function processHeroBg() {
  const inputPath = path.join(__dirname, '../public/images/bareeq_user_bmw_hero_bg.png');
  
  // 1. Get original image metadata and raw buffer
  const image = sharp(inputPath);
  const metadata = await image.metadata();
  const { width, height } = metadata;
  
  console.log(`Original image dimensions: ${width}x${height}`);

  // 2. Create a widescreen 16:9 canvas (1920 x 1080)
  const targetWidth = 1920;
  const targetHeight = 1080;

  // Resize original image proportionally to height 1080
  const resizedOriginal = await sharp(inputPath)
    .resize({ height: targetHeight, fit: 'contain' })
    .toBuffer();

  const resizedMeta = await sharp(resizedOriginal).metadata();
  console.log(`Resized original: ${resizedMeta.width}x${resizedMeta.height}`);

  // 3. Create alpha gradient overlay to fade the right edge of the car studio image seamlessly into black
  // Create an SVG gradient mask overlay
  const maskSvg = `
    <svg width="${targetWidth}" height="${targetHeight}">
      <defs>
        <linearGradient id="fadeRight" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#000" stop-opacity="0" />
          <stop offset="55%" stop-color="#000" stop-opacity="0" />
          <stop offset="85%" stop-color="#000" stop-opacity="0.8" />
          <stop offset="100%" stop-color="#000" stop-opacity="1" />
        </linearGradient>
        <linearGradient id="fadeLeft" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#000" stop-opacity="0.8" />
          <stop offset="5%" stop-color="#000" stop-opacity="0" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${targetWidth}" height="${targetHeight}" fill="url(#fadeRight)" />
      <rect x="0" y="0" width="${targetWidth}" height="${targetHeight}" fill="url(#fadeLeft)" />
    </svg>
  `;

  // 4. Composite resized image onto 1920x1080 black canvas with smooth edge blending
  const finalImageBuffer = await sharp({
    create: {
      width: targetWidth,
      height: targetHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 }
    }
  })
  .composite([
    {
      input: resizedOriginal,
      top: 0,
      left: 0
    },
    {
      input: Buffer.from(maskSvg),
      top: 0,
      left: 0
    }
  ])
  .png({ quality: 100 })
  .toBuffer();

  const outputPath = path.join(__dirname, '../public/images/bareeq_user_bmw_hero_bg_processed.png');
  await sharp(finalImageBuffer).toFile(outputPath);
  console.log('Successfully created widescreen 1920x1080 hero background at ' + outputPath);
}

processHeroBg().catch(console.error);
