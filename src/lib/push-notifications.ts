import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirebaseServices } from './firebase';

const deviceKey = 'cleantrack:push-device';
export async function pushDeviceEnabled(uid: string) {
  return (await AsyncStorage.getItem(`cleantrack:push-enabled:${uid}`)) === 'true';
}
export async function registerPushDevice(uid: string) {
  if (!Device.isDevice || Constants.executionEnvironment === 'storeClient')
    throw Error(
      'Push notifications need an installed CleanTrack development or production build on a physical phone.',
    );
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId)
    throw Error(
      'Push setup is pending. The project owner must configure the app build before enabling phone notifications.',
    );
  const Notifications = await import('expo-notifications');
  if (Platform.OS === 'android')
    await Notifications.setNotificationChannelAsync('report-updates', {
      name: 'Report updates',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
  if (
    !permission.granted &&
    permission.ios?.status !== Notifications.IosAuthorizationStatus.PROVISIONAL
  )
    throw Error(
      'Notifications are not allowed. Enable them in phone Settings, then try again. In-app updates remain available.',
    );
  let token: string;
  try {
    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    throw Error(
      'Phone push could not connect. Check your internet and the app push configuration. Android push requires Google services; use the in-app inbox on unsupported Huawei devices.',
    );
  }
  let deviceId = await AsyncStorage.getItem(deviceKey);
  if (!deviceId) {
    deviceId = `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    await AsyncStorage.setItem(deviceKey, deviceId);
  }
  await setDoc(doc(getFirebaseServices().db, 'users', uid, 'devices', deviceId), {
    token,
    platform: Platform.OS,
    updatedAt: serverTimestamp(),
  });
  await AsyncStorage.setItem(`cleantrack:push-enabled:${uid}`, 'true');
}
export async function disablePushDevice(uid: string) {
  if (!(await pushDeviceEnabled(uid))) return;
  const deviceId = await AsyncStorage.getItem(deviceKey);
  if (deviceId) await deleteDoc(doc(getFirebaseServices().db, 'users', uid, 'devices', deviceId));
  await AsyncStorage.removeItem(`cleantrack:push-enabled:${uid}`);
}
