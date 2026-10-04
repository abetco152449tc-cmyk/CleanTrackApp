# CleanTrack

An Expo / React Native app for Android and iPhone, based on the supplied CleanTrack proposal and role-flow designs.

## Firebase accounts

When configured with `.env.local`, the app uses Firebase email/password accounts and shared Firestore reports, private compressed photos, protected staff roles, realtime timelines, and read receipts. See [Firebase setup and limits](FIREBASE_SETUP.md) to deploy the rules and grant the first Admin account. Restart Expo to load configuration. The implementation supports the Spark plan without Cloud Storage or paid functions.

The local-demo workflow below remains available without Firebase settings, or by setting `EXPO_PUBLIC_CLEANTRACK_DEMO=true` and restarting Expo. It uses separate sample data and does not authenticate Firebase users.

## Run

```powershell
cd C:\Users\algen\Documents\CCE_106_Project\CleanTrackApp
npm install
npm start
```

Open the QR code in a CleanTrack development build. The computer and phone must be on the same network. For Expo Go previews on supported devices, run `npm run start:go`; Expo Go cannot include the direct Android GPS provider needed on Huawei phones without Google Play services. `npm run web` opens the browser preview; report maps and the location picker use OpenStreetMap on web and native.

To open the Firebase-connected browser app on a dedicated port:

```powershell
npm run web -- --port 8093 --clear
```

Open `http://localhost:8093`. The registered **admin1@gmail.com** account already has Admin access; sign in with the password you chose. Refresh or sign out and back in if an existing session still shows the Resident dashboard. New users choose **Create an account** and register with their own email and password. Residents and approved staff use the same login. Admin can approve registered collectors from **Users**.

## Choose a report location

Residents can save one unfinished report per account on the current device using **Save draft** at any step. Reopen Report to restore the photo, details and selected location. Drafts are local to the device, separate from submitted reports, and are not shared with staff. Native photo files are copied out of temporary picker storage. The fourth step previews the photo, details, address and coordinates before submission, with buttons to edit each section. Submission saves the current draft first; failures preserve the form and offer **Retry submission** with the same report reference to prevent duplicate cloud reports. Successful submission clears the draft.

When reporting waste, step 3 includes **Choose on map**. Drag or tap the OpenStreetMap map, confirm the pin, and add an address or landmark. This picker works in Expo Go without Google Play services or GPS permission; it requires internet access for map tiles. It initially shows Tagum City, not the device's current location. **Use current location** remains optional. Editing the landmark preserves the pin; **Remove pin** switches back to an address-only report.

## Local demo login preview

The welcome screen has Resident, Collector, and Admin tabs, password visibility, input validation, and keyboard navigation. Choose a role and open **Just looking around?** to fill demo credentials or enter directly.

| Role | Demo email |
| --- | --- |
| Resident | maria@cleantrack.demo |
| Collector | ramon@cleantrack.demo |
| Admin | admin@cleantrack.demo |

All demo accounts use the public password `CleanTrackDemo!`. This separate UI demonstration uses local sample data. Real Firebase accounts use their own passwords and protected roles; demo credentials cannot authenticate them.

## Automatic location, including Huawei

Choosing **Use current location** in the report's location step requests permission and captures the current location. Android builds use `@react-native-community/geolocation` with `locationProvider: 'android'`, so location uses Android's device GPS/network providers without requiring Google Play services. Precise permission requests GPS first, then tries network location if GPS is unavailable; approximate permission uses network location. iOS continues to use Core Location through Expo. Browsers use their geolocation API and require HTTPS (localhost is allowed).

Requests are bounded, do not accept old cached fixes, and display estimated accuracy. Permission denial and disabled services remain recoverable. Reverse geocoding is optional and has a short timeout; a valid GPS coordinate can always be used even if the device has no street-address service. This does not guarantee a fix on hardware without a usable provider or signal.

**Huawei requires a newly built APK.** Reloading Expo Go or installing a JavaScript update cannot add the native GPS module. Build with `npm run build:android`, install the generated APK, and enable Location permission. Test outdoors for the first GPS fix. Report maps and the location picker now use Leaflet/OpenStreetMap in a WebView, without Google Play services or a Google Maps key. Internet and a working Android System WebView are required; test map rendering and GPS on the actual Huawei device.

## Try the local demo workflow

1. Choose Resident, open the demo panel, and continue as Resident. Create a report with a camera/gallery photo, details, and GPS location (or a manually entered address).
2. In Profile, choose Switch demo account. Continue as Admin.
3. Open the report, mark it Under Review, and assign it to Ramon Flores.
4. Switch to Collector. Open the task, Start collection, attach an after-cleanup photo and completion note, then Mark as collected.
5. Switch back to Resident and inspect the report timeline and Updates.

Admin can create local demo profiles and preview them from Users. Search, filters, profile edits, analytics, and role-scoped report lists use the saved data.

## Scope

In Firebase mode, each account sees the dashboard for its protected role. Residents submit reports; Admin reviews and assigns them; the assigned Collector starts and completes collection. New registrations always become Residents. The project owner provisions the first Admin, who can then approve collectors. Data and private evidence are shared through Firestore once the rules and indexes are deployed.

In local demo mode, data is stored in AsyncStorage on a single device; native report photos are copied to app document storage. Four clearly identified sample reports are included, without fabricated photo evidence or GPS coordinates.

Implemented: role dashboards, photo capture/gallery, GPS and reverse geocoding, manual-address fallback, submission, review/rejection, collector assignment, collection progress, timelines, in-app updates, native map markers, external Maps links, demo user management, profile editing, and live summary analytics.

Cloud report history loads in cursor pages of 50; Load older reports continues beyond 200. The newest page and each open report update live, including older reports. Closing report details releases its listener; account and role changes remove unauthorized reports. Search, maps, inbox counts, profile totals and analytics cover loaded reports, not the entire database. The Admin directory shows up to 500 users. Native push support and an owner-run notification/retention worker are included; delivery needs Expo credentials, an installed build, deployed rules/indexes and a running worker. Social login, offline submission queues and account-deletion UI are not implemented. See [Notifications and retention setup](NOTIFICATIONS_AND_RETENTION.md).

Dashboard status cards open matching report filters. Reports support search, newest/oldest sorting and clearing filters. Each role can open a map of its reports and filter active or completed work. Profile edits, report submissions, assignments and read receipts wait for device storage in demo mode; failed saves keep their forms available for retry. Original and cleanup photos are compressed to bounded JPEG data in both modes.

Run `npm run firebase:check` using the project owner's CLI login for a read-only readiness check. It checks email/password sign-in, database availability, deployed-rule matching, required indexes and whether an Admin profile exists. It prints no credentials or resident records. This project's rules/indexes deployment and first-Admin approval are complete; see [Firebase setup](FIREBASE_SETUP.md).

## Native builds

`eas.json` includes development, internal preview, and production profiles. Use your Expo account and signing credentials with `npx eas-cli@latest build --platform android --profile preview` or `--platform ios`. iOS distribution requires the appropriate Apple signing setup. These builds have not been submitted or published.

Report maps use OpenStreetMap on Android, iOS and web; no Google Maps API key is required. Change the sample package/bundle identifiers before releasing your own app.

## Validation

```powershell
npm run typecheck
npm run lint
npm run export:all
npm run test:e2e
npm run test:location
npm run test:rules
npm run test:auth
npm run test:maintenance
npm run test:unit
```

E2E tests use desktop Chrome at a mobile viewport and a local Expo web server. They do not substitute for physical-device camera, GPS, map, and native permission tests.

Verified on October 4, 2026: lint and TypeScript checks passed; 34 unit checks, 16 Firestore rules checks, 16 demo browser checks and 5 Firebase emulator browser workflows passed. The final Firebase-connected Android, iOS and web export succeeded with 14 routes. Live Firebase readiness also passed after granting **admin1@gmail.com** Admin access.

Expo Doctor passed 20 of 21 checks. Its remaining warning marks `@react-native-community/geolocation` as unmaintained. The app currently uses this dependency for Android GPS providers on phones without Google Play services; the warning is retained rather than hidden. Signed APK/IPA builds and physical-device camera/GPS/push behavior have not been verified. Native push still requires the Expo/EAS project and provider credentials in [Notifications and retention setup](NOTIFICATIONS_AND_RETENTION.md).

For production browser verification, use the static-export test host. It rebuilds each environment with a fresh bundler cache, serves only localhost, and keeps test bundles separate from the release export:

```powershell
$env:DEBUG = ''
$env:PLAYWRIGHT_STATIC_EXPORT = 'true'
npm run test:e2e
npm run test:auth
```

Sources: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), [Image picker](https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/), [Location](https://docs.expo.dev/versions/v57.0.0/sdk/location/), [Native maps](https://docs.expo.dev/versions/v57.0.0/sdk/map-view/), [Android device location provider](https://github.com/michalchudziak/react-native-geolocation), [Development builds](https://docs.expo.dev/develop/development-builds/introduction/).

## Cleanup evidence and location verification

Collectors must attach an after-cleanup photo and a note of up to 500 characters before resolving a report. Firebase saves the private photo and status transition atomically; only the assigned collector can create the cleanup evidence, and it cannot be replaced afterward. Residents, Admins and the assigned collector can view the before/after photos and the timeline note. Older resolved reports without cleanup photos are labeled explicitly. A failed completion keeps the chosen photo and note on the open screen for retry.

Report review and details show the saved address, coordinates and a map pin. GPS accuracy is saved and shown in meters with a shaded map circle; manually selected pins are labeled without claiming GPS accuracy. Older reports show when accuracy was not recorded. Map failures retain the address and coordinates and offer retry.

The updated Firestore rules and indexes are deployed to this project's live database. Use `npm run firebase:deploy` after any future rule/index changes. Physical Android/Huawei/iOS testing remains necessary.
