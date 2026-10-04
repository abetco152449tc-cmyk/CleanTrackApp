import AsyncStorage from '@react-native-async-storage/async-storage';
import { FirebaseError } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  initializeAuth,
  // @ts-expect-error Firebase's default web declarations omit this native export.
  getReactNativePersistence,
} from 'firebase/auth';
import { getFirebaseServices } from './firebase';

export function getFirebaseAuth() {
  const { app } = getFirebaseServices();
  const finish = (auth: ReturnType<typeof getAuth>) => {
    const host = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST;
    if (host && !auth.emulatorConfig)
      connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    return auth;
  };
  try {
    return finish(initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) }));
  } catch (error) {
    if (error instanceof FirebaseError && error.code === 'auth/already-initialized')
      return finish(getAuth(app));
    throw error;
  }
}
