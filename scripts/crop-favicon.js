const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const srcPath = path.resolve('public/favicon.png');
  const srcBase64 = fs.readFileSync(srcPath).toString('base64');
  const dataUri = `data:image/png;base64,${srcBase64}`;

  const croppedDataUrl = await page.evaluate(async (imgSrc) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        // 1. Dibujar la imagen original en un canvas para escanear los límites no transparentes
        const scanCanvas = document.createElement('canvas');
        scanCanvas.width = img.naturalWidth;
        scanCanvas.height = img.naturalHeight;
        const sctx = scanCanvas.getContext('2d');
        sctx.drawImage(img, 0, 0);

        const imgData = sctx.getImageData(0, 0, scanCanvas.width, scanCanvas.height);
        const data = imgData.data;

        let minX = scanCanvas.width, minY = scanCanvas.height, maxX = 0, maxY = 0;

        // Escanear píxeles con opacidad significativa
        for (let y = 0; y < scanCanvas.height; y++) {
          for (let x = 0; x < scanCanvas.width; x++) {
            const alpha = data[(y * scanCanvas.width + x) * 4 + 3];
            if (alpha > 30) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }

        // Enfocar fuertemente en el círculo principal y la silueta central (recortando márgenes)
        const cropW = maxX - minX;
        const cropH = maxY - minY;
        const size = Math.max(cropW, cropH);

        // 2. Crear un canvas cuadrado de alta resolución (128x128) donde el logo ocupe el 98% del espacio
        const outCanvas = document.createElement('canvas');
        outCanvas.width = 128;
        outCanvas.height = 128;
        const octx = outCanvas.getContext('2d');
        octx.imageSmoothingEnabled = true;
        octx.imageSmoothingQuality = 'high';

        // Centrar y maximizar
        const destX = (128 - (cropW / size) * 124) / 2;
        const destY = (128 - (cropH / size) * 124) / 2;
        const destW = (cropW / size) * 124;
        const destH = (cropH / size) * 124;

        octx.drawImage(scanCanvas, minX, minY, cropW, cropH, destX, destY, destW, destH);
        resolve(outCanvas.toDataURL('image/png'));
      };
      img.src = imgSrc;
    });
  }, dataUri);

  await browser.close();

  const base64Data = croppedDataUrl.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync('public/favicon.png', base64Data, 'base64');
  fs.writeFileSync('public/favicon.ico', base64Data, 'base64');
  fs.writeFileSync('favicon.png', base64Data, 'base64');
  fs.writeFileSync('favicon.ico', base64Data, 'base64');

  console.log('✅ Favicon recortado, maximizado y guardado con éxito!');
})();
