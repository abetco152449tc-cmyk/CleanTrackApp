// Read-only owner check. Print service readiness, never credentials or resident data.
process.env.DEBUG = '';
const { readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { getGlobalDefaultAccount } = require('firebase-tools/lib/auth');
const { requireAuth } = require('firebase-tools/lib/requireAuth');
const { Client } = require('firebase-tools/lib/apiv2');

const root = resolve(__dirname, '..');
const project = JSON.parse(readFileSync(resolve(root, '.firebaserc'), 'utf8')).projects.default;
const normalize = (value) => value.replace(/\r\n/g, '\n').trim();
const fingerprint = (index) =>
  JSON.stringify({
    collectionGroup:
      index.collectionGroup ?? index.name?.split('/collectionGroups/')[1]?.split('/')[0],
    queryScope: index.queryScope,
    fields: index.fields
      .filter((field) => field.fieldPath !== '__name__')
      .map(({ fieldPath, order, arrayConfig }) => ({
        fieldPath,
        ...(order ? { order } : {}),
        ...(arrayConfig ? { arrayConfig } : {}),
      })),
  });

async function main() {
  if (process.argv.length > 2) throw Error('Usage: npm run firebase:check');
  const account = getGlobalDefaultAccount();
  if (!account) throw Error('Sign in with npm run firebase:login before checking the project.');
  await requireAuth({ project, user: account.user, tokens: account.tokens, nonInteractive: true });
  const firestore = new Client({ urlPrefix: 'https://firestore.googleapis.com', auth: true });
  const rules = new Client({ urlPrefix: 'https://firebaserules.googleapis.com', auth: true });
  const identity = new Client({ urlPrefix: 'https://identitytoolkit.googleapis.com', auth: true });
  const dbPath = `/v1/projects/${project}/databases/(default)`;
  const checks = await Promise.allSettled([
    firestore.get(dbPath),
    identity.get(`/admin/v2/projects/${project}/config`),
    rules.get(`/v1/projects/${project}/releases/cloud.firestore`),
    firestore.get(`${dbPath}/collectionGroups/-/indexes`),
    firestore.post(`${dbPath}/documents:runQuery`, {
      structuredQuery: {
        from: [{ collectionId: 'users' }],
        select: { fields: [{ fieldPath: 'role' }] },
        where: {
          fieldFilter: {
            field: { fieldPath: 'role' },
            op: 'EQUAL',
            value: { stringValue: 'Admin' },
          },
        },
        limit: 1,
      },
    }),
  ]);
  const body = (index) =>
    checks[index].status === 'fulfilled' ? checks[index].value.body : undefined;
  const metadata = body(0);
  const configuration = body(1);
  const release = body(2);
  const configuredIndexes = JSON.parse(
    readFileSync(resolve(root, 'firestore.indexes.json'), 'utf8'),
  ).indexes;
  const installedIndexes = body(3)?.indexes ?? [];
  const indexStatus = configuredIndexes.map((index) => ({
    collection: index.collectionGroup,
    state:
      installedIndexes.find((candidate) => fingerprint(candidate) === fingerprint(index))?.state ??
      'MISSING',
  }));
  let rulesMatch = false;
  if (release?.rulesetName) {
    const deployed = (await rules.get(`/v1/${release.rulesetName}`)).body;
    const source = deployed.source?.files?.find((file) => file.name.endsWith('firestore.rules'));
    rulesMatch =
      !!source &&
      normalize(source.content) ===
        normalize(readFileSync(resolve(root, 'firestore.rules'), 'utf8'));
  }
  const envFile = resolve(root, '.env.local');
  const env = existsSync(envFile) ? readFileSync(envFile, 'utf8') : '';
  const setting = (name) =>
    env.match(new RegExp(`^${name}\\s*=\\s*["']?([^\\r\\n"']+)`, 'm'))?.[1]?.trim();
  const adminPresent = Array.isArray(body(4)) && body(4).some((result) => !!result.document);
  const summary = {
    project,
    appProjectMatches: setting('EXPO_PUBLIC_FIREBASE_PROJECT_ID') === project,
    demoModeEnabled: setting('EXPO_PUBLIC_CLEANTRACK_DEMO') === 'true',
    database: metadata
      ? { available: true, location: metadata.locationId, type: metadata.type }
      : { available: false },
    emailPasswordEnabled:
      configuration?.signIn?.email?.enabled === true &&
      configuration?.signIn?.email?.passwordRequired !== false,
    deployedRulesMatch: rulesMatch,
    indexes: indexStatus,
    adminPresent,
    nativePushProjectConfigured: !!setting('EXPO_PUBLIC_EAS_PROJECT_ID'),
    failedChecks: checks.flatMap((result, index) =>
      result.status === 'rejected'
        ? [
            {
              check: ['database', 'authentication', 'rules', 'indexes', 'admin'][index],
              status:
                result.reason.status ??
                result.reason.context?.response?.statusCode ??
                'unavailable',
            },
          ]
        : [],
    ),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (
    !metadata ||
    !summary.appProjectMatches ||
    !summary.emailPasswordEnabled ||
    !rulesMatch ||
    indexStatus.some((index) => index.state !== 'READY') ||
    !adminPresent
  )
    process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message || 'Project readiness could not be checked.');
  process.exitCode = 1;
});
