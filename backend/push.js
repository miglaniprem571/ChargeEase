const { isFirebaseConfigured, getFirestore, getMessaging } = require('./firebase');

const INVALID_TOKEN_ERROR_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token'
]);

function stringifyDataPayload(data) {
  if (!data || typeof data !== 'object') return {};
  const result = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    result[String(key)] = String(value);
  }
  return result;
}

async function sendPushToUser(userId, title, message, data = {}) {
  if (!userId || !title || !message) {
    return { success: false, reason: 'Invalid push notification parameters' };
  }

  if (!isFirebaseConfigured()) {
    return { success: false, reason: 'Firebase not configured' };
  }

  try {
    const firestore = getFirestore();
    const messaging = getMessaging();

    const snapshot = await firestore
      .collection('deviceTokens')
      .where('userId', '==', String(userId))
      .get();

    if (snapshot.empty) {
      return { success: false, reason: 'No registered devices', sent: 0, failed: 0 };
    }

    const seenTokens = new Set();
    const validDocs = [];
    const malformedCleanup = [];

    for (const doc of snapshot.docs) {
      const rawToken = doc.data()?.token;
      const token = typeof rawToken === 'string' ? rawToken.trim() : '';
      if (!token || token.length < 20 || /\s/.test(token)) {
        malformedCleanup.push(doc.ref.delete());
        continue;
      }
      if (seenTokens.has(token)) continue;
      seenTokens.add(token);
      validDocs.push({ ref: doc.ref, token });
    }

    if (malformedCleanup.length) {
      await Promise.allSettled(malformedCleanup);
    }

    if (!validDocs.length) {
      return { success: false, reason: 'No valid registered devices', sent: 0, failed: 0 };
    }

    const stringifiedData = stringifyDataPayload(data);
    let sent = 0;
    let failed = 0;
    let cleaned = malformedCleanup.length;

    // FCM multicast supports up to 500 tokens per request.
    for (let i = 0; i < validDocs.length; i += 500) {
      const batch = validDocs.slice(i, i + 500);

      const response = await messaging.sendEachForMulticast({
        tokens: batch.map((entry) => entry.token),
        notification: {
          title: String(title),
          body: String(message)
        },
        data: stringifiedData,
        android: {
          priority: 'high',
          notification: {
            channelId: 'default'
          }
        }
      });

      sent += response.successCount || 0;
      failed += response.failureCount || 0;

      const cleanup = [];
      response.responses.forEach((result, index) => {
        if (!result.success && INVALID_TOKEN_ERROR_CODES.has(result.error?.code)) {
          cleanup.push(batch[index].ref.delete());
        }
      });

      if (cleanup.length) {
        const cleanupResults = await Promise.allSettled(cleanup);
        cleaned += cleanupResults.filter((r) => r.status === 'fulfilled').length;
      }
    }

    return {
      success: sent > 0,
      sent,
      failed,
      cleaned
    };
  } catch (error) {
    console.error('[FCM PUSH ERROR]', error?.code || error?.message || 'Push delivery failed');
    return {
      success: false,
      reason: error?.message || 'Push delivery failed',
      sent: 0,
      failed: 0
    };
  }
}

module.exports = { sendPushToUser };
