const { app, BrowserWindow } = require('electron');
const { readFileSync, writeFileSync, mkdirSync, copyFileSync } = require('node:fs');
const path = require('node:path');
const { repo, icons } = JSON.parse(process.argv[2]);
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await window.loadURL('data:text/html,<!doctype html>');
    const sizes = [16, 24, 32, 48, 64, 128, 256];
    const frames = [];
    const output = path.join(repo, 'apps/desktop/build/icons');
    mkdirSync(output, { recursive: true });
    for (const size of sizes) {
      const svg = readFileSync(path.join(repo, size <= 32 ? icons.smallSvg : icons.svg), 'utf8');
      const result = await window.webContents.executeJavaScript(`(async () => {
        const size = ${size}, svg = ${JSON.stringify(svg)};
        async function render(source) {
          const img = new Image(); img.src = 'data:image/svg+xml;base64,' + btoa(source); await img.decode();
          const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
          const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, size, size);
          return { png: canvas.toDataURL('image/png').split(',')[1], pixels: ctx.getImageData(0, 0, size, size).data };
        }
        const masked = await render(svg), solid = await render(svg.replace(/ mask="[^"]*"/g, ''));
        let gaps = 0;
        for (let i = 3; i < masked.pixels.length; i += 4) if (solid.pixels[i] - masked.pixels[i] > 32) gaps++;
        if (gaps < 3) throw Error('Luminance-mask gaps lost at ' + size + 'px');
        return { png: masked.png, gaps };
      })()`);
      const png = Buffer.from(result.png, 'base64'); frames.push(png);
      writeFileSync(path.join(output, `${size}.png`), png);
      console.log(`${size}px: ${result.gaps} mask-gap pixels preserved`);
    }
    const header = Buffer.alloc(6 + sizes.length * 16); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
    let offset = header.length;
    sizes.forEach((size, i) => {
      const entry = 6 + i * 16; header[entry] = header[entry + 1] = size % 256;
      header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
      header.writeUInt32LE(frames[i].length, entry + 8); header.writeUInt32LE(offset, entry + 12); offset += frames[i].length;
    });
    const destination = path.join(repo, icons.ico); mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, Buffer.concat([header, ...frames]));
    copyFileSync(destination, path.join(repo, 'apps/editor/public/favicon.ico'));
  } finally { window.destroy(); }
}).then(() => app.quit()).catch(error => { console.error(error); app.exit(1); });
