// ChargeEase runtime configuration.
// Web deployment uses the same-origin /api route by default.
// The Android preparation script writes the configured HTTPS API URL into www/app-config.js.
window.CHARGEEASE_CONFIG = window.CHARGEEASE_CONFIG || Object.freeze({ apiBaseUrl: '' });
