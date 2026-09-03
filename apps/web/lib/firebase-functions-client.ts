import { getFunctions, type Functions } from 'firebase/functions';
import { getFirebaseApp } from './firebase-client';

export function getFirebaseFunctions(): Functions {
  return getFunctions(getFirebaseApp());
}
