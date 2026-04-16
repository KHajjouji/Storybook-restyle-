/**
 * Server-side Firebase helpers using the Firebase client SDK (works in Node.js).
 * This module is intentionally separate from firebase.ts which uses import.meta.env
 * (Vite-only) and runs only in the browser.
 */

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { join } from 'path';

// ─── Initialize Firebase ────────────────────────────────────────────────────────

// Read config from JSON file (same config the browser client uses)
const configPath = join(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(readFileSync(configPath, 'utf-8'));

// Use a named app ('server') to avoid any conflict with a default app
const APP_NAME = 'server';
const firebaseApp =
  getApps().find(a => a.name === APP_NAME) ??
  initializeApp(firebaseConfig, APP_NAME);

const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

// ─── Credit helpers ─────────────────────────────────────────────────────────────

/**
 * Returns the current credit balance for a user.
 * Returns 0 if the user document doesn't exist or on any error.
 */
export const getUserCredits = async (userId: string): Promise<number> => {
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    if (!snap.exists()) return 0;
    return (snap.data()?.credits as number) ?? 0;
  } catch (err) {
    console.error('[firebaseServer] getUserCredits failed:', err);
    return 0;
  }
};

/**
 * Atomically deducts 1 credit from a user's balance.
 * Throws if the Firestore write fails.
 */
export const deductCredit = async (userId: string): Promise<void> => {
  await updateDoc(doc(db, 'users', userId), { credits: increment(-1) });
};
