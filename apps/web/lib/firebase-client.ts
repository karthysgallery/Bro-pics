import { type FirebaseApp, getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Local QA against the Firebase emulators (firebase.json: auth 9099,
// firestore 8080; storage is only touched server-side). Opt-in with
// NEXT_PUBLIC_USE_FIREBASE_EMULATORS=1 and hard-disabled in production
// builds, so a stray variable can never point real customers at localhost.
function shouldUseEmulators(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === '1';
}

function connectEmulators(app: FirebaseApp): void {
  // Must run before any other call on these service instances — which is
  // why it's done here, once, at app creation rather than at call sites.
  connectAuthEmulator(getAuth(app), 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(getFirestore(app), '127.0.0.1', 8080);
}

export function getFirebaseApp(): FirebaseApp {
  const existing = getApps();
  if (existing.length > 0) return existing[0];
  const app = initializeApp(firebaseConfig);
  if (shouldUseEmulators()) connectEmulators(app);
  return app;
}
