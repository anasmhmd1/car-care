const potrace = require('potrace');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function buildVectorLogo() {
  const inputPng = 'C:/Users/Hamza/.gemini/antigravity-ide/brain/1130ec83-0328-41fd-b549-c9e719e217da/.user_uploaded/media_1786980363648.png';
  const width = 4500;
  const height = 990;

  console.log('Reading input image...');
  const { data, info } = await sharp(inputPng)
    .resize(width, height, { kernel: sharp.kernel.lanczos3 })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const goldMask = Buffer.alloc(info.width * info.height);
  const whiteMask = Buffer.alloc(info.width * info.height);

  for (let i = 0; i < info.width * info.height; i++) {
    const idx = i * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const a = data[idx + 3];

    if (a < 60) {
      goldMask[i] = 255;
      whiteMask[i] = 255;
    } else {
      // White typography detection vs gold emblem
      const isWhite = (r > 195 && g > 195 && b > 195 && Math.abs(r - g) < 30 && Math.abs(g - b) < 30);
      if (isWhite) {
        whiteMask[i] = 0;
        goldMask[i] = 255;
      } else {
        goldMask[i] = 0;
        whiteMask[i] = 255;
      }
    }
  }

  const tempGoldPng = path.join(__dirname, 'temp_gold.png');
  const tempWhitePng = path.join(__dirname, 'temp_white.png');

  await sharp(goldMask, { raw: { width: info.width, height: info.height, channels: 1 } }).png().toFile(tempGoldPng);
  await sharp(whiteMask, { raw: { width: info.width, height: info.height, channels: 1 } }).png().toFile(tempWhitePng);

  function trace(file) {
    return new Promise((resolve, reject) => {
      potrace.trace(file, {
        optCurve: true,
        alphaMax: 1.0,
        turdSize: 2,
        optTolerance: 0.1
      }, (err, svg) => {
        if (err) reject(err);
        else resolve(svg);
      });
    });
  }

  console.log('Tracing vector layers with Potrace...');
  const [goldSvg, whiteSvg] = await Promise.all([trace(tempGoldPng), trace(tempWhitePng)]);

  // Clean temp files
  if (fs.existsSync(tempGoldPng)) fs.unlinkSync(tempGoldPng);
  if (fs.existsSync(tempWhitePng)) fs.unlinkSync(tempWhitePng);

  const goldMatch = goldSvg.match(/<path\s+[^>]*d="([^"]+)"/i);
  const whiteMatch = whiteSvg.match(/<path\s+[^>]*d="([^"]+)"/i);

  if (!goldMatch || !whiteMatch) {
    throw new Error('Failed to match path elements');
  }

  const finalSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" version="1.1">
  <defs>
    <linearGradient id="bareeqGold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#faecd0" />
      <stop offset="25%" stop-color="#eed08c" />
      <stop offset="50%" stop-color="#e8c884" />
      <stop offset="75%" stop-color="#dfbb73" />
      <stop offset="100%" stop-color="#d4aa5b" />
    </linearGradient>
  </defs>
  <path fill="url(#bareeqGold)" fill-rule="evenodd" d="${goldMatch[1]}" />
  <path fill="#FFFFFF" fill-rule="evenodd" d="${whiteMatch[1]}" />
</svg>
`;

  const target1 = path.join(__dirname, '../public/images/bareeq_official_logo.svg');
  const target2 = path.join(__dirname, '../public/logo.svg');

  fs.writeFileSync(target1, finalSvg, 'utf8');
  fs.writeFileSync(target2, finalSvg, 'utf8');
  console.log('Saved vector SVG to:', target1, 'and', target2);

  // Validate rendering and also save high quality PNG backups if needed by SEO/OG
  const targetPng = path.join(__dirname, '../public/images/bareeq_official_logo.png');
  const targetPngHd = path.join(__dirname, '../public/images/bareeq_official_logo_hd.png');
  const targetLogoPng = path.join(__dirname, '../public/logo.png');

  await sharp(Buffer.from(finalSvg)).resize(1200).png().toFile(targetPng);
  await sharp(Buffer.from(finalSvg)).resize(2400).png().toFile(targetPngHd);
  await sharp(Buffer.from(finalSvg)).resize(1200).png().toFile(targetLogoPng);

  console.log('Successfully generated pure vector SVG and matching PNGs!');
}

buildVectorLogo().catch(console.error);
