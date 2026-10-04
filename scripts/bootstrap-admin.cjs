// Owner-only setup. Uses the Firebase CLI login; never ships in the mobile app.
process.env.DEBUG = '';
const { getGlobalDefaultAccount } = require('firebase-tools/lib/auth');
const { requireAuth } = require('firebase-tools/lib/requireAuth');
const { Client } = require('firebase-tools/lib/apiv2');

const project = 'cleantrack-e62a9';

async function main() {
  const args = process.argv.slice(2);
  let email = 'admin1@gmail.com';
  let apply = false;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--apply') apply = true;
    else if (args[index] === '--email' && args[index + 1])
      email = args[++index].trim().toLowerCase();
    else throw Error('Usage: npm run firebase:admin -- [--email registered@example.com] [--apply]');
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) throw Error('Choose a valid registered account email.');
  const account = getGlobalDefaultAccount();
  if (!account)
    throw Error('Run npm run firebase:login with the Google account that owns CleanTrack first.');
  await requireAuth({ project, user: account.user, tokens: account.tokens, nonInteractive: true });
  const identity = new Client({ urlPrefix: 'https://identitytoolkit.googleapis.com', auth: true });
  const firestore = new Client({ urlPrefix: 'https://firestore.googleapis.com', auth: true });
  const result = await identity.post(`/v1/projects/${project}/accounts:lookup`, { email: [email] });
  const user = result.body.users?.find((entry) => entry.email?.toLowerCase() === email);
  if (!user || user.disabled)
    throw Error(
      `Register ${email} in CleanTrack first, or create it in Firebase Authentication. The account must be enabled.`,
    );
  const path = `/v1/projects/${project}/databases/(default)/documents/users/${encodeURIComponent(user.localId)}`;
  let profile;
  try {
    profile = (await firestore.get(path)).body;
  } catch (error) {
    if (error.status !== 404 && error.context?.response?.statusCode !== 404) throw error;
  }
  if (
    profile &&
    (profile.fields.id?.stringValue !== user.localId || profile.fields.email?.stringValue !== email)
  ) {
    throw Error(
      'The existing profile does not match the Auth account. Review it in Firebase Console before continuing.',
    );
  }
  if (profile?.fields.role?.stringValue === 'Admin') {
    console.log(`${email} already has Admin access in ${project}.`);
    return;
  }
  console.log(
    `Project: ${project}\nAccount: ${email}\nUID: ${user.localId}\nChange: ${profile ? 'promote existing profile' : 'create profile'} to Admin.`,
  );
  if (!apply) {
    console.log(`Preview only. Apply with npm run firebase:admin -- --email ${email} --apply`);
    return;
  }
  const fields = profile
    ? { role: { stringValue: 'Admin' } }
    : {
        id: { stringValue: user.localId },
        email: { stringValue: email },
        name: { stringValue: user.displayName || 'CleanTrack Admin' },
        phone: { stringValue: '' },
        role: { stringValue: 'Admin' },
        joinedAt: { timestampValue: new Date().toISOString() },
      };
  const queryParams = profile
    ? { 'updateMask.fieldPaths': 'role', 'currentDocument.updateTime': profile.updateTime }
    : { 'currentDocument.exists': 'false' };
  await firestore.patch(path, { fields }, { queryParams });
  console.log('Admin access saved. Sign in to CleanTrack with this account.');
}

main().catch((error) => {
  console.error(error.message || 'Admin setup failed. Check your Google project permissions.');
  process.exitCode = 1;
});
