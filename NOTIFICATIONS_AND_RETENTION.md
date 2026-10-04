# Notifications, history and photo retention

The app shows unread counts on the Updates tab and header bell, highlights unread inbox rows and supports Show unread only and Mark all as read. Read state is per account and persists across devices with Firebase (per account on this device in demo mode); read revisions cannot move backward. Opening an update navigates immediately while its read receipt saves independently. Older history loads in cursor pages of 50 with no 200-report cap. Search, analytics and unread totals cover loaded reports. Opening a report directly, including from a push, fetches it even when it is outside the newest page and keeps it live until report details close, under current permissions.

## Activate phone push

Push support is implemented but requires provider credentials and an installed native build. It is not activated by source changes alone.

1. Link this app to the intended Expo/EAS project. Put its public UUID in `EXPO_PUBLIC_EAS_PROJECT_ID` in `.env.local`, then restart Expo. Configure FCM v1 credentials for Android in that EAS project and APNs credentials for iOS. Follow [Expo push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/) and [Android FCM credentials](https://docs.expo.dev/push-notifications/fcm-credentials/). Do not put FCM service-account files, APNs keys, owner Google tokens or Expo access tokens in the app or source control.
2. Run `npm run firebase:deploy` as the project owner. This deploys private device-token rules and the notifications collection-group index. Wait for indexes to finish building.
3. Build and install the updated app with `npm run build:android` or your configured iOS EAS build. Use a physical device. Expo Go and the browser do not deliver this app's native pushes.
4. Sign in and choose Profile > **Enable phone notifications**. The app requests permission only when this button is pressed, registers a private device token, and removes this registration before Firebase logout. Android push uses FCM and requires Google services. Huawei devices without those services keep their in-app inbox; HMS delivery is not implemented.
5. In an owner-controlled terminal or host with Node and this project's dependencies, run `npm run firebase:login` with the project owner Google account. Preview due jobs with `npm run notifications:worker`. This sends nothing and prints counts only.
6. Start delivery with `npm run notifications:worker -- --watch`. Keep this process online. Alternatively, run `npm run notifications:worker -- --once` every minute using your host's scheduler. Each cycle processes up to 100 due jobs; subsequent cycles drain the rest.

An Assigned transition atomically queues alerts for the report's resident and assigned collector. A Resolved transition atomically queues an alert for the resident. App accounts cannot read, replace or forge these jobs, and cannot read another user's device token. Only the owner worker can send. Jobs survive worker restarts. The worker uses leases, exponential retry, and Expo tickets/receipts; invalid device tokens are removed only if the token still matches. Recipients and current collector access are checked again before sending. Push bodies are generic; tapping a notification fetches the report under the signed-in account's permissions. A removed task cannot be opened by a former collector.

If Expo's optional push access-token security is enabled, set `EXPO_ACCESS_TOKEN` only in the worker environment. Never use `EXPO_PUBLIC_EXPO_ACCESS_TOKEN`. Requests can occasionally be accepted before a network failure becomes visible, so a retry can produce a duplicate notification. Expo receipt success means acceptance by the platform push service, not proof that the user saw it. See [Expo delivery guidance](https://docs.expo.dev/push-notifications/sending-notifications/).

No paid Firebase Functions are deployed or billing plan changed. The owner worker uses the existing Google CLI login and Spark Firestore quotas. Its host must stay online and its owner credentials must remain valid. Native device acceptance testing is still required.

## 180-day photo policy

- Keep original and cleanup photos while a report is active.
- After **Resolved** or **Rejected**, retain photos for **180 days** from the server's last status-update timestamp.
- Delete only the private original and completion photo documents. Keep report identity, address, status, notes, actors and timeline.
- Add a `photosExpiredAt` marker so the app explains the removal rather than showing a broken image.

The cleanup scans every report page, skips active/expired/invalid-date records, and atomically writes the expiration marker and deletes both photos. A document update-time precondition prevents deletion if the report changed after it was inspected. Changed records are retried on a later run.

Preview the current project without deleting anything:

```powershell
npm run photos:cleanup
```

Apply the policy:

```powershell
npm run photos:cleanup -- --apply
```

To run push delivery and apply retention automatically once each day, start:

```powershell
npm run notifications:worker -- --watch --retention
```

This applies retention on startup and every 24 hours (or retries after an hour if a record changed). Alternatively, schedule `node scripts/cleanup-photos.mjs --apply` daily with this app directory as the working directory and the project owner's Firebase CLI login available to that host account. No live photos were deleted while implementing or testing this feature. Cleanup operates on Firebase photos; local demo/draft data is outside this cloud policy.

## Verification

```powershell
npm run typecheck
npm run lint
npm run test:e2e
npm run test:auth
npm run test:rules
npm run test:maintenance
npm run export:all
```

Worker unit tests use mock delivery and no real tokens. Firebase emulator tests verify token privacy, private transition jobs, monotonic read receipts, report history beyond 200, direct older-report access and atomic photo expiration. Real pushes require a configured build plus physical-device testing.
