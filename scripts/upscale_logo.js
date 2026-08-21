const sharp = require('sharp');
const path = require('path');

async function upscale() {
  const inputPath = path.join(__dirname, '../public/images/bareeq_official_logo.png');
  const outputPath = path.join(__dirname, '../public/images/bareeq_official_logo_hd.png');
  
  const img = sharp(inputPath);
  const metadata = await img.metadata();
  console.log('Original dimensions:', metadata.width, 'x', metadata.height);

  // Target 8x resolution: 2400 x 528
  const targetWidth = 2400;
  const targetHeight = Math.round((metadata.height / metadata.width) * targetWidth);

  await sharp(inputPath)
    .resize(targetWidth, targetHeight, {
      kernel: sharp.kernel.lanczos3,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .sharpen({
      sigma: 1.5,
      m1: 1.2,
      m2: 2.0
    })
    .png({
      compressionLevel: 9,
      adaptiveFiltering: true,
      quality: 100
    })
    .toFile(outputPath);

  const outMeta = await sharp(outputPath).metadata();
  console.log('Upscaled HD dimensions:', outMeta.width, 'x', outMeta.height);
}

upscale().catch(console.error);
