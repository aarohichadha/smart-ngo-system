import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAw6y71VPxuXgQJZ6Go4useUPqGNUDZmZ8",
  authDomain: "smart-ngo-system.firebaseapp.com",
  projectId: "smart-ngo-system",
  storageBucket: "smart-ngo-system.firebasestorage.app",
  messagingSenderId: "246661988627",
  appId: "1:246661988627:web:40bac9776c361ad8529ae6",
  measurementId: "G-MMGDRKE24R"
};

const hasRequiredFirebaseConfig =
  !!firebaseConfig.apiKey &&
  !!firebaseConfig.authDomain &&
  !!firebaseConfig.projectId &&
  !!firebaseConfig.appId;

export const isFirebaseConfigured = () => hasRequiredFirebaseConfig;

export const getFirebaseAuth = () => {
  if (!hasRequiredFirebaseConfig) {
    throw new Error(
      "Firebase is not configured. Add API keys in src/lib/firebase.js.",
    );
  }

  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  return getAuth(app);
};