import type { LocationObject } from 'expo-location';
export function hasAndroidLocationProvider(): boolean {
  return false;
}
export async function getAndroidLocation(_precise: boolean): Promise<LocationObject> {
  throw new Error('Android location is only available in the native Android app.');
}
