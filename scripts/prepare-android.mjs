import fs from 'node:fs/promises';
import path from 'node:path';
import { build as esbuild } from 'esbuild';

const projectRoot = process.cwd();
const webDir = path.join(projectRoot, 'www');
const mobileConfigPath = path.join(projectRoot, 'mobile.config.json');

const mobileConfig = JSON.parse(await fs.readFile(mobileConfigPath, 'utf8'));
const apiBaseUrl = String(mobileConfig.apiBaseUrl || '').trim().replace(/\/+$/, '');

if (apiBaseUrl && !/^https:\/\//i.test(apiBaseUrl) && !/^http:\/\/localhost(?::\d+)?$/i.test(apiBaseUrl)) {
  throw new Error('mobile.config.json: apiBaseUrl must use HTTPS (HTTP is allowed only for localhost development).');
}

await fs.rm(webDir, { recursive: true, force: true });
await fs.mkdir(webDir, { recursive: true });

const files = ['index.html', 'app.js', 'app-config.js', 'styles.css', 'leaflet.js', 'leaflet.css'];
for (const file of files) {
  await fs.copyFile(path.join(projectRoot, file), path.join(webDir, file));
}
await fs.cp(path.join(projectRoot, 'images'), path.join(webDir, 'images'), { recursive: true });

// Bundle mobile-push.js into the final Capacitor webDir (and root for web compatibility).
const pushEntryPath = path.join(projectRoot, 'mobile-push.js');
const webPushBundlePath = path.join(webDir, 'mobile-push.bundle.js');
const rootPushBundlePath = path.join(projectRoot, 'mobile-push.bundle.js');

await esbuild({
  entryPoints: [pushEntryPath],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  outfile: webPushBundlePath,
});
await fs.copyFile(webPushBundlePath, rootPushBundlePath);

const generatedConfig = `// Generated from mobile.config.json by scripts/prepare-android.mjs.\nwindow.CHARGEEASE_CONFIG = Object.freeze({ apiBaseUrl: ${JSON.stringify(apiBaseUrl)} });\n`;
await fs.writeFile(path.join(webDir, 'app-config.js'), generatedConfig, 'utf8');

// Ensure Android runtime permissions and default FCM channel metadata exist without duplicating entries.
const manifestPath = path.join(projectRoot, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
try {
  let manifest = await fs.readFile(manifestPath, 'utf8');
  let manifestChanged = false;

  const permissions = [
    '<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
    '<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
    '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
  ];
  const missingPermissions = permissions.filter((line) => !manifest.includes(line));
  if (missingPermissions.length) {
    manifest = manifest.replace(/<manifest\b[^>]*>/, (tag) => `${tag}\n    ${missingPermissions.join('\n    ')}`);
    manifestChanged = true;
  }

  const defaultChannelMetaName = 'com.google.firebase.messaging.default_notification_channel_id';
  if (!manifest.includes(defaultChannelMetaName)) {
    const channelMeta = [
      '        <meta-data',
      '            android:name="com.google.firebase.messaging.default_notification_channel_id"',
      '            android:value="default" />',
    ].join('\n');
    manifest = manifest.replace(/<\/application>/, `${channelMeta}\n    </application>`);
    manifestChanged = true;
  }

  if (manifestChanged) {
    await fs.writeFile(manifestPath, manifest, 'utf8');
    console.log('Updated AndroidManifest.xml with required permissions and default FCM channel metadata.');
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  console.log('Android platform not generated yet; run "npx cap add android" once, then run this script again.');
}

console.log(`Prepared ${webDir}`);
console.log(`Bundled ${path.relative(projectRoot, webPushBundlePath)}`);
console.log(apiBaseUrl
  ? `Android API endpoint: ${apiBaseUrl}${apiBaseUrl.endsWith('/api') ? '' : '/api'}`
  : 'WARNING: apiBaseUrl is empty. Browser mode still uses /api, but the native Android app will show a setup message until you configure the HTTPS backend URL.');
