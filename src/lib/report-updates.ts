import type { Person, Report } from './store-context';

export function reportUpdates(reports: Report[], user: Person, reads: Record<string, number> = {}) {
  return reports
    .filter(
      (r) =>
        user.role === 'Admin' ||
        (user.role === 'Resident' ? r.resident === user.id : r.collector === user.id),
    )
    .flatMap((report) =>
      report.history.map((event, index) => ({
        ...event,
        report,
        revision: index + 1,
        id: `${report.id}-${index}`,
        unread: index + 1 > (reads[report.id] ?? 0),
        message:
          event.status === 'Assigned'
            ? user.role === 'Collector'
              ? 'New collection task'
              : user.role === 'Admin'
                ? 'Report assigned to a collector'
                : 'Your report has been assigned'
            : event.status === 'Resolved'
              ? 'Cleanup completed'
              : event.status,
      })),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
}

export const unreadReportUpdates = (
  reports: Report[],
  user?: Person,
  reads?: Record<string, number>,
) => (user ? reportUpdates(reports, user, reads).filter((event) => event.unread).length : 0);
