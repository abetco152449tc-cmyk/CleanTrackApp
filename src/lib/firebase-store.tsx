import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore';
import { getFirebaseAuth } from './firebase-auth';
import { getFirebaseServices } from './firebase';
import { StoreContext, type Person, type Store } from './store-context';
import { cloudErrorMessage } from './cloud-errors';
import { markCloudReportsRead, submitCloudReport, transitionCloudReport } from './cloud-reports';
import { useReportPages } from './report-pages';
import { disablePushDevice } from './push-notifications';

const noAccess = () => {
  throw Error('Please log in to continue.');
};
const signedOut: Store = {
  ready: true,
  error: '',
  users: [],
  reports: [],
  login: noAccess,
  logout: async () => {
    await signOut(getFirebaseAuth());
  },
  saveUser: noAccess,
  addReport: noAccess,
  updateReport: noAccess,
};

function Loading() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 }}>
      <ActivityIndicator accessibilityLabel="Loading your account" />
      <Text>Loading your account…</Text>
    </View>
  );
}
function SetupError({ message, retry }: { message: string; retry: () => void }) {
  const [failure, setFailure] = useState('');
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 30, gap: 20 }}>
      <Text style={{ fontSize: 24, fontWeight: '700' }}>Account connection needs attention</Text>
      <Text accessibilityRole="alert">{failure || message}</Text>
      <Text>
        CleanTrack could not open your dashboard. Retry the connection. If this continues, contact
        the project owner with your account email and the message above.
      </Text>
      <Text>
        New profiles start as Residents. Collector access needs Admin approval; Admin access must be
        granted by the project owner. Resetting your password does not change your role.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={retry}
        style={{ padding: 18, backgroundColor: '#e8f5ee' }}
      >
        <Text>Retry connection</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          void signOut(getFirebaseAuth()).catch((e) => setFailure(cloudErrorMessage(e)));
        }}
        style={{ padding: 18 }}
      >
        <Text>Log out</Text>
      </Pressable>
    </View>
  );
}

export function FirebaseStoreProvider({ children }: { children: ReactNode }) {
  const [auth] = useState(() => getFirebaseAuth());
  const [account, setAccount] = useState<User | null | undefined>(undefined);
  const [error, setError] = useState('');
  useEffect(
    () =>
      onAuthStateChanged(
        auth,
        (value) => {
          setAccount(value);
          setError('');
        },
        (e) => setError(cloudErrorMessage(e)),
      ),
    [auth],
  );
  if (error)
    return (
      <SetupError
        message={error}
        retry={() => {
          void auth.authStateReady().then(() => {
            setAccount(auth.currentUser);
            setError('');
          });
        }}
      />
    );
  if (account === undefined) return <Loading />;
  if (!account) return <StoreContext.Provider value={signedOut}>{children}</StoreContext.Provider>;
  return (
    <AccountData key={account.uid} account={account}>
      {children}
    </AccountData>
  );
}

function AccountData({ account, children }: { account: User; children: ReactNode }) {
  const [{ db }] = useState(getFirebaseServices);
  const [user, setUser] = useState<Person>();
  const [users, setUsers] = useState<Person[]>([]);

  const [readRevisions, setReadRevisions] = useState<Record<string, number>>({});
  const [profileError, setProfileError] = useState('');

  const [peopleError, setPeopleError] = useState('');
  const [readError, setReadError] = useState('');
  const [retry, setRetry] = useState(0);
  const role = user?.role;
  const reportPages = useReportPages(db, account.uid, role, retry);
  const { reports } = reportPages;
  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    const timeout = setTimeout(() => {
      if (active)
        setProfileError(
          'Firestore is taking too long to respond. Check your connection and confirm that the project database and rules are set up, then retry.',
        );
    }, 30000);
    const ref = doc(db, 'users', account.uid);
    const acceptProfile = (data: DocumentData | undefined) => {
      if (!active) return;
      clearTimeout(timeout);
      if (!data || !['Resident', 'Collector', 'Admin'].includes(data.role)) {
        setProfileError(
          !data
            ? 'Your login succeeded, but your CleanTrack profile is missing. Retry to finish creating a Resident profile. If you need staff access, ask the project owner to restore your approved role.'
            : 'Your login succeeded, but your profile has an unrecognized account role. Ask the project owner to correct the profile for your account. Use Retry connection after it is fixed.',
        );
        return;
      }
      setUser({
        id: account.uid,
        name: data.name,
        email: data.email,
        phone: data.phone,
        role: data.role,
      });
      setProfileError('');
    };
    void runTransaction(db, async (tx) => {
      const existing = await tx.get(ref);
      if (existing.exists()) return existing.data();
      const profile = {
        id: account.uid,
        name: account.displayName || account.email?.split('@')[0] || 'Resident',
        email: account.email ?? '',
        phone: '',
        role: 'Resident',
        joinedAt: serverTimestamp(),
      };
      tx.set(ref, profile);
      return profile;
    })
      .then((profile) => {
        if (!active) return;
        // Transactions read the server. Start with its acknowledged role instead of
        // letting an older cached Resident profile choose an approved staff dashboard.
        acceptProfile(profile);
        unsubscribe = onSnapshot(
          ref,
          { includeMetadataChanges: true },
          (snapshot) => {
            if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
            acceptProfile(snapshot.data());
          },
          (e) => {
            clearTimeout(timeout);
            if (active)
              setProfileError(
                `Your login succeeded, but your account profile could not be loaded. ${cloudErrorMessage(e)}`,
              );
          },
        );
      })
      .catch((e) => {
        clearTimeout(timeout);
        if (active)
          setProfileError(
            `Your login succeeded, but your account profile could not be prepared. ${cloudErrorMessage(e)} If this continues, ask the project owner to check your profile and database setup.`,
          );
      });
    return () => {
      active = false;
      clearTimeout(timeout);
      unsubscribe();
    };
  }, [db, account, retry]);

  useEffect(() => {
    if (!role) return;
    let active = true;
    const stopPeople =
      role === 'Admin'
        ? onSnapshot(
            query(collection(db, 'users'), orderBy('name'), limit(500)),
            (snapshot) => {
              if (active) {
                setUsers(snapshot.docs.map((s) => ({ ...s.data(), id: s.id }) as Person));
                setPeopleError('');
              }
            },
            (e) => {
              if (active) {
                setUsers([]);
                setPeopleError(cloudErrorMessage(e));
              }
            },
          )
        : () => {};
    const stopReads = onSnapshot(
      collection(db, 'users', account.uid, 'reads'),
      (snapshot) => {
        if (active) {
          setReadRevisions(Object.fromEntries(snapshot.docs.map((s) => [s.id, s.data().revision])));
          setReadError('');
        }
      },
      (e) => {
        if (active) setReadError(cloudErrorMessage(e));
      },
    );
    return () => {
      active = false;
      stopPeople();
      stopReads();
    };
  }, [db, account.uid, role, retry]);

  if (profileError)
    return (
      <SetupError
        message={profileError}
        retry={() => {
          setProfileError('');
          setRetry((value) => value + 1);
        }}
      />
    );
  if (!user) return <Loading />;
  const logout = async () => {
    await disablePushDevice(account.uid);
    await signOut(getFirebaseAuth());
  };
  return (
    <StoreContext.Provider
      value={{
        user,
        users: user.role === 'Admin' ? users : [user],
        ready: true,
        ...reportPages,
        error: (user.role === 'Admin' ? peopleError : '') || readError,
        readRevisions,
        login: () => {
          throw Error('Sign in with the account email and password.');
        },
        logout,
        saveUser: async (person) => {
          if (
            person.id !== account.uid ||
            !person.name.trim() ||
            person.name.trim().length > 100 ||
            person.phone.trim().length > 30
          )
            throw Error(
              'Enter a name of up to 100 characters and phone number of up to 30 characters.',
            );
          await updateDoc(doc(db, 'users', account.uid), {
            name: person.name.trim(),
            phone: person.phone.trim(),
          });
        },
        promoteCollector: async (id) => {
          if (user.role !== 'Admin') throw Error('Administrator access required.');
          await updateDoc(doc(db, 'users', id), { role: 'Collector' });
        },
        markRead: async (items) => {
          await markCloudReportsRead(db, account.uid, items);
        },
        addReport: async (report) => {
          await submitCloudReport(db, user, report);
        },
        updateReport: async (id, status, note, collector, completionPhoto) => {
          const report = reports.find((r) => r.id === id);
          if (!report) throw Error('This report is no longer available.');
          await transitionCloudReport(db, user, report, status, note, collector, completionPhoto);
        },
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}
