import { createRequire } from 'node:module';
import { expireReportPhotos, PHOTO_RETENTION_DAYS } from '../server/maintenance-core.mjs';
const { createRepository } = createRequire(import.meta.url)('./maintenance-repository.cjs');
const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--apply'))
  throw Error('Usage: npm run photos:cleanup -- [--apply]');
try {
  const repo = await createRepository();
  const apply = args.includes('--apply');
  const now = new Date();
  let cursor;
  let scanned = 0;
  let eligible = 0;
  let failed = 0;
  do {
    const page = await repo.listReports(cursor);
    for (const report of page.records) {
      scanned++;
      try {
        if (await expireReportPhotos(repo, report, now, apply)) eligible++;
      } catch {
        failed++;
        console.error(
          `Skipped changed or unavailable report ${report.id}; retry the cleanup later.`,
        );
      }
    }
    cursor = page.next;
  } while (cursor);
  console.log(
    `${apply ? 'Cleanup' : 'Preview'}: scanned ${scanned}, ${apply ? 'expired' : 'eligible'} ${eligible}, failed ${failed}. Policy: ${PHOTO_RETENTION_DAYS} days after Resolved/Rejected. Text and timelines retained.`,
  );
  if (!apply) console.log('No photos deleted. Apply with npm run photos:cleanup -- --apply');
  if (failed) process.exitCode = 1;
} catch (error) {
  console.error(error.message || 'Photo cleanup failed.');
  process.exitCode = 1;
}
