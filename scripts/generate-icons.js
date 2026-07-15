import sharp from 'sharp';
import { readFileSync } from 'fs';

const svgBuffer = readFileSync('./public/favicon.svg');

// Apple touch icon
sharp(svgBuffer)
  .resize(180, 180)
  .png()
  .toFile('./public/apple-touch-icon.png')
  .then(() => console.log('apple-touch-icon.png created'));

// PWA icons
sharp(svgBuffer)
  .resize(192, 192)
  .png()
  .toFile('./public/pwa-192x192.png');

sharp(svgBuffer)
  .resize(512, 512)
  .png()
  .toFile('./public/pwa-512x512.png');