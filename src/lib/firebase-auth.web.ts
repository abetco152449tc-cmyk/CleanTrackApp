import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { getFirebaseServices } from './firebase';

export function getFirebaseAuth() {
  const auth = getAuth(getFirebaseServices().app);
  const host = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST;
  if (host && !auth.emulatorConfig)
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  return auth;
}
