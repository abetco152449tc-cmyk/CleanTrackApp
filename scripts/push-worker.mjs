import { createRequire } from 'node:module';
import { deliverPushJob, runPhotoRetention } from '../server/maintenance-core.mjs';
const { createRepository } = createRequire(import.meta.url)('./maintenance-repository.cjs');
const args = process.argv.slice(2);
if (
  args.some((arg) => !['--once', '--watch', '--retention'].includes(arg)) ||
  (args.includes('--once') && args.includes('--watch'))
)
  throw Error(
    'Usage: npm run notifications:worker -- [--once | --watch] [--retention]. Default previews jobs without sending.',
  );
if (args.includes('--retention') && !args.includes('--once') && !args.includes('--watch'))
  throw Error('Use --retention with --once or --watch to apply the 180-day photo policy.');

async function expoRequest(path, body) {
  const response = await fetch(`https://exp.host/--/api/v2/push/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.EXPO_ACCESS_TOKEN
        ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }
        : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw Error('Expo push service request failed.');
  const result = await response.json();
  if (result.errors?.length || !result.data) throw Error('Expo rejected the push request.');
  return result.data;
}
const sender = {
  async send(messages) {
    const tickets = [];
    for (let offset = 0; offset < messages.length; offset += 100)
      tickets.push(...(await expoRequest('send', messages.slice(offset, offset + 100))));
    return tickets;
  },
  async receipts(ids) {
    const result = {};
    for (let offset = 0; offset < ids.length; offset += 1000)
      Object.assign(
        result,
        await expoRequest('getReceipts', { ids: ids.slice(offset, offset + 1000) }),
      );
    return result;
  },
};
try {
  const repo = await createRepository();
  const send = args.includes('--once') || args.includes('--watch');
  let nextCleanup = 0;
  async function cycle() {
    const jobs = await repo.listDueJobs(new Date());
    if (!send) {
      console.log(
        `Preview: ${jobs.length} due notification jobs in ${repo.project}. No messages sent.`,
      );
      return;
    }
    const counts = {};
    for (const job of jobs) {
      const result = await deliverPushJob(repo, sender, job);
      counts[result] = (counts[result] ?? 0) + 1;
    }
    console.log(`Notification cycle: ${JSON.stringify(counts)}`);
    if (args.includes('--retention') && Date.now() >= nextCleanup) {
      const cleanup = await runPhotoRetention(repo, new Date(), true);
      console.log(
        `180-day photo cleanup: ${JSON.stringify(cleanup)}. Text and timelines retained.`,
      );
      nextCleanup = Date.now() + (cleanup.failed ? 3600000 : 24 * 3600000);
    }
  }
  await cycle();
  if (args.includes('--watch')) {
    console.log('Worker running. Checking due jobs every 60 seconds; keep this process online.');
    let running = false;
    setInterval(async () => {
      if (running) return;
      running = true;
      try {
        await cycle();
      } catch {
        console.error('Notification cycle failed. Check owner login, indexes, and connectivity.');
      } finally {
        running = false;
      }
    }, 60000);
  }
} catch (error) {
  console.error(error.message || 'Notification worker failed.');
  process.exitCode = 1;
}
