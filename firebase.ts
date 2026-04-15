import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

// Import the Firebase configuration
import firebaseConfig from './firebase-applet-config.json';

// Initialize Firebase SDK
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Error signing in with Google", error);
    throw error;
  }
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out", error);
    throw error;
  }
};

/**
 * All authenticated Google users are allowed on the platform.
 * Access is gated by subscription/credits, not an email allowlist.
 * Admin status is still checked separately.
 */
export const checkUserAllowed = async (_email: string | null): Promise<boolean> => {
  // Any signed-in Google user may access the platform.
  // Credits / subscription tier control what they can actually do.
  return true;
};

export const initializeUserProfile = async (user: any) => {
  if (!user || !user.email) return;

  try {
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      // New user — give free trial credits
      const isAdmin = await checkIsAdmin(user.email);

      await setDoc(userRef, {
        uid: user.uid,
        email: user.email,
        tierId: 'free',
        credits: isAdmin ? 999 : 3, // 3 free trial books for new users
        role: isAdmin ? 'admin' : 'user',
        createdAt: Date.now(),
        stripeCustomerId: null,
        subscriptionStatus: 'free_trial',
      });
    }
  } catch (error) {
    console.error("Error initializing user profile:", error);
  }
};

export const checkIsAdmin = async (email: string | null): Promise<boolean> => {
  if (!email) return false;

  if (email === import.meta.env.VITE_ADMIN_EMAIL || email === 'hypocritic2002@gmail.com') {
    return true;
  }

  try {
    const docRef = doc(db, 'users', email);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data().role === 'admin';
    }
    return false;
  } catch (error) {
    console.error("Error checking admin status:", error);
    return false;
  }
};
