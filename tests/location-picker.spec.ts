import { test, expect, type Page } from '@playwright/test';

async function locationStep(page: Page) {
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = () => {
      throw Error('GPS must remain optional');
    };
  });
  await page.goto('/');
  await page.getByRole('tab', { name: 'Resident', exact: true }).click();
  await page.getByRole('button', { name: /Just looking around/ }).click();
  await page.getByRole('button', { name: 'Continue as Resident', exact: true }).click();
  await page.getByRole('button', { name: 'Report', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose from gallery' }).click();
  await (await chooser).setFiles('assets/images/icon.png');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Report title', { exact: true }).fill('Manually pinned waste');
  await page.getByLabel('Description', { exact: true }).fill('Waste at the school entrance');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
}

test('map pin works without GPS, survives landmark edits and is saved with the report', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Real Leaflet interactions with deterministic tiles; no public tile requests in tests.
  await page.route('https://unpkg.com/leaflet@1.9.4/dist/*', (route) =>
    route.fulfill({
      path: `node_modules/leaflet/dist/${route.request().url().split('/').pop()}`,
    }),
  );
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({
      contentType: 'image/png',
      path: 'assets/images/icon.png',
    }),
  );
  await locationStep(page);
  await page.getByRole('button', { name: 'Choose on map', exact: true }).click();
  const confirm = page.getByRole('button', { name: 'Confirm this location', exact: true });
  await expect(confirm).toBeEnabled();
  const map = page.frameLocator('iframe').locator('#map');
  await map.click({ position: { x: 260, y: 180 } });
  await expect(confirm).toBeEnabled();
  await confirm.click();
  const selected = await page.getByLabel('Address or landmark').inputValue();
  expect(selected).toMatch(/^[-\d.]+, [-\d.]+$/);
  expect(selected).not.toBe('7.447800, 125.807800');
  await page.getByLabel('Address or landmark').fill('School entrance, Tagum City');
  await page.getByRole('button', { name: 'Adjust pin on map' }).click();
  await expect(confirm).toBeEnabled();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove pin' })).toBeVisible();
  await page.getByRole('button', { name: 'Review report', exact: true }).click();
  await page.getByRole('button', { name: 'Submit report', exact: true }).click();
  await expect(page.getByText('Report submitted!', { exact: true })).toBeVisible();
  const saved = await page.evaluate(() =>
    Object.values(localStorage).find((value) => value.includes('Manually pinned waste')),
  );
  expect(saved).toBeTruthy();
  const report = JSON.parse(saved!).reports.find(
    (item: { title: string }) => item.title === 'Manually pinned waste',
  );
  const [latitude, longitude] = selected.split(', ').map(Number);
  expect(report.latitude).toBeCloseTo(latitude, 5);
  expect(report.longitude).toBeCloseTo(longitude, 5);
  expect(report.address).toBe('School entrance, Tagum City');
  expect(report.locationSource).toBe('map');
  expect(report.locationAccuracy).toBeUndefined();
  expect(errors).toEqual([]);
});

test('failed map load allows cancel and manual address submission', async ({ page }) => {
  await page
    .context()
    .route(/https:\/\/(unpkg.com|tile.openstreetmap.org)\//, (route) =>
      route.fulfill({ status: 503, contentType: 'text/plain', body: 'Unavailable' }),
    );
  await locationStep(page);
  await page.getByRole('button', { name: 'Choose on map', exact: true }).click();
  await expect(page.getByText(/Map could not load/)).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Confirm this location' })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove pin' })).toHaveCount(0);
  await page.getByLabel('Address or landmark').fill('School entrance, Tagum City');
  await page.getByRole('button', { name: 'Review report', exact: true }).click();
  await page.getByRole('button', { name: 'Submit report', exact: true }).click();
  await expect(page.getByText('Report submitted!', { exact: true })).toBeVisible();
});
