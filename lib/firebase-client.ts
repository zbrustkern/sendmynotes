import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    "AIzaSyB4xhUJaAELK5Ann4O-Ypyq5gu6CJwQ7K8",
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    "sendmynotes-2a417.firebaseapp.com",
  projectId:
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    "sendmynotes-2a417",
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    "sendmynotes-2a417.firebasestorage.app",
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ||
    "486379422282",
  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ||
    "1:486379422282:web:a236cfa24ef6bf8d7cdcb3",
  measurementId: "G-5DV25FZ7Q8",
};

export const getFirebaseApp = (): FirebaseApp => {
  return getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
};

export const getFirebaseAuth = (): Auth => {
  const app = getFirebaseApp();
  return getAuth(app);
};
