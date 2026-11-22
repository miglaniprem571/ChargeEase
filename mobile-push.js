import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

const FCM_TOKEN_STORAGE_KEY = 'ce_fcm_token';
const AUTH_TOKEN_STORAGE_KEY = 'ce_token';
const DEFAULT_CHANNEL_ID = 'default';

let listenersAttached = false;
let channelCreated = false;
let currentApiFetch = null;
let activeUserId = null;
let activeSessionCheck = null;
let currentToken = readStoredToken();
let lastRegisteredKey = null;
let inFlightPromise = null;
let inFlightUserId = null;
let sessionNonce = 0;

function readStoredToken() {
  try {
    const val = localStorage.getItem(FCM_TOKEN_STORAGE_KEY);
    return typeof val === 'string' && val.trim().length >= 20 ? val.trim() : null;
  } catch (_) {
    return null;
  }
}

function saveStoredToken(token) {
  try {
    if (token) {
      localStorage.setItem(FCM_TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(FCM_TOKEN_STORAGE_KEY);
    }
  } catch (_) {}
}

function hasValidAuthenticatedSession(sessionCheck) {
  if (typeof sessionCheck === 'function') {
    try {
      if (!sessionCheck()) return false;
    } catch (_) {
      return false;
    }
  }
  try {
    const authToken = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    return Boolean(authToken && authToken.trim().length > 0);
  } catch (_) {
    return false;
  }
}

async function ensureDefaultAndroidChannel() {
  if (channelCreated || Capacitor.getPlatform() !== 'android') return;
  try {
    await PushNotifications.createChannel({
      id: DEFAULT_CHANNEL_ID,
      name: 'ChargeEase Notifications',
      description: 'Booking confirmations, host alerts, and charging updates',
      importance: 4,
      visibility: 1,
      vibration: true
    });
    channelCreated = true;
  } catch (error) {
    console.warn('Could not create Android notification channel:', error?.message || error);
  }
}

async function syncTokenWithBackend(tokenValue, expectedNonce) {
  const cleanToken = typeof tokenValue === 'string' ? tokenValue.trim() : '';
  if (!cleanToken || cleanToken.length < 20) return false;

  if (expectedNonce !== sessionNonce) return false;
  if (typeof currentApiFetch !== 'function') return false;
  if (!hasValidAuthenticatedSession(activeSessionCheck)) return false;

  const registrationKey = `${activeUserId || 'authenticated'}:${cleanToken}`;
  if (lastRegisteredKey === registrationKey) {
    return true;
  }

  try {
    await currentApiFetch('/push/register', {
      method: 'POST',
      body: {
        token: cleanToken,
        platform: Capacitor.getPlatform() || 'android'
      }
    });

    if (expectedNonce === sessionNonce && hasValidAuthenticatedSession(activeSessionCheck)) {
      lastRegisteredKey = registrationKey;
      console.log('FCM token registered with ChargeEase');
      return true;
    }
    return false;
  } catch (error) {
    console.error('FCM token backend registration failed:', error?.message || error);
    return false;
  }
}

async function ensureListeners() {
  if (listenersAttached) return;

  const addedHandles = [];
  try {
    addedHandles.push(
      await PushNotifications.addListener('registration', async (token) => {
        const tokenValue = typeof token?.value === 'string' ? token.value.trim() : '';
        if (!tokenValue) return;

        currentToken = tokenValue;
        saveStoredToken(tokenValue);

        // Bind to the currently active authenticated session only.
        await syncTokenWithBackend(tokenValue, sessionNonce);
      })
    );

    addedHandles.push(
      await PushNotifications.addListener('registrationError', (error) => {
        console.error('FCM registration error:', error?.error || error?.message || error);
      })
    );

    addedHandles.push(
      await PushNotifications.addListener('pushNotificationReceived', () => {
        if (typeof window.loadNotifications === 'function') {
          try {
            window.loadNotifications();
          } catch (_) {}
        }
      })
    );

    addedHandles.push(
      await PushNotifications.addListener('pushNotificationActionPerformed', () => {
        if (typeof window.loadNotifications === 'function') {
          try {
            window.loadNotifications();
          } catch (_) {}
        }
      })
    );

    listenersAttached = true;
  } catch (error) {
    // Roll back partially attached handles to prevent duplicate listeners on retry.
    await Promise.allSettled(addedHandles.map((handle) => handle?.remove?.()));
    listenersAttached = false;
    throw error;
  }
}

window.ChargeEasePush = {
  async register(apiFetch, sessionContext = {}) {
    if (!Capacitor.isNativePlatform()) return;
    if (typeof apiFetch !== 'function') return;

    const sessionCheck = typeof sessionContext?.isAuthenticated === 'function'
      ? sessionContext.isAuthenticated
      : null;

    if (!hasValidAuthenticatedSession(sessionCheck)) {
      return;
    }

    const nextUserId = sessionContext?.userId ? String(sessionContext.userId) : null;
    const userChanged = Boolean(nextUserId && activeUserId && nextUserId !== activeUserId);

    if (userChanged) {
      sessionNonce += 1;
      lastRegisteredKey = null;
    }

    currentApiFetch = apiFetch;
    activeUserId = nextUserId || activeUserId;
    activeSessionCheck = sessionCheck;

    const myNonce = sessionNonce;

    // Avoid duplicate concurrent registration runs for the same user.
    if (inFlightPromise && inFlightUserId === activeUserId) {
      return inFlightPromise;
    }

    inFlightUserId = activeUserId;
    const run = (async () => {
      try {
        let permission = await PushNotifications.checkPermissions();

        if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') {
          permission = await PushNotifications.requestPermissions();
        }

        if (myNonce !== sessionNonce || !hasValidAuthenticatedSession(activeSessionCheck)) {
          return;
        }

        if (permission.receive !== 'granted') {
          console.log('Push notification permission not granted; will retry when enabled');
          return;
        }

        await ensureDefaultAndroidChannel();
        await ensureListeners();

        if (myNonce !== sessionNonce || !hasValidAuthenticatedSession(activeSessionCheck)) {
          return;
        }

        // If we already have the device token (e.g. after switching accounts), sync immediately.
        if (currentToken) {
          const registrationKey = `${activeUserId || 'authenticated'}:${currentToken}`;
          if (lastRegisteredKey === registrationKey) {
            return;
          }
          const synced = await syncTokenWithBackend(currentToken, myNonce);
          if (synced) {
            return;
          }
        }

        await PushNotifications.register();
      } catch (error) {
        console.error('Push setup failed:', error?.message || error);
      } finally {
        if (inFlightPromise === run) {
          inFlightPromise = null;
          inFlightUserId = null;
        }
      }
    })();

    inFlightPromise = run;
    return run;
  },

  unregister(apiFetch) {
    sessionNonce += 1;
    const tokenToUnregister = currentToken || readStoredToken();
    const fetchFn = typeof apiFetch === 'function' ? apiFetch : currentApiFetch;
    const canCallApi = Boolean(
      Capacitor.isNativePlatform() &&
      tokenToUnregister &&
      typeof fetchFn === 'function' &&
      hasValidAuthenticatedSession(null)
    );

    activeUserId = null;
    activeSessionCheck = null;
    lastRegisteredKey = null;
    inFlightPromise = null;
    inFlightUserId = null;
    saveStoredToken(null);

    if (!canCallApi) {
      return Promise.resolve();
    }

    // Start the request synchronously before caller clears state.authToken.
    try {
      return Promise.resolve(
        fetchFn('/push/unregister', {
          method: 'POST',
          body: { token: tokenToUnregister }
        })
      ).catch((error) => {
        console.warn('FCM token unregister skipped/failed:', error?.message || error);
      });
    } catch (error) {
      console.warn('FCM token unregister error:', error?.message || error);
      return Promise.resolve();
    }
  },

  clearSession() {
    sessionNonce += 1;
    activeUserId = null;
    activeSessionCheck = null;
    lastRegisteredKey = null;
    inFlightPromise = null;
    inFlightUserId = null;
  }
};
