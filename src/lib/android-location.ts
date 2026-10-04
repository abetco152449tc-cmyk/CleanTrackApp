import { TurboModuleRegistry } from 'react-native';
import type { LocationObject } from 'expo-location';

export function hasAndroidLocationProvider(): boolean {
  return TurboModuleRegistry.get('RNCGeolocation') !== null;
}

export async function getAndroidLocation(precise: boolean): Promise<LocationObject> {
  // Load only after checking availability so Expo Go remains usable on supported devices.
  const { default: Geolocation } = await import('@react-native-community/geolocation');
  Geolocation.setRNConfiguration({
    locationProvider: 'android',
    skipPermissionRequests: true,
    enableBackgroundLocationUpdates: false,
  });
  const request = (highAccuracy: boolean, timeout: number) =>
    new Promise<LocationObject>((resolve, reject) => {
      void Promise.resolve(
        Geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: highAccuracy,
          timeout,
          maximumAge: 0,
        }),
      ).catch(reject);
    });

  try {
    return await request(precise, 25000);
  } catch (error) {
    const code = (error as { code?: number })?.code;
    // Try the device's network provider if GPS is unavailable indoors. Permission
    // denial must never trigger another location request.
    if (precise && (code === 2 || code === 3)) return request(false, 12000);
    throw error;
  }
}
