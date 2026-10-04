import { StoreContext as Context, type Person, type Report, type Status } from './store-context';
import { FirebaseStoreProvider } from './firebase-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useContext, useEffect, useRef, useState } from 'react';

import { firebaseConfigured } from './firebase';
export type { Person, Report, Role, Status } from './store-context';

type Data = {
  users: Person[];
  reports: Report[];
  readsByUser?: Record<string, Record<string, number>>;
};
const users: Person[] = [
  {
    id: 'resident',
    name: 'Maria Santos',
    email: 'maria@cleantrack.demo',
    phone: '',
    role: 'Resident',
  },
  {
    id: 'collector',
    name: 'Ramon Flores',
    email: 'ramon@cleantrack.demo',
    phone: '',
    role: 'Collector',
  },
  {
    id: 'collector2',
    name: 'Juan Dela Cruz',
    email: 'juan@cleantrack.demo',
    phone: '',
    role: 'Collector',
  },
  { id: 'admin', name: 'Admin User', email: 'admin@cleantrack.demo', phone: '', role: 'Admin' },
];
const reports: Report[] = [
  'Garbage on Sidewalk',
  'Overflowing Trash Bin',
  'Illegal Dumping',
  'Trash near Drainage',
].map((title, i) => {
  const status: Status = (['Submitted', 'Under Review', 'Assigned', 'Resolved'] as Status[])[i];
  const created = new Date(Date.now() - i * 86400000).toISOString();
  return {
    id: `CT-DEMO-00${i + 1}`,
    title,
    type: i === 2 ? 'Illegal Dumping' : 'General Waste',
    description:
      'Waste has accumulated near the road. Please arrange collection to keep the area clean.',
    address: `Purok ${i + 1}, Barangay San Isidro, Tagum City`,
    resident: 'resident',
    collector: i > 1 ? 'collector' : undefined,
    status,
    created,
    history: [
      { status: 'Submitted', date: created, note: 'Report received.' },
      ...(i ? [{ status, date: created, note: 'Demo report update.' }] : []),
    ],
  };
});
export function StoreProvider({ children }: { children: React.ReactNode }) {
  return firebaseConfigured ? (
    <FirebaseStoreProvider>{children}</FirebaseStoreProvider>
  ) : (
    <DemoStoreProvider>{children}</DemoStoreProvider>
  );
}

function DemoStoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<Data>({ users, reports });
  const [userId, setUserId] = useState<string>();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const savedData = useRef(data);
  const currentUserId = useRef<string | undefined>(undefined);
  const canSave = useRef(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem('cleantrack-v1')
      .then((raw) => {
        if (!active) return;
        if (raw) {
          const parsed = JSON.parse(raw) as Data;
          if (!Array.isArray(parsed.users) || !Array.isArray(parsed.reports)) throw Error();
          savedData.current = parsed;
          setData(parsed);
        }
        canSave.current = true;
      })
      .catch(() => {
        if (active)
          setError(
            'Saved data could not be loaded. Restart to retry; stored data will not be overwritten.',
          );
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
      canSave.current = false;
    };
  }, []);
  function mutate(change: (previous: Data, actor: Person) => Data) {
    const actorId = currentUserId.current;
    const operation = queue.current
      .catch(() => {})
      .then(async () => {
        if (!canSave.current)
          throw Error('Saved data is not ready. Restart the app to retry before making changes.');
        const previous = savedData.current;
        const actor = previous.users.find((person) => person.id === actorId);
        if (!actor || actorId !== currentUserId.current) throw Error('Please log in to continue.');
        const next = change(previous, actor);
        if (next === previous) return;
        try {
          await AsyncStorage.setItem('cleantrack-v1', JSON.stringify(next));
        } catch {
          throw Error('Changes could not be saved. Free some device storage and try again.');
        }
        savedData.current = next;
        setData(next);
      });
    queue.current = operation;
    return operation;
  }
  const user = data.users.find((p) => p.id === userId);
  return (
    <Context.Provider
      value={{
        ...data,
        ready,
        error,
        user,
        readRevisions: userId ? (data.readsByUser?.[userId] ?? {}) : {},
        markRead: (items) =>
          mutate((d, actor) => ({
            ...d,
            readsByUser: {
              ...d.readsByUser,
              [actor.id]: {
                ...d.readsByUser?.[actor.id],
                ...Object.fromEntries(
                  visibleReports(d.reports, actor)
                    .filter((r) => items.some((item) => item.id === r.id))
                    .map((r) => {
                      const seen = items.find((item) => item.id === r.id)!;
                      return [
                        r.id,
                        Math.max(
                          d.readsByUser?.[actor.id]?.[r.id] ?? 0,
                          Math.min(
                            r.revision ?? r.history.length,
                            seen.revision ?? seen.history.length,
                          ),
                        ),
                      ];
                    }),
                ),
              },
            },
          })),
        login: (id) => {
          if (!savedData.current.users.some((person) => person.id === id))
            throw Error('This demo account is no longer available.');
          currentUserId.current = id;
          setUserId(id);
        },
        logout: () => {
          currentUserId.current = undefined;
          setUserId(undefined);
        },
        saveUser: (p) =>
          mutate((d, actor) => {
            const existing = d.users.find((person) => person.id === p.id);
            if (actor.id !== p.id && actor.role !== 'Admin')
              throw Error('Only admins can create or edit another demo profile.');
            if (actor.role !== 'Admin' && p.role !== actor.role)
              throw Error('Your account role cannot be changed here.');
            if (
              !p.name.trim() ||
              p.name.trim().length > 100 ||
              p.phone.trim().length > 30 ||
              !/^\S+@\S+\.\S+$/.test(p.email.trim()) ||
              !['Resident', 'Collector', 'Admin'].includes(p.role)
            )
              throw Error(
                'Enter a name of up to 100 characters, a valid email and a phone number of up to 30 characters.',
              );
            if (
              d.users.some(
                (person) =>
                  person.id !== p.id && person.email.toLowerCase() === p.email.trim().toLowerCase(),
              )
            )
              throw Error('That email is already in use.');
            const person = {
              ...p,
              name: p.name.trim(),
              email: p.email.trim(),
              phone: p.phone.trim(),
            };
            return {
              ...d,
              users: existing
                ? d.users.map((u) => (u.id === p.id ? person : u))
                : [...d.users, person],
            };
          }),
        addReport: (r) =>
          mutate((d, actor) => {
            if (actor.role !== 'Resident' || r.resident !== actor.id)
              throw Error('Only residents can submit their own reports.');
            const existing = d.reports.find((report) => report.id === r.id);
            if (existing) {
              if (existing.resident !== actor.id)
                throw Error('This report reference is already in use.');
              return d;
            }
            if (!r.photo || !r.title.trim() || !r.description.trim() || !r.address.trim())
              throw Error('Add a photo, title, description and address before submitting.');
            return {
              ...d,
              reports: [{ ...r, residentName: actor.name, revision: 1 }, ...d.reports],
            };
          }),
        updateReport: (id, status, note, collector, completionPhoto) =>
          mutate((d, actor) => {
            const current = d.reports.find((r) => r.id === id);
            if (!current) throw Error('This report is no longer available.');
            if (!note.trim() || note.trim().length > (status === 'Resolved' ? 500 : 1000))
              throw Error('Add a note within the allowed length before saving.');
            const allowed =
              actor.role === 'Admin'
                ? (status === 'Under Review' && current.status === 'Submitted') ||
                  (status === 'Assigned' &&
                    ['Submitted', 'Under Review', 'Assigned'].includes(current.status) &&
                    d.users.some((p) => p.id === collector && p.role === 'Collector')) ||
                  (status === 'Rejected' && ['Submitted', 'Under Review'].includes(current.status))
                : actor.role === 'Collector' &&
                  current.collector === actor.id &&
                  ((current.status === 'Assigned' && status === 'In Progress') ||
                    (current.status === 'In Progress' &&
                      status === 'Resolved' &&
                      !!completionPhoto));
            if (!allowed) throw Error('This status change is not allowed for your account.');
            return {
              ...d,
              reports: d.reports.map((r) => {
                if (r.id !== id) return r;
                return {
                  ...r,
                  status,
                  revision: (r.revision ?? r.history.length) + 1,
                  collector: collector ?? r.collector,
                  collectorName: collector
                    ? d.users.find((p) => p.id === collector)?.name
                    : r.collectorName,
                  ...(status === 'Resolved' ? { completionPhoto } : {}),
                  history: [
                    ...r.history,
                    { status, date: new Date().toISOString(), note: note.trim(), actor: actor.id },
                  ],
                };
              }),
            };
          }),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useStore() {
  const value = useContext(Context);
  if (!value) throw Error('Store missing');
  return value;
}
export function visibleReports(reports: Report[], user: Person) {
  return reports.filter(
    (r) =>
      user.role === 'Admin' ||
      (user.role === 'Resident' ? r.resident === user.id : r.collector === user.id),
  );
}
