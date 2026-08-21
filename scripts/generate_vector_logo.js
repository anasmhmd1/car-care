const potrace = require('potrace');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function createPureVector() {
  const inputPng = 'C:/Users/Hamza/.gemini/antigravity-ide/brain/1130ec83-0328-41fd-b549-c9e719e217da/.user_uploaded/media_1786980363648.png';
  const tempInput = path.join(__dirname, '../public/images/temp_pure_trace.png');

  // Resize to 4500px width with lanczos3 for maximum crisp curve tracing
  const { data, info } = await sharp(inputPng)
    .resize(4500, null, { kernel: sharp.kernel.lanczos3 })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bwBuffer = Buffer.alloc(info.width * info.height);
  for (let i = 0; i < info.width * info.height; i++) {
    const a = data[i * 4 + 3];
    bwBuffer[i] = a > 40 ? 0 : 255;
  }

  await sharp(bwBuffer, {
    raw: { width: info.width, height: info.height, channels: 1 }
  }).png().toFile(tempInput);

  potrace.trace(tempInput, {
    optCurve: true,
    alphaMax: 1.0,
    turdSize: 2,
    optTolerance: 0.1
  }, async (err, svg) => {
    if (err) {
      console.error('Potrace error:', err);
      return;
    }

    // Exact radiant light-gold gradient matching user's exact original colors (#faecd0, #eed08c, #dfbb73, #d2a85c)
    const defs = `
  <defs>
    <linearGradient id="bareeqGoldVector" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#faecd0" />
      <stop offset="25%" stop-color="#eed08c" />
      <stop offset="50%" stop-color="#e8c884" />
      <stop offset="75%" stop-color="#dfbb73" />
      <stop offset="100%" stop-color="#d4aa5b" />
    </linearGradient>
  </defs>`;

    let pureVectorSvg = svg.replace(/<svg([^>]*)>/, `<svg$1>${defs}`);
    pureVectorSvg = pureVectorSvg.replace(/fill="#[0-9a-fA-F]+"/g, 'fill="url(#bareeqGoldVector)"');

    const targetSvg1 = path.join(__dirname, '../public/images/bareeq_official_logo.svg');
    const targetSvg2 = path.join(__dirname, '../public/logo.svg');

    fs.writeFileSync(targetSvg1, pureVectorSvg, 'utf8');
    fs.writeFileSync(targetSvg2, pureVectorSvg, 'utf8');
    console.log('Saved pure vector SVG with exact radiant gold gradient!');

    if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);

    const render = await sharp(targetSvg1).resize(1200).png().toBuffer();
    console.log('Rendered pure vector test PNG, bytes:', render.length);
  });
}

createPureVector().catch(console.error);
