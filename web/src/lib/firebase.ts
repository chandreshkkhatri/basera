import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

/**
 * Firebase client init from public env config (NEXT_PUBLIC_FIREBASE_*). These
 * are not secrets — Firebase security is enforced by Firestore rules + the
 * Google OAuth authorized-domains list, not by hiding the config.
 *
 * Everything is lazy and null-safe: if the env vars aren't set, `getFirebase()`
 * returns null and the auth/saves UI quietly disables itself, so the app keeps
 * working (browsing is public) without Firebase configured.
 */
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseEnabled = Boolean(
  config.apiKey && config.authDomain && config.projectId && config.appId,
);

let cached: { app: FirebaseApp; auth: Auth; db: Firestore } | null = null;

/** Client-only. Returns null when Firebase isn't configured. */
export function getFirebase() {
  if (!firebaseEnabled) return null;
  if (!cached) {
    const app = getApps().length ? getApp() : initializeApp(config);
    cached = { app, auth: getAuth(app), db: getFirestore(app) };
  }
  return cached;
}
