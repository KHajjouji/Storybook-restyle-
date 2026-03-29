import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

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

export const checkUserAllowed = async (email: string | null): Promise<boolean> => {
  if (!email) return false;
  
  // Default admin is always allowed
  if (email === import.meta.env.VITE_ADMIN_EMAIL) {
    return true;
  }

  try {
    const docRef = doc(db, 'allowedEmails', email);
    const docSnap = await getDoc(docRef);
    return docSnap.exists();
  } catch (error) {
    console.error("Error checking user allowed status:", error);
    return false;
  }
};

export const checkIsAdmin = async (email: string | null): Promise<boolean> => {
  if (!email) return false;
  
  if (email === import.meta.env.VITE_ADMIN_EMAIL) {
    return true;
  }

  try {
    const docRef = doc(db, 'allowedEmails', email);
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
