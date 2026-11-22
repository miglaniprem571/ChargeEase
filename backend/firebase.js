const admin = require('firebase-admin');

function normalizePrivateKey(rawKey) {
  let key = String(rawKey || '').trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }
  return key.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
}

function isFirebaseConfigured() {
  return Boolean(
    String(process.env.FIREBASE_PROJECT_ID || '').trim() &&
    String(process.env.FIREBASE_CLIENT_EMAIL || '').trim() &&
    String(process.env.FIREBASE_PRIVATE_KEY || '').trim()
  );
}

function getFirebaseApp() {
  if (admin.apps.length) {
    return admin.app();
  }

  const projectId = String(process.env.FIREBASE_PROJECT_ID || '').trim();
  const clientEmail = String(process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !rawPrivateKey) {
    throw new Error('Firebase environment variables are missing');
  }

  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey: normalizePrivateKey(rawPrivateKey),
    }),
  });
}

function getFirestore() {
  getFirebaseApp();
  return admin.firestore();
}

function getMessaging() {
  getFirebaseApp();
  return admin.messaging();
}

module.exports = {
  admin,
  get firestore() {
    return getFirestore();
  },
  isFirebaseConfigured,
  getFirebaseApp,
  getFirestore,
  getMessaging,
};
