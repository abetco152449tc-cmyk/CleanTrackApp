# CleanTrack Firebase setup

The app connects Firebase Authentication and Firestore for project **cleantrack-e62a9**. `.env.local` contains its public web-app configuration. On October 4, 2026, the owner approved deployment of the tested rules and indexes and granted the registered **admin1@gmail.com** account Admin access. A subsequent read-only check passed: email/password sign-in is enabled, the deployed rules match the local file, all three required indexes are **READY**, and an Admin profile exists. The existing database is in `nam5`. Sign in with the Admin account's own password to review reports and approve collectors. Native phone pushes still need the Expo/EAS project credentials described in [Notifications and retention](NOTIFICATIONS_AND_RETENTION.md). Run `npm run firebase:check` for current service readiness.

## Finish the cloud setup (Spark plan)

Run commands inside `CleanTrackApp`:

1. Run `npm run firebase:login` and sign in with the Google account that owns the project. Follow the CLI link. If it asks for an authorization code, enter it in your terminal, not in chat.
2. The existing project already has its **(default)** Firestore database. For a new project only, create the default database in **Standard edition**, production mode and choose its permanent location. Keep the **Spark** plan.
3. Run `npm run firebase:deploy` to publish the protected rules and query indexes. Wait for indexes to finish building in the console.
4. Restart Expo with `npm start`. Register the chosen Admin's email using a password that account owner chooses. All new app accounts start as Residents. This project's **admin1@gmail.com** Admin is already configured. The setup script defaults to that account; use `--email` to select another registered account.
5. Run `npm run firebase:admin -- --email chosen@example.com` to preview the matching account, then add `--apply` to grant Admin access. This owner-only script uses your Firebase CLI Google login. It updates only the selected existing account's role (or creates its missing profile), does not set a password, and cannot be called from the app.
6. Sign in as that Admin. Register each collector normally, then use Admin > Users > **Approve as collector**. Their dashboard changes automatically when their role updates.

The bootstrap script is fixed to this project and validates the selected registered email. If the account does not exist or is disabled, it stops. It previews by default and uses an update-time precondition when applying a role. Alternatively, the project owner can set `role` to `Admin` on the matching `users/{Authentication UID}` document in Firebase Console after registration. Never grant Admin based only on a client-side email check.

## How the dashboards work

Everyone uses the same email/password login. The protected `users/{uid}` document determines the dashboard; there is no role picker for real accounts.

Sign-in loads the server-confirmed profile before opening the dashboard. Older cached Resident profiles and pending local changes cannot override an approved staff role; subsequent confirmed profile updates still change the dashboard automatically. If Expo Go is running an older bundle, stop the current Expo terminal with **Ctrl+C**, run `npm run start:go -- --clear`, reopen the project from its QR code, and sign in with the exact approved collector email. In Admin > Users, approval requires both **Approve as collector** and **Confirm collector access**, followed by the saved-success message.

| Role | Access |
| --- | --- |
| Resident | Submit a photo and location report, view their own reports and status history, edit their name/phone. |
| Admin | Review community reports, reject or assign them, reassign open tasks, approve registered collectors, view summary analytics. |
| Collector | View only assigned reports, start collection, and mark collection resolved. |

The normal sequence is Submitted → Under Review → Assigned → In Progress → Resolved. Admin may also assign directly from Submitted or reject before assignment. Each change records a timeline event. Reassignment removes the previous collector's access. Transactions reject stale edits instead of overwriting newer changes.

Reports and roles update across signed-in devices. Updates are **in-app notifications**, with read receipts saved to Firestore. Native push registration, private transition jobs and an owner-run delivery worker are implemented. Delivery requires the setup in [Notifications and retention](NOTIFICATIONS_AND_RETENTION.md). Logout, persistent sessions, password reset, and profile edits use Firebase. Role changes and report access are enforced by Security Rules, independently of the screen shown.

## Photos without paid billing

Photos are resized and compressed to JPEG in the app, then saved as a private `reports/{id}/evidence/main` Firestore document alongside the report in one transaction. Cleanup photos use `reports/{id}/evidence/completion` and are saved atomically with the assigned collector's Resolved transition. Each cleanup needs a note of up to 500 characters; only authorized report viewers can read either photo. The data URL is limited to 240,000 characters (roughly 180 KB of image bytes). Evidence loads only when opening a report and follows the same role permissions. No Cloud Storage bucket is required.

This is intended for a small class project. Firestore's free quota includes 1 GiB stored data, 50,000 reads/day and 20,000 writes/day; photos consume storage and network allowance. Rule lookups and realtime listeners also use reads. Exceeding free quotas can stop operations; this setup does not upgrade billing. See [official Firestore quotas](https://firebase.google.com/docs/firestore/quotas).

Lists, maps, updates and analytics use currently loaded report pages (50 per page) with **Load older reports** beyond the former 200-report limit. The newest page is live; any open report also stays live, including older reports. Closing report details releases its listener. Search and unread counts are scoped to loaded history. Admin's user directory loads up to 500 profiles. Photos are retained while active and for 180 days after Resolved/Rejected; owner cleanup retains report text and timeline. The worker can apply this policy daily when started with `--watch --retention`. No offline submission queue or account-deletion UI is implemented. Report writes and background maintenance consume the project's free Firestore quota.

## Local verification

```powershell
npm run typecheck
npm run lint
npm run test:rules
npm run test:auth
npm run test:e2e
npm run test:location
npm run export:all
```

Rules tests use the Firestore Emulator and cover role escalation, private photos/reports, assignments, history tampering, invalid coordinates, stale edits, and read receipts. Auth browser tests use real local Auth and Firestore emulators for registration, reset requests, session restoration, staff approval, and the three-account report lifecycle. They do not create live accounts or send real email. Emulators need Java 21+ and ports 8080/9099; browser tests also use port 8092.

Test the deployed project on a physical phone before presenting it: registration/login, camera/gallery, GPS/manual address, private photo display, and a report completed using separate Admin/Collector accounts. Emulator tests do not establish that live rules are deployed or native permissions work on your phone.

The separate local demo is available with `EXPO_PUBLIC_CLEANTRACK_DEMO=true` and an Expo restart. It keeps sample data in AsyncStorage. Emulator configuration is restricted to `demo-` project IDs to prevent accidental use against the live project.

Never place Google passwords, authorization codes, or service-account keys in source control or the app. Public Firebase configuration identifies the project; deployed rules protect its data.
