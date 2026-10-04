import { test, expect } from '@playwright/test';

for (const account of [
  { role: 'Resident', email: 'maria@cleantrack.demo', greeting: 'Maria' },
  { role: 'Collector', email: 'ramon@cleantrack.demo', greeting: 'Ramon' },
  { role: 'Admin', email: 'admin@cleantrack.demo', greeting: 'Admin' },
]) {
  test(`${account.role} login validates credentials and opens the correct dashboard`, async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: account.role, exact: true }).click();
    await expect(page.getByText(`${account.role} login`, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: `Log in as ${account.role}` }).click();
    await expect(page.getByRole('alert')).toContainText('Enter your email address and password');
    await page.getByLabel('Email address', { exact: true }).fill(account.email);
    await page.getByLabel('Password', { exact: true }).fill('wrong-password');
    await page.getByRole('button', { name: `Log in as ${account.role}` }).click();
    await expect(page.getByRole('alert')).toContainText('do not match this role');
    await page.getByLabel('Password', { exact: true }).fill('CleanTrackDemo!');
    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(page.getByLabel('Password', { exact: true })).toHaveJSProperty('type', 'text');
    await page.getByRole('button', { name: 'Hide password' }).click();
    await expect(page.getByLabel('Password', { exact: true })).toHaveJSProperty('type', 'password');
    await page.getByRole('button', { name: `Log in as ${account.role}` }).click();
    await expect(page.getByText(`Hello, ${account.greeting}`, { exact: false })).toBeVisible();
  });
}

test('role changes clear sensitive fields and demo credentials can be filled', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('tab', { name: 'Admin', exact: true }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: /Just looking around/ }).click();
  await page.getByRole('button', { name: 'Fill demo credentials' }).click();
  await expect(page.getByLabel('Email address', { exact: true })).toHaveValue(
    'admin@cleantrack.demo',
  );
  await page.getByRole('button', { name: /Just looking around/ }).click();
  await page.screenshot({ path: 'test-results/admin-login.png', fullPage: true });
});

test('login fits a narrow phone and labels demo access clearly', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  await expect(page.getByText('DEMO MODE', { exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Resident' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/resident-login.png', fullPage: true });
});
