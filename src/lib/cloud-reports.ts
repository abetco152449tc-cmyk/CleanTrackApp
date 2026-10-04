import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { Person, Report, Status } from './store-context';

export async function markCloudReportsRead(db: Firestore, uid: string, reports: Report[]) {
  // Rules look up each report. Small batches stay within the 20-document access budget.
  for (let offset = 0; offset < reports.length; offset += 8) {
    await runTransaction(db, async (transaction) => {
      const items = reports.slice(offset, offset + 8);
      const refs = items.map((report) => doc(db, 'users', uid, 'reads', report.id));
      const saved = await Promise.all(refs.map((ref) => transaction.get(ref)));
      items.forEach((report, index) => {
        const revision = report.revision ?? report.history.length;
        if (revision > (saved[index].data()?.revision ?? 0))
          transaction.set(refs[index], { revision });
      });
    });
  }
}

export async function submitCloudReport(db: Firestore, user: Person, report: Report) {
  if (user.role !== 'Resident' || report.resident !== user.id)
    throw Error('Only residents can submit their own reports.');
  if (!report.photo?.startsWith('data:image/jpeg;base64,') || report.photo.length > 240000)
    throw Error('Choose a compressed report photo first.');
  const reportRef = doc(db, 'reports', report.id);
  const { photo, ...data } = report;
  await runTransaction(db, async (transaction) => {
    const previous = await transaction.get(reportRef);
    if (previous.exists()) {
      if (previous.data().resident !== user.id)
        throw Error('This report reference is already in use.');
      return; // Reusing a submitted form cannot create a second report after an uncertain response.
    }
    transaction.set(reportRef, {
      ...data,
      residentName: user.name,
      collector: null,
      collectorName: '',
      status: 'Submitted',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      revision: 1,
      hasPhoto: true,
      history: [
        {
          status: 'Submitted',
          date: report.created,
          note: 'Report received. Waiting for barangay review.',
          actor: user.id,
        },
      ],
    });
    transaction.set(doc(reportRef, 'evidence', 'main'), { dataUrl: photo });
  });
}

export async function transitionCloudReport(
  db: Firestore,
  user: Person,
  report: Report,
  status: Status,
  note: string,
  collector?: string,
  completionPhoto?: string,
) {
  if (!note.trim() || note.length > 1000) throw Error('Add a note of up to 1,000 characters.');
  if (status === 'Resolved' && note.trim().length > 500)
    throw Error('Keep the completion note to 500 characters.');
  if (
    status === 'Resolved' &&
    (!completionPhoto?.startsWith('data:image/jpeg;base64,') || completionPhoto.length > 240000)
  )
    throw Error('Attach an after-cleanup photo before completing the collection.');
  await runTransaction(db, async (transaction) => {
    const reportRef = doc(db, 'reports', report.id);
    const snapshot = await transaction.get(reportRef);
    if (!snapshot.exists()) throw Error('Report no longer available.');
    const current = snapshot.data();
    if (current.revision !== report.revision)
      throw Error('This report changed. Review the latest status and try again.');
    const allowed =
      user.role === 'Admin'
        ? (status === 'Under Review' && current.status === 'Submitted') ||
          (status === 'Rejected' && ['Submitted', 'Under Review'].includes(current.status)) ||
          (status === 'Assigned' &&
            ['Submitted', 'Under Review', 'Assigned'].includes(current.status))
        : user.role === 'Collector' &&
          current.collector === user.id &&
          ((current.status === 'Assigned' && status === 'In Progress') ||
            (current.status === 'In Progress' && status === 'Resolved'));
    if (!allowed) throw Error('This status change is not allowed for your account.');
    let collectorName = current.collectorName;
    if (status === 'Assigned') {
      if (!collector) throw Error('Choose a collector.');
      const target = await transaction.get(doc(db, 'users', collector));
      if (!target.exists() || target.data().role !== 'Collector')
        throw Error('Choose an approved collector.');
      collectorName = target.data().name;
    }
    transaction.update(reportRef, {
      status,
      collector: status === 'Assigned' ? collector : current.collector,
      collectorName,
      revision: current.revision + 1,
      updatedAt: serverTimestamp(),
      history: [
        ...current.history,
        {
          status,
          date: new Date().toISOString(),
          note: note.trim(),
          actor: user.id,
          ...(status === 'Assigned' ? { collector } : {}),
        },
      ],
      ...(status === 'Resolved' ? { hasCompletionPhoto: true } : {}),
    });
    if (status === 'Resolved')
      transaction.set(doc(reportRef, 'evidence', 'completion'), { dataUrl: completionPhoto });
    if (status === 'Assigned' || status === 'Resolved')
      transaction.set(doc(reportRef, 'notifications', String(current.revision + 1)), {
        reportId: report.id,
        revision: current.revision + 1,
        status,
        resident: current.resident,
        collector: status === 'Assigned' ? collector : current.collector,
        createdAt: serverTimestamp(),
        nextAttemptAt: serverTimestamp(),
        state: 'queued',
      });
  });
}
