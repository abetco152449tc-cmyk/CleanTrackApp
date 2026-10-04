import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const project = 'demo-cleantrack';
const password = 'CleanTrackTest123!';
const authBase = 'http://127.0.0.1:9099';
const firestoreBase = 'http://127.0.0.1:8080';
async function seed(request: APIRequestContext, email: string, name: string, role = 'Resident') {
  const result = await request.post(
    `${authBase}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key`,
    { data: { email, password, returnSecureToken: true } },
  );
  expect(result.ok()).toBe(true);
  const { localId: id } = await result.json();
  const data = { id, email, name, phone: '', role };
  const fields = Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, { stringValue: value }]),
  );
  const response = await request.patch(
    `${firestoreBase}/v1/projects/${project}/databases/(default)/documents/users/${id}`,
    {
      headers: { Authorization: 'Bearer owner' },
      data: { fields: { ...fields, joinedAt: { timestampValue: new Date().toISOString() } } },
    },
  );
  expect(response.ok()).toBe(true);
  return id;
}
async function login(page: Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
}
test.beforeEach(async ({ request }) => {
  expect(
    (
      await request.delete(
        `${firestoreBase}/emulator/v1/projects/${project}/databases/(default)/documents`,
      )
    ).ok(),
  ).toBe(true);
  expect((await request.delete(`${authBase}/emulator/v1/projects/${project}/accounts`)).ok()).toBe(
    true,
  );
});

test('residents can paginate beyond 200 reports and open an older report directly', async ({
  page,
  request,
}) => {
  const uid = await seed(request, 'history@example.test', 'History Resident');
  const created = '2026-01-01T00:00:00.000Z';
  const writes = Array.from({ length: 205 }, (_, index) => {
    const id = `history-${String(index).padStart(3, '0')}`;
    const data = {
      id,
      title: `History report ${String(index).padStart(3, '0')}`,
      description: 'Historical report',
      address: 'School gate',
      type: 'General Waste',
      resident: uid,
      residentName: 'History Resident',
      status: 'Submitted',
      created,
    };
    return {
      update: {
        name: `projects/${project}/databases/(default)/documents/reports/${id}`,
        fields: {
          ...Object.fromEntries(
            Object.entries(data).map(([key, value]) => [key, { stringValue: value }]),
          ),
          collector: { nullValue: null },
          collectorName: { stringValue: '' },
          revision: { integerValue: '1' },
          hasPhoto: { booleanValue: false },
          history: {
            arrayValue: {
              values: [
                {
                  mapValue: {
                    fields: {
                      status: { stringValue: 'Submitted' },
                      date: { stringValue: created },
                      note: { stringValue: 'Report received.' },
                    },
                  },
                },
              ],
            },
          },
          createdAt: { timestampValue: created },
          updatedAt: { timestampValue: created },
        },
      },
    };
  });
  for (let offset = 0; offset < writes.length; offset += 100)
    expect(
      (
        await request.post(
          `${firestoreBase}/v1/projects/${project}/databases/(default)/documents:commit`,
          {
            headers: { Authorization: 'Bearer owner' },
            data: { writes: writes.slice(offset, offset + 100) },
          },
        )
      ).ok(),
    ).toBe(true);
  await login(page, 'history@example.test');
  await page.getByRole('button', { name: 'Reports', exact: true }).click();
  await expect(
    page.getByText('50 reports loaded. Search and filters cover loaded reports.'),
  ).toBeVisible();
  for (const count of [100, 150, 200, 205]) {
    await page.getByRole('button', { name: 'Load older reports', exact: true }).click();
    await expect(
      page.getByText(`${count} reports loaded. Search and filters cover loaded reports.`),
    ).toBeVisible();
  }
  await expect(page.getByText('You have reached the end of your report history.')).toBeVisible();
  await page.getByLabel('Search reports').fill('History report 000');
  await page.getByRole('button').filter({ hasText: 'History report 000' }).click();
  await expect(page.getByText('Historical report', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('History report 000', { exact: true })).toBeVisible();
  await expect(page.getByText('Historical report', { exact: true })).toBeVisible();
  const note = 'Reviewed while this older report is open.';
  expect(
    (
      await request.patch(
        `${firestoreBase}/v1/projects/${project}/databases/(default)/documents/reports/history-000?updateMask.fieldPaths=status&updateMask.fieldPaths=history&updateMask.fieldPaths=revision&updateMask.fieldPaths=updatedAt`,
        {
          headers: { Authorization: 'Bearer owner' },
          data: {
            fields: {
              status: { stringValue: 'Under Review' },
              revision: { integerValue: '2' },
              updatedAt: { timestampValue: new Date().toISOString() },
              history: {
                arrayValue: {
                  values: [
                    {
                      mapValue: {
                        fields: {
                          status: { stringValue: 'Submitted' },
                          date: { stringValue: created },
                          note: { stringValue: 'Report received.' },
                        },
                      },
                    },
                    {
                      mapValue: {
                        fields: {
                          status: { stringValue: 'Under Review' },
                          date: { stringValue: new Date().toISOString() },
                          note: { stringValue: note },
                          actor: { stringValue: 'admin' },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      )
    ).ok(),
  ).toBe(true);
  await expect(page.getByText(note, { exact: true })).toBeVisible();
});

test('invalid and missing profiles explain recovery without confusing it with a failed login', async ({
  page,
  request,
}) => {
  const id = await seed(request, 'profile@example.test', 'Profile Test', 'Unknown');
  await page.goto('/');
  await page.getByLabel('Email address', { exact: true }).fill('profile@example.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Your login succeeded');
  await expect(page.getByRole('alert')).toContainText('unrecognized account role');
  const profileUrl = `${firestoreBase}/v1/projects/${project}/databases/(default)/documents/users/${id}`;
  expect(
    (
      await request.patch(`${profileUrl}?updateMask.fieldPaths=role`, {
        headers: { Authorization: 'Bearer owner' },
        data: { fields: { role: { stringValue: 'Resident' } } },
      })
    ).ok(),
  ).toBe(true);
  await expect(page.getByText('RESIDENT PORTAL', { exact: true })).toBeVisible();
  expect(
    (await request.delete(profileUrl, { headers: { Authorization: 'Bearer owner' } })).ok(),
  ).toBe(true);
  await expect(page.getByRole('alert')).toContainText('profile is missing');
  await page.getByRole('button', { name: 'Retry connection', exact: true }).click();
  await expect(page.getByText('RESIDENT PORTAL', { exact: true })).toBeVisible();
});

test('registration, profile, session restoration, logout, and rejected login use the real emulator', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Just looking around/ })).toHaveCount(0);
  await expect(
    page.getByText('Sign in to CleanTrack. Your account opens the right dashboard automatically.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Create an account', exact: true }).click();
  await expect(
    page.getByText('Create your resident account with your email and password.'),
  ).toBeVisible();
  await page.getByLabel('Email address', { exact: true }).fill('resident@example.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill('Mismatch123!');
  await page.getByRole('button', { name: 'Create resident account' }).click();
  await expect(page.getByRole('alert')).toContainText('passwords do not match');
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create resident account' }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByText('RESIDENT PORTAL', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await page.getByText('Edit profile', { exact: true }).click();
  await page.getByLabel('Full name', { exact: true }).fill('Maria Test');
  await page.getByLabel('Phone number', { exact: true }).fill('09123456789');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Your profile was saved.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Maria Test', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeVisible();
  await page.goto('/users', { waitUntil: 'commit' });
  await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeVisible();
  await page.getByLabel('Email address', { exact: true }).fill('resident@example.test');
  await page.getByLabel('Password', { exact: true }).fill('WrongPassword!');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('email or password is incorrect');
});

test('password recovery produces a reset link in the emulator without signing in', async ({
  page,
  request,
}) => {
  await seed(request, 'resident@example.test', 'Maria');
  await page.goto('/');
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByLabel('Email address', { exact: true }).fill('resident@example.test');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('alert')).toContainText('If an account exists');
  const response = await request.get(`${authBase}/emulator/v1/projects/${project}/oobCodes`);
  const data = await response.json();
  expect(
    data.oobCodes.some(
      (code: { email: string; requestType: string }) =>
        code.email === 'resident@example.test' && code.requestType === 'PASSWORD_RESET',
    ),
  ).toBe(true);
});

test('promoted collector login uses the server role despite a cached resident profile', async ({
  page,
  request,
}) => {
  const email = 'promoted@example.test';
  const id = await seed(request, email, 'Promoted Collector');
  const profileUrl = `${firestoreBase}/v1/projects/${project}/databases/(default)/documents/users/${id}`;
  const setRole = async (role: 'Resident' | 'Collector') => {
    const result = await request.patch(`${profileUrl}?updateMask.fieldPaths=role`, {
      headers: { Authorization: 'Bearer owner' },
      data: { fields: { role: { stringValue: role } } },
    });
    expect(result.ok()).toBe(true);
  };

  await login(page, email);
  await expect(page.getByText('RESIDENT PORTAL', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeVisible();

  // Keep this page alive: reloading would clear the Firestore memory cache and miss the bug.
  // Delay profile listeners only; transactions must still read the promoted server profile.
  const listenChannel = /google\.firestore\.v1\.Firestore\/Listen\/channel/;
  let blockedListeners = 0;
  await page.route(listenChannel, async (route) => {
    blockedListeners += 1;
    await route.abort();
  });
  await setRole('Collector');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByText('COLLECTOR PORTAL', { exact: true })).toBeVisible();
  await expect(
    page.getByText('RESIDENT PORTAL', { exact: true }).filter({ visible: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Tasks', exact: true })).toBeVisible();
  await expect.poll(() => blockedListeners).toBeGreaterThan(0);

  await page.unroute(listenChannel);
  await page.reload();
  await expect(page.getByText('COLLECTOR PORTAL', { exact: true })).toBeVisible();

  // Server role changes must remain reactive after the startup snapshot is accepted.
  await setRole('Resident');
  await expect(page.getByText('RESIDENT PORTAL', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Report', exact: true })).toBeVisible();
  await setRole('Collector');
  await expect(page.getByText('COLLECTOR PORTAL', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tasks', exact: true })).toBeVisible();
});

test('admin approves collector, assigns resident photo report, and all dashboards receive completion', async ({
  browser,
  request,
}) => {
  // Three independent sessions plus cold Expo routes can exceed three minutes on this machine.
  test.setTimeout(300000);
  await seed(request, 'resident@example.test', 'Maria');
  await seed(request, 'admin@example.test', 'Barangay Admin', 'Admin');
  await seed(request, 'collector@example.test', 'Collector Candidate');
  const contexts = await Promise.all(
    [0, 1, 2].map(() =>
      browser.newContext({
        baseURL: 'http://127.0.0.1:8092',
        viewport: { width: 390, height: 844 },
        permissions: ['geolocation'],
        geolocation: { latitude: 7.4478, longitude: 125.8078 },
      }),
    ),
  );
  for (const context of contexts) {
    context.setDefaultTimeout(30000);
    context.setDefaultNavigationTimeout(60000);
    await context.tracing.start({ screenshots: true, snapshots: true });
  }
  try {
    const [resident, admin, collector] = await Promise.all(
      contexts.map((context) => context.newPage()),
    );
    console.log('Workflow: signing in three accounts');
    await login(resident, 'resident@example.test');
    await login(admin, 'admin@example.test');
    await login(collector, 'collector@example.test');
    console.log('Workflow: approving collector');
    await admin.getByRole('button', { name: 'Users', exact: true }).click();
    await admin.getByLabel('Find a user').fill('collector@example.test');
    await admin.getByRole('button', { name: 'Approve as collector' }).click();
    await admin.getByRole('button', { name: 'Confirm collector access' }).click();
    await expect(collector.getByText('COLLECTOR PORTAL', { exact: true })).toBeVisible();
    console.log('Workflow: submitting photo report');
    await resident.getByRole('button', { name: 'Report', exact: true }).click();
    const chooser = resident.waitForEvent('filechooser');
    await resident.getByRole('button', { name: 'Choose from gallery' }).click();
    await (await chooser).setFiles('assets/images/icon.png');
    await resident.getByRole('button', { name: 'Continue', exact: true }).click();
    await resident.getByLabel('Report title', { exact: true }).fill('Waste near the school gate');
    await resident
      .getByLabel('Description', { exact: true })
      .fill('Three bags blocking the entrance.');
    await resident.getByRole('button', { name: 'Continue', exact: true }).click();
    await resident.getByLabel('Address or landmark').fill('School gate, San Isidro, Tagum City');
    await resident.getByRole('button', { name: 'Review report', exact: true }).click();
    await resident.getByRole('button', { name: 'Submit report', exact: true }).click();
    await expect(resident.getByText('Report submitted!', { exact: true })).toBeVisible();
    await resident.getByRole('button', { name: 'Back to home', exact: true }).click();
    await resident.getByRole('button').filter({ hasText: 'Waste near the school gate' }).click();
    await expect(resident.getByRole('img', { name: 'Report evidence photo' })).toBeVisible();
    console.log('Workflow: reviewing and assigning report');
    await admin.getByRole('button', { name: 'Home', exact: true }).click();
    await admin.getByRole('button').filter({ hasText: 'Waste near the school gate' }).click();
    await admin.getByRole('button', { name: 'Mark under review' }).click();
    await admin.getByText('Collector Candidate', { exact: true }).click();
    await admin.getByRole('button', { name: 'Assign report', exact: true }).click();
    await expect(admin.getByText('Collector: Collector Candidate')).toBeVisible();
    console.log('Workflow: completing collection');
    await collector.getByRole('button').filter({ hasText: 'Waste near the school gate' }).click();
    await collector.getByRole('button', { name: 'Start collection' }).click();
    await collector.getByLabel('Completion note').fill('Collected successfully. Area is clear.');
    await expect(collector.getByRole('button', { name: 'Mark as collected' })).toBeDisabled();
    const cleanupChooser = collector.waitForEvent('filechooser');
    await collector.getByRole('button', { name: 'Choose cleanup photo from gallery' }).click();
    await (await cleanupChooser).setFiles('assets/images/icon.png');
    await expect(collector.getByLabel('After-cleanup photo preview')).toBeVisible();
    await collector.getByRole('button', { name: 'Mark as collected' }).click();
    await expect(collector.getByText('Task completed!', { exact: true })).toBeVisible();
    await expect(
      resident.getByText('Collected successfully. Area is clear.', { exact: true }),
    ).toBeVisible();
    await expect(resident.getByRole('img', { name: 'After-cleanup evidence photo' })).toBeVisible();
    await expect(admin.getByRole('img', { name: 'After-cleanup evidence photo' })).toBeVisible();
    await resident.goto('/notifications');
    console.log('Workflow: checking read receipts and route protection');
    await resident.getByRole('button', { name: 'Mark all as read' }).click();
    await expect(resident.getByText('0 unread updates', { exact: true })).toBeVisible();
    await resident.reload();
    await expect(resident.getByText('0 unread updates', { exact: true })).toBeVisible();
    await resident.goto('/users');
    await expect(resident.getByText('RESIDENT PORTAL', { exact: true })).toBeVisible();
  } finally {
    await Promise.all(
      contexts.map(async (context, index) => {
        await context.tracing
          .stop({ path: `.tools/firebase-workflow-${index}.zip` })
          .catch(() => {});
        await context.close().catch(() => {});
      }),
    );
  }
});
