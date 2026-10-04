const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('@playwright/test');
const { locationMapHtml, parseMapCoordinate } = require('../src/lib/location-map-html.ts');

test('map bridge rejects invalid coordinates', () => {
  for (const value of [
    null,
    {},
    { latitude: NaN, longitude: 2 },
    { latitude: 7, longitude: 181 },
    { latitude: '7', longitude: 125 },
  ]) {
    assert.equal(parseMapCoordinate(value), undefined);
  }
});

test('Leaflet updates the native bridge after tapping, dragging and zooming without GPS', async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];
  let page;
  try {
    page = await browser.newPage({ viewport: { width: 390, height: 600 } });
    page.on('pageerror', (error) => errors.push(error.message));
    const messages = [];
    await page.exposeFunction('captureMapMessage', (text) => messages.push(JSON.parse(text)));
    await page.route('https://unpkg.com/leaflet@1.9.4/dist/*', (route) =>
      route.fulfill({
        path: `node_modules/leaflet/dist/${route.request().url().split('/').pop()}`,
      }),
    );
    await page.route('https://tile.openstreetmap.org/**', (route) =>
      route.fulfill({ contentType: 'image/png', path: 'assets/images/icon.png' }),
    );
    await page.evaluate(() => {
      window.ReactNativeWebView = { postMessage: (text) => window.captureMapMessage(text) };
      navigator.geolocation.getCurrentPosition = () => {
        throw Error('GPS must not be used');
      };
    });
    await page.setContent(locationMapHtml());
    await page.waitForFunction(() =>
      document.querySelector('#status').textContent.includes('Drag the map'),
    );
    await page.locator('#map').click({ position: { x: 270, y: 400 } });
    await page.mouse.move(180, 300);
    await page.mouse.down();
    await page.mouse.move(240, 380, { steps: 10 });
    await page.mouse.up();
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.waitForFunction(() => !document.querySelector('.leaflet-zoom-anim'));
    const points = messages.filter((message) => message.type === 'position');
    assert.ok(points.length >= 2);
    assert.ok(messages.some((message) => message.type === 'moving'));
    assert.notEqual(points[0].latitude, points.at(-1).latitude);
    assert.ok(parseMapCoordinate(points.at(-1)));
    assert.equal(
      messages.some((message) => message.type === 'error'),
      false,
    );
    await page.close();
    page = await browser.newPage();
    await page.route(/https:\/\/(unpkg.com|tile.openstreetmap.org)\//, (route) =>
      route.fulfill({ status: 503, contentType: 'text/plain', body: 'Unavailable' }),
    );
    await page.setContent(locationMapHtml());
    await page.waitForFunction(() =>
      document.querySelector('#status').textContent.includes('Map unavailable'),
    );
  } catch (error) {
    console.error('Map status:', await page?.locator('#status').textContent(), errors);
    throw error;
  } finally {
    await browser.close();
  }
});

const { reportMapHtml } = require('../src/lib/report-map-html.ts');
test('report map uses the native bridge, shows accuracy and safely renders report labels', async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 600 } });
    const messages = [];
    await page.exposeFunction('captureMapMessage', (text) => messages.push(JSON.parse(text)));
    await page.route('https://unpkg.com/leaflet@1.9.4/dist/*', (route) =>
      route.fulfill({
        path: `node_modules/leaflet/dist/${route.request().url().split('/').pop()}`,
      }),
    );
    await page.route('https://tile.openstreetmap.org/**', (route) =>
      route.fulfill({ contentType: 'image/png', path: 'assets/images/icon.png' }),
    );
    const html = reportMapHtml([
      {
        id: 'test-report',
        title: '</script><script>window.bad=true</script>',
        address: 'School gate',
        latitude: 7.4478,
        longitude: 125.8078,
        locationAccuracy: 25,
      },
    ]);
    await page.setContent(
      html.replace(
        '<script>',
        '<script>window.ReactNativeWebView={postMessage:window.captureMapMessage};',
      ),
    );
    await page.waitForSelector('.leaflet-marker-icon');
    await page.locator('.leaflet-marker-icon').click();
    await page.getByRole('button', { name: 'Open report' }).click();
    assert.ok(messages.some((m) => m.type === 'report' && m.id === 'test-report'));
    assert.equal(await page.evaluate(() => window.bad), undefined);
    assert.equal(await page.locator('.leaflet-overlay-pane path').count(), 1);
    assert.ok(
      await page
        .locator('.leaflet-popup-content')
        .textContent()
        .then((text) => text.includes('School gate')),
    );
  } finally {
    await browser.close();
  }
});
