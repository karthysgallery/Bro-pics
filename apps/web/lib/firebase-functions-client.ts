import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';
import { getFirebaseApp } from './firebase-client';

let emulatorConnected = false;

export function getFirebaseFunctions(): Functions {
  const functions = getFunctions(getFirebaseApp());
  // Local QA only (same opt-in + production guard as firebase-client.ts).
  if (!emulatorConnected && process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === '1') {
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    emulatorConnected = true;
  }
  return functions;
}
