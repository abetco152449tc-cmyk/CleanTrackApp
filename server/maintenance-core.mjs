export const PHOTO_RETENTION_DAYS = 180;
const day = 86400000;
const receiptDelay = 15 * 60000;
const maxAttempts = 8;

export function photoRetentionEligible(report, now = new Date()) {
  const closed = Date.parse(report.updatedAt);
  return (
    ['Resolved', 'Rejected'].includes(report.status) &&
    !report.photosExpiredAt &&
    Number.isFinite(closed) &&
    closed <= now.getTime() - PHOTO_RETENTION_DAYS * day
  );
}

export async function expireReportPhotos(repo, report, now = new Date(), apply = false) {
  if (!photoRetentionEligible(report.data, now)) return false;
  if (apply) await repo.expirePhotos(report, now.toISOString());
  return true;
}

export async function runPhotoRetention(repo, now = new Date(), apply = false) {
  const result = { scanned: 0, eligible: 0, failed: 0 };
  let cursor;
  do {
    const page = await repo.listReports(cursor);
    for (const report of page.records) {
      result.scanned++;
      try {
        if (await expireReportPhotos(repo, report, now, apply)) result.eligible++;
      } catch {
        result.failed++;
      }
    }
    cursor = page.next;
  } while (cursor);
  return result;
}

function backoff(attempts, now) {
  return new Date(now.getTime() + Math.min(6 * 3600000, 60000 * 2 ** Math.min(attempts, 9)));
}
function permittedRecipient(job, report, uid, person) {
  if (!person || !report || !['Resident', 'Collector', 'Admin'].includes(person.role)) return false;
  if (uid === job.resident)
    return report.resident === uid && ['Resident', 'Admin'].includes(person.role);
  return (
    job.status === 'Assigned' &&
    ['Assigned', 'In Progress'].includes(report.status) &&
    uid === job.collector &&
    person.role === 'Collector' &&
    report.collector === uid
  );
}
async function disableDeadToken(repo, entry) {
  await repo.removeDeviceIfTokenMatches(entry.uid, entry.deviceId, entry.token);
}
async function outcome(repo, entry, result, receipt = false, now = new Date()) {
  if (result?.status === 'ok') {
    if (receipt) return { ...entry, state: 'done' };
    if (typeof result.id === 'string')
      return { ...entry, state: 'receipt', ticket: result.id, sentAt: now.toISOString() };
    return { ...entry, state: 'retry' };
  }
  const code = result?.details?.error ?? 'Unknown';
  if (code === 'DeviceNotRegistered') await disableDeadToken(repo, entry);
  return {
    ...entry,
    state: [
      'DeviceNotRegistered',
      'MessageTooBig',
      'InvalidCredentials',
      'MismatchSenderId',
    ].includes(code)
      ? 'failed'
      : 'retry',
    error: code,
  };
}

// The repository uses update-time preconditions to ensure only one worker holds a job lease.
export async function deliverPushJob(repo, sender, job, now = new Date()) {
  if (
    !['queued', 'sending', 'receipts'].includes(job.data.state) ||
    Date.parse(job.data.nextAttemptAt) > now.getTime()
  )
    return 'skipped';
  const attempts = job.data.attempts ?? 0;
  if (attempts >= maxAttempts && job.data.state !== 'receipts') {
    await repo.saveJob(job, { ...job.data, state: 'failed', finishedAt: now });
    return 'failed';
  }
  const claimed = await repo.saveJob(job, {
    ...job.data,
    state: 'sending',
    nextAttemptAt: new Date(now.getTime() + 120000),
  });
  if (!claimed) return 'claimed-elsewhere';
  let entries = job.data.entries ?? [];
  try {
    const report = await repo.getReport(job.data.reportId);
    if (!entries.length) {
      for (const uid of [
        ...new Set([
          job.data.resident,
          ...(job.data.status === 'Assigned' ? [job.data.collector] : []),
        ]),
      ]) {
        if (!uid || !permittedRecipient(job.data, report?.data, uid, await repo.getPerson(uid)))
          continue;
        const devices = await repo.listDevices(uid);
        for (const device of devices)
          if (/^(ExponentPushToken|ExpoPushToken)\[[-A-Za-z0-9_]+\]$/.test(device.data.token))
            entries.push({ uid, deviceId: device.id, token: device.data.token, state: 'retry' });
      }
    }
    for (const entry of entries) {
      if (entry.state !== 'retry') continue;
      const allowed = permittedRecipient(
        job.data,
        report?.data,
        entry.uid,
        await repo.getPerson(entry.uid),
      );
      const current = await repo.getDevice(entry.uid, entry.deviceId);
      if (!allowed || current?.data.token !== entry.token) entry.state = 'cancelled';
    }
    const waiting = entries.filter((entry) => entry.state === 'receipt');
    if (waiting.length) {
      const receipts = await sender.receipts(waiting.map((entry) => entry.ticket));
      for (const entry of waiting) {
        if (receipts[entry.ticket])
          Object.assign(entry, await outcome(repo, entry, receipts[entry.ticket], true));
        else if (Date.parse(entry.sentAt ?? job.data.createdAt) < now.getTime() - day)
          Object.assign(entry, { state: 'failed', error: 'ReceiptNotAvailable' });
      }
    }
    const pending = entries.filter((entry) => entry.state === 'retry');
    // De-duplicate a token registered more than once for the same account.
    const seen = new Set();
    const unique = pending.filter((entry) => {
      const key = `${entry.uid}:${entry.token}`;
      if (seen.has(key)) {
        entry.state = 'cancelled';
        return false;
      }
      seen.add(key);
      return true;
    });
    if (unique.length) {
      const messages = unique.map((entry) => ({
        to: entry.token,
        sound: 'default',
        channelId: 'report-updates',
        ttl: 86400,
        title:
          entry.uid === job.data.collector
            ? 'New collection task'
            : job.data.status === 'Assigned'
              ? 'Report assigned'
              : 'Cleanup completed',
        body:
          entry.uid === job.data.collector
            ? 'A task is ready in CleanTrack.'
            : 'Open CleanTrack to view your report update.',
        data: { reportId: job.data.reportId, recipientId: entry.uid, revision: job.data.revision },
      }));
      const results = await sender.send(messages);
      if (results.length !== unique.length)
        throw Error('Push service returned an incomplete ticket response.');
      for (let index = 0; index < unique.length; index++)
        Object.assign(
          unique[index],
          await outcome(repo, unique[index], results[index], false, now),
        );
    }
    const waitingForReceipt = entries.some((entry) => entry.state === 'receipt');
    const retry = entries.some((entry) => entry.state === 'retry');
    const state = waitingForReceipt
      ? 'receipts'
      : retry
        ? 'queued'
        : entries.some((entry) => entry.state === 'failed')
          ? 'failed'
          : 'delivered';
    await repo.saveJob(claimed, {
      ...job.data,
      entries,
      attempts: attempts + (unique.length ? 1 : 0),
      state,
      nextAttemptAt: waitingForReceipt
        ? new Date(now.getTime() + receiptDelay)
        : backoff(attempts + 1, now),
      ...(!waitingForReceipt && !retry ? { finishedAt: now } : {}),
    });
    return state;
  } catch {
    await repo.saveJob(claimed, {
      ...job.data,
      entries,
      attempts: attempts + 1,
      state: attempts + 1 >= maxAttempts ? 'failed' : 'queued',
      nextAttemptAt: backoff(attempts + 1, now),
      lastError: 'Delivery request failed; retry scheduled.',
    });
    return 'retry';
  }
}
