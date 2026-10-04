import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deliverPushJob,
  expireReportPhotos,
  photoRetentionEligible,
  runPhotoRetention,
} from '../server/maintenance-core.mjs';
import { createRequire } from 'node:module';
const { encode, decode } = createRequire(import.meta.url)('../scripts/maintenance-repository.cjs');
const now = new Date('2026-10-04T00:00:00Z');
function setup(status = 'Assigned') {
  const job = {
    name: 'reports/r1/notifications/2',
    version: 'v1',
    data: {
      reportId: 'r1',
      revision: 2,
      resident: 'resident',
      collector: 'collector',
      status,
      state: 'queued',
      createdAt: now.toISOString(),
      nextAttemptAt: now.toISOString(),
    },
  };
  const devices = new Map([
    ['resident:d1', { id: 'd1', data: { token: 'ExpoPushToken[resident-token]' } }],
    ['collector:d2', { id: 'd2', data: { token: 'ExponentPushToken[collector-token]' } }],
  ]);
  const removed = [];
  let version = 1;
  const repo = {
    job,
    report: { data: { resident: 'resident', collector: 'collector', status: 'Assigned' } },
    async saveJob(old, data) {
      if (old.version !== this.job.version) return null;
      this.job = { ...old, version: `v${++version}`, data: structuredClone(data) };
      return this.job;
    },
    async getReport() {
      return this.report;
    },
    async getPerson(uid) {
      return { role: uid === 'collector' ? 'Collector' : 'Resident' };
    },
    async listDevices(uid) {
      return [...devices.entries()]
        .filter(([key]) => key.startsWith(`${uid}:`))
        .map(([, value]) => value);
    },
    async getDevice(uid, deviceId) {
      return devices.get(`${uid}:${deviceId}`);
    },
    async removeDeviceIfTokenMatches(uid, deviceId, token) {
      const key = `${uid}:${deviceId}`;
      if (devices.get(key)?.data.token === token) {
        removed.push(key);
        devices.delete(key);
      }
    },
  };
  const messages = [];
  const sender = {
    async send(batch) {
      messages.push(...batch);
      return batch.map((_, index) => ({ status: 'ok', id: `ticket-${index}` }));
    },
    async receipts(ids) {
      return Object.fromEntries(ids.map((id) => [id, { status: 'ok' }]));
    },
  };
  return { repo, sender, messages, devices, removed };
}
test('assignment reaches the resident and assigned collector, then waits for receipts', async () => {
  const { repo, sender, messages } = setup();
  assert.equal(await deliverPushJob(repo, sender, repo.job, now), 'receipts');
  assert.equal(messages.length, 2);
  assert.deepEqual(
    messages.map((m) => m.title),
    ['Report assigned', 'New collection task'],
  );
  assert.deepEqual(
    messages.map((m) => m.data.recipientId),
    ['resident', 'collector'],
  );
  assert.equal(await deliverPushJob(repo, sender, repo.job, now), 'skipped');
  assert.equal(
    await deliverPushJob(repo, sender, repo.job, new Date(now.getTime() + 16 * 60000)),
    'delivered',
  );
  assert.equal(messages.length, 2);
});
test('resolution alerts the resident, and a reassigned collector does not get an old task', async () => {
  const resolved = setup('Resolved');
  await deliverPushJob(resolved.repo, resolved.sender, resolved.repo.job, now);
  assert.equal(resolved.messages.length, 1);
  assert.equal(resolved.messages[0].title, 'Cleanup completed');
  const reassigned = setup();
  reassigned.repo.report.data.collector = 'different-collector';
  await deliverPushJob(reassigned.repo, reassigned.sender, reassigned.repo.job, now);
  assert.equal(reassigned.messages.length, 1);
  assert.equal(reassigned.messages[0].data.recipientId, 'resident');
});
test('a promoted resident is not sent a report that their new role cannot open', async () => {
  const { repo, sender, messages } = setup();
  repo.getPerson = async () => ({ role: 'Collector' });
  await deliverPushJob(repo, sender, repo.job, now);
  assert.deepEqual(
    messages.map((message) => message.data.recipientId),
    ['collector'],
  );
});
test('late delivery waits for receipts from send time instead of original queue time', async () => {
  const { repo, sender } = setup();
  repo.job.data.createdAt = new Date(now.getTime() - 2 * 86400000).toISOString();
  await deliverPushJob(repo, sender, repo.job, now);
  sender.receipts = async () => ({});
  const pending = new Date(now.getTime() + 16 * 60000);
  assert.equal(await deliverPushJob(repo, sender, repo.job, pending), 'receipts');
  assert.ok(repo.job.data.entries.every((entry) => entry.state === 'receipt'));
  const expired = new Date(now.getTime() + 25 * 3600000);
  assert.equal(await deliverPushJob(repo, sender, repo.job, expired), 'failed');
  assert.ok(repo.job.data.entries.every((entry) => entry.error === 'ReceiptNotAvailable'));
});
test('a failed send preserves the job and backs off before retrying', async () => {
  const { repo, sender, messages } = setup();
  const send = sender.send;
  sender.send = async () => {
    throw Error('Temporary network failure');
  };
  assert.equal(await deliverPushJob(repo, sender, repo.job, now), 'retry');
  assert.equal(repo.job.data.state, 'queued');
  assert.equal(await deliverPushJob(repo, sender, repo.job, now), 'skipped');
  sender.send = send;
  assert.equal(
    await deliverPushJob(repo, sender, repo.job, new Date(now.getTime() + 3 * 60000)),
    'receipts',
  );
  assert.equal(messages.length, 2);
});
test('concurrent workers cannot send the same leased job twice', async () => {
  const { repo, sender, messages } = setup();
  const old = structuredClone(repo.job);
  const results = await Promise.all([
    deliverPushJob(repo, sender, old, now),
    deliverPushJob(repo, sender, old, now),
  ]);
  assert.ok(results.includes('claimed-elsewhere'));
  assert.equal(messages.length, 2);
});
test('dead tokens are removed, but a rotated token is preserved', async () => {
  const { repo, sender, devices, removed } = setup('Resolved');
  await deliverPushJob(repo, sender, repo.job, now);
  sender.receipts = async () => ({
    'ticket-0': { status: 'error', details: { error: 'DeviceNotRegistered' } },
  });
  devices.get('resident:d1').data.token = 'ExpoPushToken[new-token]';
  await deliverPushJob(repo, sender, repo.job, new Date(now.getTime() + 16 * 60000));
  assert.deepEqual(removed, []);
  assert.equal(devices.get('resident:d1').data.token, 'ExpoPushToken[new-token]');
});
test('retention expires only closed reports at 180 days, and preview never deletes', async () => {
  const cutoff = new Date(now.getTime() - 180 * 86400000).toISOString();
  assert.equal(photoRetentionEligible({ status: 'Resolved', updatedAt: cutoff }, now), true);
  assert.equal(photoRetentionEligible({ status: 'Rejected', updatedAt: cutoff }, now), true);
  for (const status of ['Submitted', 'Under Review', 'Assigned', 'In Progress'])
    assert.equal(photoRetentionEligible({ status, updatedAt: cutoff }, now), false);
  assert.equal(
    photoRetentionEligible(
      { status: 'Resolved', updatedAt: new Date(Date.parse(cutoff) + 1).toISOString() },
      now,
    ),
    false,
  );
  assert.equal(photoRetentionEligible({ status: 'Resolved', updatedAt: 'bad-date' }, now), false);
  assert.equal(
    photoRetentionEligible(
      { status: 'Resolved', updatedAt: cutoff, photosExpiredAt: now.toISOString() },
      now,
    ),
    false,
  );
  const calls = [];
  const repo = {
    async expirePhotos(report, date) {
      calls.push({ report, date });
    },
  };
  const report = { version: 'v1', data: { status: 'Resolved', updatedAt: cutoff } };
  assert.equal(await expireReportPhotos(repo, report, now), true);
  assert.equal(calls.length, 0);
  await expireReportPhotos(repo, report, now, true);
  assert.equal(calls[0].report.version, 'v1');
  assert.equal(calls.length, 1);
});
test('Firestore REST values preserve timestamps, numbers and nested ticket entries', () => {
  const source = {
    createdAt: now,
    attempts: 2,
    entries: [{ token: 'ExpoPushToken[test]', ticket: 'ticket-1', enabled: true }],
    optional: null,
  };
  const encoded = encode(source);
  assert.equal(encoded.mapValue.fields.createdAt.timestampValue, now.toISOString());
  assert.deepEqual(decode(encoded), { ...source, createdAt: now.toISOString() });
});

test('retention scans every page beyond 200 reports and reports changed-document failures', async () => {
  const records = Array.from({ length: 205 }, (_, index) => ({
    id: String(index),
    version: 'v1',
    data: { status: 'Resolved', updatedAt: '2025-01-01T00:00:00Z' },
  }));
  let writes = 0;
  const repo = {
    async listReports(cursor = '0') {
      const offset = Number(cursor);
      return {
        records: records.slice(offset, offset + 100),
        next: offset + 100 < records.length ? String(offset + 100) : undefined,
      };
    },
    async expirePhotos(report) {
      if (report.id === '204') throw Error('Report changed');
      writes++;
    },
  };
  assert.deepEqual(await runPhotoRetention(repo, now), { scanned: 205, eligible: 205, failed: 0 });
  assert.equal(writes, 0);
  assert.deepEqual(await runPhotoRetention(repo, now, true), {
    scanned: 205,
    eligible: 204,
    failed: 1,
  });
  assert.equal(writes, 204);
});
