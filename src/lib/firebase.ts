import { getApp, getApps, initializeApp } from 'firebase/app';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

// Expo replaces explicitly named EXPO_PUBLIC variables when bundling.
const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseConfigured =
  process.env.EXPO_PUBLIC_CLEANTRACK_DEMO !== 'true' &&
  Boolean(config.apiKey && config.projectId && config.appId);

let services: { app: ReturnType<typeof getApp>; db: ReturnType<typeof getFirestore> } | undefined;

export function getFirebaseServices() {
  if (services) return services;
  if (!firebaseConfigured) {
    throw new Error(
      'Firebase is not configured. Add the Firebase web app settings to .env.local and restart Expo.',
    );
  }
  const app = getApps().length ? getApp() : initializeApp(config);
  const db = getFirestore(app);
  const emulator = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST;
  if (emulator) {
    if (!app.options.projectId?.startsWith('demo-'))
      throw Error('Emulator mode requires a demo- project ID.');
    connectFirestoreEmulator(db, emulator, 8080);
  }
  services = { app, db };
  return services;
}
