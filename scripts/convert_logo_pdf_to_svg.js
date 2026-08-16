const fs = require('fs');
const path = require('path');

const pdfTxtPath = path.join(__dirname, '..', 'pdf_all_commands.txt');
if (!fs.existsSync(pdfTxtPath)) {
  console.error('pdf_all_commands.txt not found!');
  process.exit(1);
}

const pdfTxt = fs.readFileSync(pdfTxtPath, 'utf8');

function convertPdfToSvg(pdf) {
  const lines = pdf.split('\n');
  let svgPaths = [];
  let currentPath = '';
  let fill = '#CEA355';

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    const parts = line.split(/\s+/);
    const cmd = parts[parts.length - 1];
    const args = parts.slice(0, -1).map(Number);

    if (cmd === 'm') {
      currentPath += 'M ' + args[0] + ' ' + args[1] + ' ';
    } else if (cmd === 'l') {
      currentPath += 'L ' + args[0] + ' ' + args[1] + ' ';
    } else if (cmd === 'c') {
      currentPath += 'C ' + args[0] + ' ' + args[1] + ', ' + args[2] + ' ' + args[3] + ', ' + args[4] + ' ' + args[5] + ' ';
    } else if (cmd === 'v') {
      currentPath += 'C ' + args[0] + ' ' + args[1] + ', ' + args[0] + ' ' + args[1] + ', ' + args[2] + ' ' + args[3] + ' ';
    } else if (cmd === 'y') {
      currentPath += 'C ' + args[0] + ' ' + args[1] + ', ' + args[2] + ' ' + args[3] + ', ' + args[2] + ' ' + args[3] + ' ';
    } else if (cmd === 'h') {
      currentPath += 'Z ';
    } else if (cmd === 're') {
      // Ignore background rect covering entire 244x244
      if (args[2] >= 240 && args[3] >= 240) {
        currentPath = '';
        continue;
      }
      currentPath += 'M ' + args[0] + ' ' + args[1] + ' h ' + args[2] + ' v ' + args[3] + ' h -' + args[2] + ' Z ';
    } else if (cmd === 'f' || cmd === 'f*' || cmd === 'F') {
      if (currentPath) {
        // Ignore full background box paths
        if (!currentPath.includes('M 0 0 h 244.041 v 244.041')) {
          const fillRule = cmd === 'f*' ? 'evenodd' : 'nonzero';
          svgPaths.push('<path d="' + currentPath.trim() + '" fill="' + fill + '" fill-rule="' + fillRule + '" />');
        }
        currentPath = '';
      }
    } else if (cmd === 'g') {
      const v = Math.round(args[0] * 255);
      fill = 'rgb(' + v + ',' + v + ',' + v + ')';
    } else if (cmd === 'rg') {
      fill = 'rgb(' + Math.round(args[0]*255) + ',' + Math.round(args[1]*255) + ',' + Math.round(args[2]*255) + ')';
    } else if (cmd === 'scn' || cmd === 'SCN') {
      fill = 'url(#bareeqGold)';
    }
  }

  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="20 95 205 55" width="100%" height="100%">\n' +
  '  <defs>\n' +
  '    <linearGradient id="bareeqGold" x1="0%" y1="0%" x2="100%" y2="100%">\n' +
  '      <stop offset="0%" stop-color="#F5E4B5" />\n' +
  '      <stop offset="40%" stop-color="#CEA355" />\n' +
  '      <stop offset="80%" stop-color="#B5883F" />\n' +
  '      <stop offset="100%" stop-color="#8A6321" />\n' +
  '    </linearGradient>\n' +
  '  </defs>\n' +
  '  <g transform="scale(1, -1) translate(0, -244)">\n    ' +
  svgPaths.join('\n    ') + '\n  </g>\n' +
  '</svg>';
}

const svg = convertPdfToSvg(pdfTxt);
const svgPath1 = path.join(__dirname, '..', 'public', 'images', 'bareeq_official_logo.svg');
const svgPath2 = path.join(__dirname, '..', 'public', 'logo.svg');

fs.writeFileSync(svgPath1, svg);
fs.writeFileSync(svgPath2, svg);
console.log('Successfully generated transparent vector SVG logo! Size:', svg.length);
