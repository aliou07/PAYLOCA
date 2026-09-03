import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getMessaging, getToken, isSupported, onMessage, type MessagePayload } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;

export const isFirebaseConfigured = Object.values(firebaseConfig).every(Boolean);
export const isFirebaseMessagingConfigured = isFirebaseConfigured && Boolean(vapidKey);

export const firebaseApp = isFirebaseConfigured
  ? (getApps()[0] ?? initializeApp(firebaseConfig))
  : null;
export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null;

export async function registerPaylocaServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  const base = import.meta.env.BASE_URL || '/';
  return navigator.serviceWorker.register(`${base}service-worker.js`, { scope: base });
}

export async function enablePushNotifications(
  onForegroundMessage?: (payload: MessagePayload) => void,
) {
  if (!firebaseApp || !isFirebaseMessagingConfigured || !('Notification' in window)) {
    return { enabled: false as const, reason: 'not-configured' as const };
  }

  const supported = await isSupported().catch(() => false);
  if (!supported) return { enabled: false as const, reason: 'unsupported' as const };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { enabled: false as const, reason: 'permission-denied' as const };
  }

  const registration = await registerPaylocaServiceWorker();
  if (!registration) return { enabled: false as const, reason: 'service-worker-unavailable' as const };

  const messaging = getMessaging(firebaseApp);
  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  });
  if (!token) return { enabled: false as const, reason: 'token-unavailable' as const };

  const unsubscribe = onForegroundMessage ? onMessage(messaging, onForegroundMessage) : undefined;
  return { enabled: true as const, token, unsubscribe };
}
