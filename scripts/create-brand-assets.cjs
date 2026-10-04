// Reproducible CleanTrack app icon: a white leaf on the brand green.
const fs = require('fs');
const { PNG } = require('pngjs');
function icon(size, transparent) {
  const out = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x / size - .5) * 2, v = (y / size - .5) * 2;
    const a = (u - v) / Math.SQRT2, b = (u + v) / Math.SQRT2;
    const leaf = Math.abs(a) < .56 && Math.abs(b) < .28 * (1 - (a / .56) ** 2);
    const vein = Math.abs(b) < .018 && a > -.62 && a < .45;
    const color = leaf && !vein ? [245, 255, 249, 255] : transparent ? [8, 127, 91, 0] : [8, 127, 91, 255];
    const i = (y * size + x) * 4; out.data.set(color, i);
  }
  return PNG.sync.write(out);
}
fs.writeFileSync('assets/images/cleantrack-icon.png', icon(1024, false));
fs.writeFileSync('assets/images/cleantrack-foreground.png', icon(1024, true));
fs.writeFileSync('assets/images/cleantrack-favicon.png', icon(64, false));
const config = JSON.parse(fs.readFileSync('app.json', 'utf8'));
config.expo.icon = './assets/images/cleantrack-icon.png';
config.expo.ios.icon = './assets/images/cleantrack-icon.png';
config.expo.android.adaptiveIcon = { foregroundImage: './assets/images/cleantrack-foreground.png', backgroundColor: '#087f5b' };
config.expo.web.favicon = './assets/images/cleantrack-favicon.png';
const splash = config.expo.plugins.find(p => Array.isArray(p) && p[0] === 'expo-splash-screen');
splash[1].image = './assets/images/cleantrack-foreground.png';
splash[1].imageWidth = 160;
fs.writeFileSync('app.json', JSON.stringify(config, null, 2) + '\n');
