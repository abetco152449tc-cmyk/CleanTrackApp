export async function pushDeviceEnabled(_uid: string) {
  return false;
}
export async function registerPushDevice(_uid: string) {
  throw Error('Phone push is available in the installed mobile app. Use the in-app inbox on web.');
}
export async function disablePushDevice(_uid: string) {}
