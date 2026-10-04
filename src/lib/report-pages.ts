import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  collection,
  documentId,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  where,
  type Firestore,
  type QueryDocumentSnapshot,
  type QueryConstraint,
} from 'firebase/firestore';
import type { Report, Role } from './store-context';
import { cloudErrorMessage } from './cloud-errors';

export const REPORT_PAGE_SIZE = 50;
export function reportPageQuery(
  db: Firestore,
  uid: string,
  role: Role,
  cursor?: QueryDocumentSnapshot,
) {
  const filters: QueryConstraint[] =
    role === 'Admin' ? [] : [where(role === 'Resident' ? 'resident' : 'collector', '==', uid)];
  return query(
    collection(db, 'reports'),
    ...filters,
    orderBy('createdAt', 'desc'),
    orderBy(documentId(), 'desc'),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(REPORT_PAGE_SIZE + 1),
  );
}
function readReport(snapshot: QueryDocumentSnapshot): Report {
  const data = snapshot.data();
  return {
    ...data,
    id: snapshot.id,
    collector: data.collector ?? undefined,
    created: data.createdAt?.toDate?.().toISOString() ?? data.created,
  } as Report;
}
export function mergeReportPages(
  older: Report[],
  latest: Report[],
  unavailable: ReadonlySet<string> = new Set(),
) {
  const merged = new Map<string, Report>();
  for (const report of [...older, ...latest]) {
    if (unavailable.has(report.id)) continue;
    const previous = merged.get(report.id);
    // A page fetch can finish after a live detail update. Keep the newer revision.
    if (
      !previous ||
      (report.revision ?? report.history.length) >= (previous.revision ?? previous.history.length)
    )
      merged.set(report.id, report);
  }
  return [...merged.values()].sort(
    (a, b) => b.created.localeCompare(a.created) || b.id.localeCompare(a.id),
  );
}
type Pages = {
  key: string;
  latest: Report[];
  older: Report[];
  cursor?: QueryDocumentSnapshot;
  more: boolean;
  paged: boolean;
  error: string;
  loading: boolean;
};
export function useReportPages(db: Firestore, uid: string, role: Role | undefined, retry: number) {
  const key = `${uid}:${role}`;
  const generation = useRef(0);
  const pending = useRef(false);
  const detailSubscriptions = useRef(new Map<string, { stop: () => void }>());
  const unavailableReports = useRef(new Set<string>());
  const releaseReport = useCallback((id: string) => {
    detailSubscriptions.current.get(id)?.stop();
    detailSubscriptions.current.delete(id);
  }, []);
  const [pages, setPages] = useState<Pages>({
    key: '',
    latest: [],
    older: [],
    more: false,
    paged: false,
    error: '',
    loading: false,
  });
  useLayoutEffect(() => {
    const version = ++generation.current;
    const subscriptions = detailSubscriptions.current;
    const unavailable = unavailableReports.current;
    unavailable.clear();
    pending.current = false;
    if (!role) return;
    const stopLatest = onSnapshot(
      reportPageQuery(db, uid, role),
      (snapshot) => {
        if (version !== generation.current) return;
        if (!snapshot.metadata.fromCache)
          for (const report of snapshot.docs) unavailable.delete(report.id);
        const latest = mergeReportPages(
          [],
          snapshot.docs.slice(0, REPORT_PAGE_SIZE).map(readReport),
          unavailable,
        );
        const removed = snapshot
          .docChanges()
          .filter((change) => change.type === 'removed')
          .map((change) => change.doc.id);
        setPages((previous) => {
          const same = previous.key === key;
          const latestIds = new Set(latest.map((report) => report.id));
          const older = same
            ? mergeReportPages(
                previous.older.filter((r) => !removed.includes(r.id)),
                removed.length ? snapshot.docs.slice(REPORT_PAGE_SIZE).map(readReport) : [],
                unavailable,
              )
            : [];
          return {
            key,
            latest: same
              ? mergeReportPages(
                  previous.latest.filter((report) => latestIds.has(report.id)),
                  latest,
                  unavailable,
                )
              : latest,
            older,
            cursor:
              same && previous.paged
                ? previous.cursor
                : (snapshot.docs[REPORT_PAGE_SIZE - 1] ?? snapshot.docs.at(-1)),
            more: same && previous.paged ? previous.more : snapshot.docs.length > REPORT_PAGE_SIZE,
            paged: same && previous.paged,
            error: '',
            loading: same && previous.loading,
          };
        });
        // A removal can mean a new report pushed this one off the live page, or access was revoked.
        // Fetch it under the current rules before keeping it in the loaded history.
        for (const id of removed)
          void getDoc(doc(db, 'reports', id))
            .then((report) => {
              if (version !== generation.current) return;
              if (!report.exists()) {
                unavailable.add(id);
                setPages((p) => ({
                  ...p,
                  latest: p.latest.filter((item) => item.id !== id),
                  older: p.older.filter((item) => item.id !== id),
                }));
                return;
              }
              const value = readReport(report);
              if (
                role !== 'Admin' &&
                (role === 'Resident' ? value.resident !== uid : value.collector !== uid)
              )
                return;
              if (!report.metadata.fromCache) unavailable.delete(id);
              setPages((p) => ({ ...p, older: mergeReportPages(p.older, [value], unavailable) }));
            })
            .catch((error) => {
              if (version !== generation.current || error?.code !== 'permission-denied') return;
              unavailable.add(id);
              setPages((p) => ({
                ...p,
                latest: p.latest.filter((report) => report.id !== id),
                older: p.older.filter((report) => report.id !== id),
              }));
            });
      },
      (error) => {
        if (version === generation.current)
          setPages({
            key,
            latest: [],
            older: [],
            more: false,
            paged: false,
            loading: false,
            error: cloudErrorMessage(error),
          });
      },
    );
    return () => {
      generation.current = version + 1;
      stopLatest();
      for (const subscription of subscriptions.values()) subscription.stop();
      subscriptions.clear();
    };
  }, [db, uid, role, retry, key]);
  async function loadMoreReports() {
    if (!role || pages.key !== key || !pages.more || !pages.cursor || pending.current) return;
    const version = generation.current;
    pending.current = true;
    setPages((p) => ({ ...p, loading: true, error: '' }));
    try {
      const snapshot = await getDocs(reportPageQuery(db, uid, role, pages.cursor));
      if (version !== generation.current) return;
      setPages((p) => ({
        ...p,
        older: mergeReportPages(
          p.older,
          snapshot.docs.slice(0, REPORT_PAGE_SIZE).map(readReport),
          unavailableReports.current,
        ),
        cursor: snapshot.docs[Math.min(REPORT_PAGE_SIZE, snapshot.docs.length) - 1] ?? p.cursor,
        paged: true,
        more: snapshot.docs.length > REPORT_PAGE_SIZE,
        loading: false,
        error: '',
      }));
    } catch (error) {
      if (version === generation.current)
        setPages((p) => ({ ...p, loading: false, error: cloudErrorMessage(error) }));
    } finally {
      if (version === generation.current) pending.current = false;
    }
  }
  const loadReport = useCallback(
    async (id: string) => {
      if (!role) return;
      const version = generation.current;
      releaseReport(id);
      const subscription = { stop: () => {} };
      detailSubscriptions.current.set(id, subscription);
      const current = () =>
        version === generation.current && detailSubscriptions.current.get(id) === subscription;
      const saveReport = (value: Report) => {
        setPages((p) => ({
          ...(p.key === key
            ? p
            : { key, latest: [], older: [], more: false, paged: false, loading: false, error: '' }),
          latest:
            p.key === key
              ? p.latest.map((r) => (r.id === id ? mergeReportPages([r], [value])[0] : r))
              : [],
          older:
            p.key === key && p.latest.some((r) => r.id === id)
              ? p.older.filter((r) => r.id !== id)
              : mergeReportPages(p.key === key ? p.older : [], [value]),
        }));
      };
      const removeReport = () => {
        if (!current()) return;
        unavailableReports.current.add(id);
        setPages((p) => ({
          ...p,
          latest: p.latest.filter((r) => r.id !== id),
          older: p.older.filter((r) => r.id !== id),
        }));
      };
      try {
        const ref = doc(db, 'reports', id);
        const snapshot = await getDoc(ref);
        if (!current()) return;
        if (!snapshot.exists()) throw Error('This report is no longer available.');
        if (unavailableReports.current.has(id) && snapshot.metadata.fromCache)
          throw Error('This report is no longer available. Reconnect and retry to check access.');
        if (!snapshot.metadata.fromCache) unavailableReports.current.delete(id);
        saveReport(readReport(snapshot));
        // Open details remain live even when the report is outside the newest list page.
        // Closing details or changing account roles releases the listener.
        subscription.stop = onSnapshot(
          ref,
          (report) => {
            if (!current()) return;
            if (report.exists()) {
              if (!report.metadata.fromCache) unavailableReports.current.delete(id);
              if (!unavailableReports.current.has(id)) saveReport(readReport(report));
            } else removeReport();
          },
          removeReport,
        );
      } catch (error) {
        removeReport();
        if (current()) releaseReport(id);
        throw error;
      }
    },
    [db, role, key, releaseReport],
  );
  return {
    reports:
      pages.key === key
        ? mergeReportPages(pages.older, pages.latest, unavailableReports.current)
        : [],
    hasMoreReports: pages.key === key && pages.more,
    loadingMoreReports: pages.key === key && pages.loading,
    paginationError: pages.key === key ? pages.error : '',
    loadMoreReports,
    loadReport,
    releaseReport,
  };
}
