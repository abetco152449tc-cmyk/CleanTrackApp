import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { getAndroidLocation, hasAndroidLocationProvider } from './android-location';

export class ReportLocationError extends Error {
  constructor(
    message: string,
    public settings: 'permission' | 'location' | null = null,
  ) {
    super(message);
  }
}

async function withTimeout<T>(request: Promise<T>, duration: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new ReportLocationError(
                'Finding your location took too long. Try again outdoors, or enter the address manually.',
              ),
            ),
          duration,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function browserLocation(): Promise<Location.LocationObject> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new ReportLocationError(
      'This browser cannot provide location. Use the installed app or a browser with location support.',
    );
  }
  if (globalThis.isSecureContext === false) {
    throw new ReportLocationError(
      'Browser location requires HTTPS. Open CleanTrack through a secure HTTPS address or use the installed app.',
    );
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          timestamp: position.timestamp,
          coords: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude,
            altitudeAccuracy: position.coords.altitudeAccuracy,
            heading: position.coords.heading,
            speed: position.coords.speed,
          },
        }),
      reject,
      { enableHighAccuracy: true, timeout: 25000, maximumAge: 0 },
    );
  });
}

export async function getReportLocation(): Promise<Location.LocationObject> {
  try {
    if (Platform.OS === 'web') return await withTimeout(browserLocation(), 27000);
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      throw new ReportLocationError(
        'Location permission is off. Allow location access while using CleanTrack (or Expo Go), then try again. You can also enter the address manually.',
        'permission',
      );
    }
    if (!(await Location.hasServicesEnabledAsync())) {
      throw new ReportLocationError(
        'Turn on Location Services in your phone settings, then return and try again. You can also enter the address manually.',
        'location',
      );
    }
    if (Platform.OS === 'android' && hasAndroidLocationProvider()) {
      // Native Android LocationManager works without Google Play services, including Huawei.
      return await withTimeout(
        getAndroidLocation(permission.android?.accuracy !== 'coarse'),
        40000,
      );
    }
    // Core Location on iOS; Expo Go's existing provider on Android. A custom build
    // is required to include the direct Android provider above.
    return await withTimeout(
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        mayShowUserSettingsDialog: true,
      }),
      30000,
    );
  } catch (error) {
    if (error instanceof ReportLocationError) throw error;
    const detail = error as { code?: string | number; message?: string };
    const text = `${detail?.code} ${detail?.message}`;
    if (detail?.code === 1 || /permission|unauthorized/i.test(text)) {
      throw new ReportLocationError(
        'Location access was denied. Allow location permission for this app or browser and try again, or enter the address manually.',
        'permission',
      );
    }
    if (
      Platform.OS === 'android' &&
      /SERVICE_INVALID|SERVICE_MISSING|SERVICE_VERSION_UPDATE_REQUIRED|SERVICE_DISABLED|LocationServices\.API.*not available/i.test(
        text,
      )
    ) {
      throw new ReportLocationError(
        'This Expo Go or older app build cannot use location on this phone. Install the newly built CleanTrack APK to enable direct GPS without Google Play services. You can enter the address manually meanwhile.',
      );
    }
    if (/settings|unsatisfied|location.*disabled|no location provider/i.test(text)) {
      throw new ReportLocationError(
        'Turn on Location Services and allow location access for CleanTrack, then try again. You can also enter the address manually.',
        'location',
      );
    }
    if (detail?.code === 3 || /timeout|timed out/i.test(text)) {
      throw new ReportLocationError(
        'Finding your location took too long. Try again outdoors, or enter the address manually.',
      );
    }
    throw new ReportLocationError(
      'Could not find your current location. Check location permissions and try again outdoors, or enter the address manually.',
    );
  }
}

export async function getReportAddress(coords: {
  latitude: number;
  longitude: number;
}): Promise<string> {
  const coordinates = `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`;
  if (Platform.OS === 'web') return coordinates;
  try {
    const [place] = await withTimeout(Location.reverseGeocodeAsync(coords), 4000);
    return place
      ? [place.street, place.district, place.city, place.region].filter(Boolean).join(', ') ||
          coordinates
      : coordinates;
  } catch {
    // Address services vary by device; a valid GPS fix must remain usable offline.
    return coordinates;
  }
}
