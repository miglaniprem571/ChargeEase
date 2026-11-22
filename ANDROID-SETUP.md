# ChargeEase EV — Android app setup

This project uses **Capacitor 8** to package the existing HTML/CSS/JavaScript frontend as an Android application. The Node.js API and SQLite database remain on a server; they are not embedded in the Android APK.

## Requirements

- Node.js 22 or newer (the backend uses Node 22 built-in `node:sqlite`).
- Android Studio and an Android SDK. Capacitor 8's documented Android minimum is API 24.
- A deployed HTTPS URL for the ChargeEase backend before testing the mobile app end-to-end.

## 1. Install dependencies

From the project folder:

```bash
npm install
```

## 2. Generate the Android project (first time only)

```bash
npx cap add android
```

This creates the native `android/` project.

## 3. Deploy the backend

Run the Node API on a persistent Node.js host. It needs Node.js 22+, HTTPS, and persistent storage for the SQLite database. Configure environment variables on the host:

- `JWT_SECRET`: a long, random secret unique to production.
- `DATABASE_FILE`: an absolute path on a persistent disk, e.g. `/var/data/chargeease.db`.
- `PORT`: supplied by many hosting platforms automatically.

The code supports `DATABASE_FILE` so the SQLite database can live on a persistent mounted disk. Do not use an ephemeral filesystem for production data. The demo credentials in README are for the seeded non-production dataset only; change/remove them before public launch.

## 4. Point the Android app to the backend

Edit `mobile.config.json` and set `apiBaseUrl` to the HTTPS origin of your backend, **without** `/api`. Example:

```json
{
  "apiBaseUrl": "https://your-chargeease-api.example.com"
}
```

The mobile frontend automatically calls `https://your-chargeease-api.example.com/api/...`. The URL is configuration, not a secret. Never put `JWT_SECRET`, database credentials, or payment secrets in this file or in the APK.

## 5. Copy the web assets and sync Android

```bash
npm run android:sync
```

This copies the existing web app into `www/`, generates the mobile runtime configuration, adds Android location permissions to the manifest, and syncs the Capacitor project. Re-run it after frontend or configuration changes.

## 6. Open and run in Android Studio

```bash
npx cap open android
```

Select an emulator or a physical Android phone, then press **Run**. To create a test APK in Android Studio, use **Build → Build Bundle(s) / APK(s) → Build APK(s)**. For Play Store distribution, use **Build → Generate Signed Bundle / APK** and keep the signing key private.

## Important integration notes

- The web UI and its CSS/JavaScript/Leaflet assets are packaged locally in the app. The Node backend remains hosted remotely.
- The app uses the device's browser Geolocation API; the Android preparation script adds coarse and fine location permissions. The user must grant location access at runtime.
- API calls require HTTPS in the Android app. `mobile.config.json` rejects non-HTTPS URLs except localhost development.
- Map tiles and road routing still use OpenStreetMap and the public OSRM routing service as in the web version; those services require internet access.
- The README's wallet, payment, and telemetry features are demo/simulated, not live financial settlement or certified charger control.
- Capacitor wraps the existing responsive web interface. It does not automatically turn every screen into a fully native Android UI.

## Existing web app remains available

The existing web app can still be run with:

```bash
node server.js
```

The browser version continues to use the same-origin `/api` path.
