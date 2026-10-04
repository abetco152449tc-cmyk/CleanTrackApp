import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { expireReportPhotos } from '../server/maintenance-core.mjs';
const { createRepository } = createRequire(import.meta.url)(
  '../scripts/maintenance-repository.cjs',
);
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

let env, submitCloudReport, transitionCloudReport, markCloudReportsRead;
const people = {
  resident: {
    id: 'resident',
    name: 'Maria',
    email: 'maria@example.test',
    phone: '',
    role: 'Resident',
  },
  other: { id: 'other', name: 'Other', email: 'other@example.test', phone: '', role: 'Resident' },
  collector: {
    id: 'collector',
    name: 'Ramon',
    email: 'ramon@example.test',
    phone: '',
    role: 'Collector',
  },
  collector2: {
    id: 'collector2',
    name: 'Juan',
    email: 'juan@example.test',
    phone: '',
    role: 'Collector',
  },
  admin: { id: 'admin', name: 'Admin', email: 'admin@example.test', phone: '', role: 'Admin' },
};
const db = (id) =>
  env.authenticatedContext(id, { email: people[id]?.email ?? `${id}@example.test` }).firestore();
const photo = 'data:image/jpeg;base64,/9j/2Q==';
const draft = (id = 'report1') => ({
  id,
  title: 'Waste near the school',
  description: 'Three bags need collection.',
  address: 'School entrance',
  type: 'General Waste',
  resident: 'resident',
  status: 'Submitted',
  created: new Date().toISOString(),
  history: [],
  photo,
});
const load = async (id = 'report1', who = 'admin') => ({
  ...(await getDoc(doc(db(who), 'reports', id))).data(),
  id,
});
const transition = async (who, status, note = 'Update', collector, completionPhoto) =>
  transitionCloudReport(
    db(who),
    people[who],
    await load(),
    status,
    note,
    collector,
    completionPhoto,
  );

before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST)
    throw Error('Run this suite through the Firebase emulator.');
  env = await initializeTestEnvironment({
    projectId: 'demo-cleantrack',
    firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') },
  });
  await mkdir('.tools/generated', { recursive: true });
  const source = await readFile('src/lib/cloud-reports.ts', 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  await writeFile('.tools/generated/cloud-reports.mjs', output);
  ({ submitCloudReport, transitionCloudReport, markCloudReportsRead } = await import(
    pathToFileURL(resolve('.tools/generated/cloud-reports.mjs')).href
  ));
});
after(async () => {
  await env?.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    for (const person of Object.values(people))
      await setDoc(doc(context.firestore(), 'users', person.id), {
        ...person,
        joinedAt: Timestamp.now(),
      });
  });
});

test('self-registration cannot select staff roles or spoof email', async () => {
  const newDb = env.authenticatedContext('new', { email: 'new@example.test' }).firestore();
  const profile = {
    id: 'new',
    name: 'New User',
    email: 'new@example.test',
    phone: '',
    role: 'Resident',
    joinedAt: serverTimestamp(),
  };
  await assertFails(setDoc(doc(newDb, 'users', 'new'), { ...profile, role: 'Admin' }));
  await assertFails(setDoc(doc(newDb, 'users', 'new'), { ...profile, role: 'Collector' }));
  await assertFails(
    setDoc(doc(newDb, 'users', 'new'), { ...profile, email: 'admin@example.test' }),
  );
  await assertSucceeds(setDoc(doc(newDb, 'users', 'new'), profile));
});

test('only admins approve collectors; users cannot promote themselves or read other profiles', async () => {
  await assertFails(updateDoc(doc(db('resident'), 'users', 'resident'), { role: 'Admin' }));
  await assertFails(updateDoc(doc(db('resident'), 'users', 'resident'), { role: 'Collector' }));
  await assertFails(getDoc(doc(db('resident'), 'users', 'other')));
  await assertFails(getDocs(collection(db('resident'), 'users')));
  await assertSucceeds(
    updateDoc(doc(db('resident'), 'users', 'resident'), {
      name: 'Updated name',
      phone: '09123456789',
    }),
  );
  await assertFails(
    updateDoc(doc(db('resident'), 'users', 'resident'), { email: 'fake@example.test' }),
  );
  await assertSucceeds(updateDoc(doc(db('admin'), 'users', 'other'), { role: 'Collector' }));
  await assertFails(updateDoc(doc(db('admin'), 'users', 'resident'), { role: 'Admin' }));
  await assertFails(updateDoc(doc(db('admin'), 'users', 'admin'), { role: 'Resident' }));
});

test('submission atomically creates private photo and retries do not duplicate the report', async () => {
  await submitCloudReport(db('resident'), people.resident, draft());
  await submitCloudReport(db('resident'), people.resident, draft());
  const report = await load();
  assert.equal(report.revision, 1);
  assert.equal(report.status, 'Submitted');
  assert.equal(report.history.length, 1);
  assert.equal(
    (await getDoc(doc(db('resident'), 'reports', 'report1', 'evidence', 'main'))).data().dataUrl,
    photo,
  );
  await assertFails(getDoc(doc(db('other'), 'reports', 'report1')));
  await assertFails(getDoc(doc(db('other'), 'reports', 'report1', 'evidence', 'main')));
  await assertFails(getDoc(doc(db('collector'), 'reports', 'report1')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'reports', 'report1')));
  await assertFails(deleteDoc(doc(db('resident'), 'reports', 'report1')));
});

test('resident and collector queries are scoped to their reports', async () => {
  await submitCloudReport(db('resident'), people.resident, draft());
  await assertSucceeds(
    getDocs(query(collection(db('resident'), 'reports'), where('resident', '==', 'resident'))),
  );
  await assertFails(getDocs(collection(db('resident'), 'reports')));
  await assertSucceeds(getDocs(collection(db('admin'), 'reports')));
  await transition('admin', 'Assigned', 'Collect today', 'collector');
  await assertSucceeds(
    getDocs(query(collection(db('collector'), 'reports'), where('collector', '==', 'collector'))),
  );
  await assertFails(getDocs(collection(db('collector'), 'reports')));
});

test('resident → admin → collector lifecycle enforces transitions and append-only history', async () => {
  await submitCloudReport(db('resident'), people.resident, draft());
  await assert.rejects(transition('resident', 'Resolved'));
  await transition('admin', 'Under Review');
  await transition('admin', 'Assigned', 'Collect today', 'collector');
  await assertSucceeds(getDoc(doc(db('collector'), 'reports', 'report1', 'evidence', 'main')));
  await assert.rejects(transition('collector2', 'In Progress'));
  await assert.rejects(transition('collector', 'Resolved'));
  await transition('collector', 'In Progress');
  await assert.rejects(transition('admin', 'Resolved'));
  await assert.rejects(transition('collector', 'Resolved', 'Collected successfully'));
  await transition('collector', 'Resolved', 'Collected successfully', undefined, photo);
  assert.equal(
    (await getDoc(doc(db('resident'), 'reports', 'report1', 'evidence', 'completion'))).data()
      .dataUrl,
    photo,
  );
  await assertSucceeds(getDoc(doc(db('admin'), 'reports', 'report1', 'evidence', 'completion')));
  await assertFails(getDoc(doc(db('other'), 'reports', 'report1', 'evidence', 'completion')));
  await assertFails(getDoc(doc(db('collector2'), 'reports', 'report1', 'evidence', 'completion')));
  await assertFails(
    updateDoc(doc(db('collector'), 'reports', 'report1', 'evidence', 'completion'), {
      dataUrl: photo,
    }),
  );
  const report = await load();
  assert.deepEqual(
    report.history.map((h) => h.status),
    ['Submitted', 'Under Review', 'Assigned', 'In Progress', 'Resolved'],
  );
  assert.equal(report.history.at(-1).actor, 'collector');
  await assert.rejects(transition('admin', 'Assigned', 'Reopen', 'collector2'));
});

test('raw writes cannot bypass transitions, overwrite evidence, or rewrite prior history', async () => {
  await submitCloudReport(db('resident'), people.resident, draft());
  const current = await load();
  const patch = {
    status: 'Resolved',
    revision: 2,
    updatedAt: serverTimestamp(),
    history: [
      ...current.history,
      { status: 'Resolved', date: new Date().toISOString(), note: 'Spoofed', actor: 'resident' },
    ],
  };
  await assertFails(updateDoc(doc(db('resident'), 'reports', 'report1'), patch));
  await assertFails(
    updateDoc(doc(db('admin'), 'reports', 'report1'), {
      ...patch,
      history: [...current.history, { ...patch.history[1], actor: 'admin' }],
    }),
  );
  await assertFails(
    updateDoc(doc(db('resident'), 'reports', 'report1', 'evidence', 'main'), { dataUrl: photo }),
  );
  await transition('admin', 'Under Review');
  const reviewed = await load();
  await assertFails(
    updateDoc(doc(db('admin'), 'reports', 'report1'), {
      status: 'Rejected',
      revision: 3,
      updatedAt: serverTimestamp(),
      history: [
        { ...reviewed.history[0], note: 'Rewritten' },
        reviewed.history[1],
        { status: 'Rejected', date: new Date().toISOString(), note: 'Reason', actor: 'admin' },
      ],
    }),
  );
});

test('completion requires an atomic photo and note from the assigned collector', async () => {
  await submitCloudReport(db('resident'), people.resident, {
    ...draft(),
    latitude: 7.4478,
    longitude: 125.8078,
    locationSource: 'gps',
    locationAccuracy: 20,
  });
  await transition('admin', 'Assigned', 'Collect today', 'collector');
  await transition('collector', 'In Progress');
  const current = await load();
  const patch = {
    status: 'Resolved',
    revision: current.revision + 1,
    updatedAt: serverTimestamp(),
    hasCompletionPhoto: true,
    history: [
      ...current.history,
      {
        status: 'Resolved',
        date: new Date().toISOString(),
        note: 'Area cleaned',
        actor: 'collector',
      },
    ],
  };
  await assertFails(updateDoc(doc(db('collector'), 'reports', 'report1'), patch));
  await assertFails(
    setDoc(doc(db('collector'), 'reports', 'report1', 'evidence', 'completion'), {
      dataUrl: photo,
    }),
  );
  await assertFails(
    setDoc(doc(db('resident'), 'reports', 'report1', 'evidence', 'completion'), { dataUrl: photo }),
  );
  const collectorDb = db('collector');
  const bad = writeBatch(collectorDb);
  bad.update(doc(collectorDb, 'reports', 'report1'), patch);
  bad.set(doc(collectorDb, 'reports', 'report1', 'evidence', 'completion'), {
    dataUrl: 'data:image/jpeg;base64,' + 'A'.repeat(240001),
  });
  await assertFails(bad.commit());
  await assert.rejects(transition('collector', 'Resolved', '', undefined, photo));
  await assert.rejects(transition('collector', 'Resolved', 'A'.repeat(501), undefined, photo));
  await transition('collector', 'Resolved', 'Area cleaned', undefined, photo);
  assert.equal((await load()).locationAccuracy, 20);
});

test('reassignment immediately removes old collector access', async () => {
  await submitCloudReport(db('resident'), people.resident, draft());
  await transition('admin', 'Assigned', 'First assignment', 'collector');
  await transition('admin', 'Assigned', 'Reassigned', 'collector2');
  await assertFails(getDoc(doc(db('collector'), 'reports', 'report1')));
  await assertFails(getDoc(doc(db('collector'), 'reports', 'report1', 'evidence', 'main')));
  await assertSucceeds(getDoc(doc(db('collector2'), 'reports', 'report1')));
});

test('stale updates are rejected rather than overwriting a newer status', async () => {
  await submitCloudReport(db('resident'), people.resident, draft());
  const stale = await load();
  await transition('admin', 'Under Review');
  await assert.rejects(
    transitionCloudReport(db('admin'), people.admin, stale, 'Rejected', 'Outdated rejection'),
    /changed/,
  );
  assert.equal((await load()).status, 'Under Review');
});

test('reports require their photo in the same atomic write; photo payloads are bounded', async () => {
  await submitCloudReport(db('resident'), people.resident, draft());
  const base = await load();
  const fresh = {
    ...base,
    id: 'incomplete',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await assertFails(setDoc(doc(db('resident'), 'reports', 'incomplete'), fresh));
  const residentDb = db('resident');
  const batch = writeBatch(residentDb);
  batch.set(doc(residentDb, 'reports', 'incomplete'), fresh);
  batch.set(doc(residentDb, 'reports', 'incomplete', 'evidence', 'main'), {
    dataUrl: 'data:image/jpeg;base64,' + 'A'.repeat(240001),
  });
  await assertFails(batch.commit());
  await assertFails(
    setDoc(doc(db('resident'), 'reports', 'missing', 'evidence', 'main'), { dataUrl: photo }),
  );
  await assert.rejects(
    submitCloudReport(db('resident'), people.resident, {
      ...draft('badgps'),
      latitude: 91,
      longitude: 125,
    }),
  );
});

test('read receipts are private and cannot mark nonexistent future updates read', async () => {
  await submitCloudReport(db('resident'), people.resident, draft());
  await assertSucceeds(
    setDoc(doc(db('resident'), 'users', 'resident', 'reads', 'report1'), { revision: 1 }),
  );
  await assertFails(
    setDoc(doc(db('resident'), 'users', 'resident', 'reads', 'report1'), { revision: 999 }),
  );
  await assertFails(
    setDoc(doc(db('other'), 'users', 'resident', 'reads', 'report1'), { revision: 1 }),
  );
  await assertFails(getDoc(doc(db('other'), 'users', 'resident', 'reads', 'report1')));
});

test('mark all read handles more reports than one atomic rule access budget', async () => {
  const reports = Array.from({ length: 25 }, (_, index) => ({
    ...draft(`read-${index}`),
    revision: 1,
  }));
  await env.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();
    const batch = writeBatch(database);
    reports.forEach((report) => batch.set(doc(database, 'reports', report.id), report));
    await batch.commit();
  });
  const database = db('resident');
  await assertSucceeds(markCloudReportsRead(database, 'resident', reports));
  const receipts = await getDocs(collection(database, 'users', 'resident', 'reads'));
  assert.equal(receipts.size, 25);
  assert.ok(receipts.docs.every((receipt) => receipt.data().revision === 1));
});

test('device tokens are private and only the owning account can register or remove them', async () => {
  const device = doc(db('resident'), 'users', 'resident', 'devices', 'phone');
  const data = {
    token: 'ExpoPushToken[test-device]',
    platform: 'android',
    updatedAt: serverTimestamp(),
  };
  await assertSucceeds(setDoc(device, data));
  await assertFails(getDoc(doc(db('other'), 'users', 'resident', 'devices', 'phone')));
  await assertFails(getDoc(doc(db('admin'), 'users', 'resident', 'devices', 'phone')));
  await assertFails(setDoc(doc(db('other'), 'users', 'resident', 'devices', 'phone'), data));
  await assertFails(setDoc(device, { ...data, token: 'not-an-expo-token' }));
  await assertFails(setDoc(device, { ...data, platform: 'web' }));
  await assertSucceeds(deleteDoc(device));
});

test('notification jobs match an atomic transition and cannot be forged or read by app accounts', async () => {
  await submitCloudReport(db('resident'), people.resident, draft());
  const payload = {
    reportId: 'report1',
    revision: 2,
    status: 'Assigned',
    resident: 'resident',
    collector: 'collector',
    createdAt: serverTimestamp(),
    nextAttemptAt: serverTimestamp(),
    state: 'queued',
  };
  await assertFails(
    setDoc(doc(db('resident'), 'reports', 'report1', 'notifications', '2'), payload),
  );
  await assertFails(setDoc(doc(db('admin'), 'reports', 'report1', 'notifications', '2'), payload));
  await transition('admin', 'Assigned', 'Collect today', 'collector');
  for (const who of ['resident', 'collector', 'admin'])
    await assertFails(getDoc(doc(db(who), 'reports', 'report1', 'notifications', '2')));
  await env.withSecurityRulesDisabled(async (context) => {
    const queued = (
      await getDoc(doc(context.firestore(), 'reports', 'report1', 'notifications', '2'))
    ).data();
    assert.equal(queued.status, 'Assigned');
    assert.equal(queued.state, 'queued');
    assert.equal(queued.collector, 'collector');
  });
});

test('stale read requests do not move the unread revision backwards', async () => {
  await submitCloudReport(db('resident'), people.resident, draft());
  await transition('admin', 'Under Review');
  const current = await load();
  await markCloudReportsRead(db('resident'), 'resident', [current]);
  await markCloudReportsRead(db('resident'), 'resident', [{ ...current, revision: 1 }]);
  await assertFails(
    setDoc(doc(db('resident'), 'users', 'resident', 'reads', 'report1'), { revision: 1 }),
  );
  await assertSucceeds(
    setDoc(doc(db('resident'), 'users', 'resident', 'reads', 'report1'), { revision: 2 }),
  );
  assert.equal(
    (await getDoc(doc(db('resident'), 'users', 'resident', 'reads', 'report1'))).data().revision,
    2,
  );
});

test('owner retention uses an atomic precondition, removes photos and preserves report history', async () => {
  await submitCloudReport(db('resident'), people.resident, draft());
  await transition('admin', 'Rejected', 'Not eligible for collection');
  const oldDate = '2025-01-01T00:00:00Z';
  await env.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'reports', 'report1'), {
      updatedAt: Timestamp.fromDate(new Date(oldDate)),
    });
  });
  const client = Object.fromEntries(
    ['get', 'post', 'patch', 'delete'].map((method) => [
      method,
      async (path, bodyOrOptions, options = {}) => {
        const body = ['get', 'delete'].includes(method) ? undefined : bodyOrOptions;
        const params = ['get', 'delete'].includes(method)
          ? bodyOrOptions?.queryParams
          : options.queryParams;
        const url = new URL(`http://127.0.0.1:8080${path}`);
        for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);
        const response = await fetch(url, {
          method: method.toUpperCase(),
          headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        const data = await response.json();
        if (!response.ok)
          throw Object.assign(Error('Emulator request failed'), { status: response.status });
        return { body: data };
      },
    ]),
  );
  const repo = await createRepository({ client, projectId: 'demo-cleantrack' });
  const report = await repo.getReport('report1');
  await assertFails(
    updateDoc(doc(db('admin'), 'reports', 'report1'), {
      photosExpiredAt: new Date().toISOString(),
    }),
  );
  assert.equal(await expireReportPhotos(repo, report, new Date(), false), true);
  assert.equal(
    (await getDoc(doc(db('resident'), 'reports', 'report1', 'evidence', 'main'))).exists(),
    true,
  );
  await env.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'reports', 'report1'), { title: 'Updated by owner' });
  });
  await assert.rejects(expireReportPhotos(repo, report, new Date(), true));
  assert.equal(
    (await getDoc(doc(db('resident'), 'reports', 'report1', 'evidence', 'main'))).exists(),
    true,
  );
  const fresh = await repo.getReport('report1');
  await expireReportPhotos(repo, fresh, new Date(), true);
  const retained = await load();
  assert.equal(retained.status, 'Rejected');
  assert.deepEqual(retained.history, fresh.data.history);
  assert.equal(retained.title, 'Updated by owner');
  assert.ok(retained.photosExpiredAt);
  assert.equal(
    (await getDoc(doc(db('resident'), 'reports', 'report1', 'evidence', 'main'))).exists(),
    false,
  );
});
