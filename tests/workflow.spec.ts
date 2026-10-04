import { test, expect, type Page } from '@playwright/test';

async function enterDemo(page: Page, role: 'Resident' | 'Collector' | 'Admin') {
  await page.getByRole('tab', { name: role, exact: true }).click();
  await page.getByRole('button', { name: /Just looking around/ }).click();
  await page.getByRole('button', { name: 'Continue as ' + role, exact: true }).click();
}

test('resident submission, admin assignment, collector completion and persisted timeline', async ({
  page,
}) => {
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 7.4478, longitude: 125.8078 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await enterDemo(page, 'Resident');
  await expect(page.getByText('Hello, Maria', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Report', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose from gallery' }).click();
  await (await chooser).setFiles('assets/images/icon.png');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Report title', { exact: true }).fill('Waste near the school gate');
  await page
    .getByLabel('Description', { exact: true })
    .fill('Three bags blocking the entrance. Please collect them.');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Use current location', exact: true }).click();
  await expect(page.getByText('Report location selected', { exact: true })).toBeVisible();
  await page.getByLabel('Address or landmark').fill('School gate, San Isidro, Tagum City');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText(/Draft saved on this device/)).toBeVisible();
  await page.getByLabel('Go back', { exact: true }).click();
  await page.getByRole('button', { name: 'Report', exact: true }).click();
  await expect(page.getByText(/Your saved draft is restored/)).toBeVisible();
  await expect(page.getByLabel('Address or landmark')).toHaveValue(
    'School gate, San Isidro, Tagum City',
  );
  await page.getByRole('button', { name: 'Review report', exact: true }).click();
  await expect(page.getByText('Waste near the school gate', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Report photo preview')).toBeVisible();
  await page.getByRole('button', { name: 'Edit details', exact: true }).click();
  await expect(page.getByLabel('Report title', { exact: true })).toHaveValue(
    'Waste near the school gate',
  );
  await expect(page.getByLabel('Description', { exact: true })).toHaveValue(
    'Three bags blocking the entrance. Please collect them.',
  );
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Review report', exact: true }).click();
  await page.getByRole('button', { name: 'Submit report', exact: true }).click();
  await expect(page.getByText('Report submitted!', { exact: true })).toBeVisible();
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).some((key) => key.includes('report-draft:')),
    ),
  ).toBe(false);
  await page.getByRole('button', { name: 'Back to home', exact: true }).click();
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await page.getByRole('button', { name: 'Switch demo account' }).click();
  await enterDemo(page, 'Admin');
  await page.getByRole('button').filter({ hasText: 'Waste near the school gate' }).click();
  await page.getByRole('button', { name: 'Mark under review', exact: true }).click();
  await page.getByText('Ramon Flores', { exact: true }).click();
  await page.getByRole('button', { name: 'Assign report', exact: true }).click();
  await expect(page.getByText('Collector: Ramon Flores')).toBeVisible();
  await page.getByLabel('Go back', { exact: true }).click();
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await page.getByRole('button', { name: 'Switch demo account' }).click();
  await enterDemo(page, 'Collector');
  await page.getByRole('button').filter({ hasText: 'Waste near the school gate' }).click();
  await page.getByRole('button', { name: 'Start collection', exact: true }).click();
  await page.getByLabel('Completion note').fill('Collected successfully. Area is clear.');
  await expect(page.getByRole('button', { name: 'Mark as collected' })).toBeDisabled();
  const cleanupChooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose cleanup photo from gallery' }).click();
  await (await cleanupChooser).setFiles('assets/images/icon.png');
  await expect(page.getByLabel('After-cleanup photo preview')).toBeVisible();
  await page.getByRole('button', { name: 'Mark as collected', exact: true }).click();
  await expect(page.getByText('Task completed!', { exact: true })).toBeVisible();
  await page.goto('/');
  await enterDemo(page, 'Resident');
  await page.getByRole('button').filter({ hasText: 'Waste near the school gate' }).click();
  await expect(page.getByText('Collected successfully. Area is clear.')).toBeVisible();
  await expect(page.getByLabel('After-cleanup evidence photo')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Assign report', exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/resident-report.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('search and role-scoped task lists', async ({ page }) => {
  await page.goto('/');
  await enterDemo(page, 'Collector');
  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  await expect(page.getByText('Garbage on Sidewalk', { exact: true })).toHaveCount(0);
  await page.getByLabel('Search reports').fill('not-a-report');
  await expect(page.getByText('No reports match your search.')).toBeVisible();
  await page.getByLabel('Search reports').fill('Illegal');
  await expect(page.getByText('Illegal Dumping', { exact: true })).toBeVisible();
});

test('unread indicators, inbox filtering and read state persist separately for demo accounts', async ({
  page,
}) => {
  await page.goto('/');
  await enterDemo(page, 'Resident');
  await expect(page.getByRole('button', { name: /Open updates, [1-9]/ })).toBeVisible();
  await page.getByRole('button', { name: 'Updates', exact: true }).click();
  await page.getByRole('button', { name: 'Show unread only', exact: true }).click();
  await page.getByRole('button', { name: 'Mark all as read', exact: true }).click();
  await expect(page.getByText('0 unread updates', { exact: true })).toBeVisible();
  await expect(
    page.getByText('You are all caught up. New report updates will appear here.'),
  ).toBeVisible();
  await page.goto('/');
  await enterDemo(page, 'Resident');
  await expect(
    page.getByRole('button', { name: 'Open updates, 0 unread', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await page.getByRole('button', { name: 'Switch demo account' }).click();
  await enterDemo(page, 'Collector');
  await expect(page.getByRole('button', { name: /Open updates, [1-9]/ })).toBeVisible();
});

test('submission failure preserves the form and retry submits only once', async ({ page }) => {
  await page.goto('/');
  await enterDemo(page, 'Resident');
  await page.getByRole('button', { name: 'Report', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose from gallery' }).click();
  await (await chooser).setFiles('assets/images/icon.png');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Report title', { exact: true }).fill('Retry without losing details');
  await page.getByLabel('Description', { exact: true }).fill('Waste next to the school.');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Address or landmark').fill('School gate, Tagum City');
  await page.getByRole('button', { name: 'Review report', exact: true }).click();
  // Simulate device storage failure while preparing the submission, then recover.
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.includes('report-draft:')) {
        Storage.prototype.setItem = original;
        throw new DOMException('Storage full', 'QuotaExceededError');
      }
      original.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: 'Submit report', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Your photo and details are still here');
  await expect(page.getByText('Retry without losing details', { exact: true })).toBeVisible();
  await expect(page.getByText('School gate, Tagum City', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Report photo preview')).toBeVisible();
  await page.getByRole('button', { name: 'Retry submission', exact: true }).click();
  await expect(page.getByText('Report submitted!', { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const saved = Object.values(localStorage).find((value) =>
          value.includes('Retry without losing details'),
        );
        return saved
          ? JSON.parse(saved).reports.filter(
              (report: { title: string }) => report.title === 'Retry without losing details',
            ).length
          : 0;
      }),
    )
    .toBe(1);
});

test('profile save failure keeps edits available and retry persists the updated profile', async ({
  page,
}) => {
  await page.goto('/');
  await enterDemo(page, 'Resident');
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await page.getByText('Edit profile', { exact: true }).click();
  await page.getByLabel('Full name', { exact: true }).fill('Maria Updated');
  await page.getByLabel('Phone number', { exact: true }).fill('09123456789');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.includes('cleantrack-v1')) {
        Storage.prototype.setItem = original;
        throw new DOMException('Storage full', 'QuotaExceededError');
      }
      original.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expect(page.getByLabel('Full name', { exact: true })).toHaveValue('Maria Updated');
  await expect(page.getByLabel('Phone number', { exact: true })).toHaveValue('09123456789');
  await expect(page.getByText('Profile saved on this device.', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Profile saved on this device.', { exact: true })).toBeVisible();
  await page.goto('/');
  await enterDemo(page, 'Resident');
  await expect(page.getByText('Hello, Maria', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await expect(page.getByText('Maria Updated', { exact: true })).toBeVisible();
  await page.getByText('Edit profile', { exact: true }).click();
  await expect(page.getByLabel('Phone number', { exact: true })).toHaveValue('09123456789');
});

test('admin rejection needs a reason and the resident sees its persisted timeline', async ({
  page,
}) => {
  await page.goto('/');
  await enterDemo(page, 'Admin');
  await page.getByRole('button').filter({ hasText: 'Garbage on Sidewalk' }).click();
  await page.getByRole('button', { name: 'Reject report', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Please explain why the report was rejected.',
  );
  await page
    .getByLabel('Notes / rejection reason', { exact: true })
    .fill('Duplicate report; collection is already scheduled.');
  await page.getByRole('button', { name: 'Reject report', exact: true }).click();
  await expect(
    page.getByText('Duplicate report; collection is already scheduled.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reject report', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Assign report', exact: true })).toHaveCount(0);
  await page.goto('/');
  await enterDemo(page, 'Resident');
  await page.getByRole('button').filter({ hasText: 'Garbage on Sidewalk' }).click();
  await expect(
    page.getByText('Duplicate report; collection is already scheduled.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Rejected', { exact: true }).filter({ visible: true })).toHaveCount(
    2,
  );
  await expect(page.getByRole('button', { name: 'Reject report', exact: true })).toHaveCount(0);
});

test('signed-out protected URLs require login and collector navigation stays role scoped', async ({
  page,
}) => {
  for (const route of ['/users', '/analytics', '/report/CT-DEMO-001', '/new-report']) {
    await page.goto(route);
    await expect(
      page.getByRole('button', { name: 'Log in as Resident', exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  }
  await enterDemo(page, 'Collector');
  await expect(page.getByText('Hello, Ramon', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Users', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Report', exact: true })).toHaveCount(0);
  await expect(page.getByText('Community analytics', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  await expect(page.getByText('Garbage on Sidewalk', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Illegal Dumping', { exact: true })).toBeVisible();
});

test('dashboard status shortcuts, clear filters and sorting retain collector report scope', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  await enterDemo(page, 'Collector');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/collector-home.png', fullPage: true });
  await page.getByRole('button', { name: 'View assigned tasks', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Assigned', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    page.getByText('Illegal Dumping', { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Trash near Drainage', { exact: true }).filter({ visible: true }),
  ).toHaveCount(0);
  await page.getByLabel('Search reports').fill('not-a-report');
  await page.getByRole('button', { name: 'Clear search and filters', exact: true }).click();
  await expect(page.getByLabel('Search reports')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'All', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const cards = page
    .getByRole('button')
    .filter({ has: page.getByText(/^(Illegal Dumping|Trash near Drainage)$/, { exact: true }) });
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText('Illegal Dumping');
  await page.getByRole('button', { name: 'Sort oldest first', exact: true }).click();
  await expect(cards.first()).toContainText('Trash near Drainage');
  await page.getByRole('button', { name: 'Sort newest first', exact: true }).click();
  await expect(cards.first()).toContainText('Illegal Dumping');
  await expect(page.getByText('Garbage on Sidewalk', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/collector-tasks.png', fullPage: true });
});

test('resident map filters address-only reports and returns to the dashboard', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  await enterDemo(page, 'Resident');
  await page.getByRole('button', { name: 'Report map', exact: true }).click();
  await expect(
    page.getByText('No map pins saved. Use the report addresses below.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Trash near Drainage', { exact: true }).filter({ visible: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Resolved', exact: true }).click();
  await expect(
    page.getByText('Trash near Drainage', { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Garbage on Sidewalk', { exact: true }).filter({ visible: true }),
  ).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/resident-map.png', fullPage: true });
  await page.getByRole('button').filter({ hasText: 'Trash near Drainage' }).click();
  await expect(
    page.getByRole('button', { name: 'Open location in Maps', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Go back', exact: true }).click();
  await expect(page.getByText('Around your barangay', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Go back', exact: true }).click();
  await expect(page.getByText('Hello, Maria', { exact: false })).toBeVisible();
});
