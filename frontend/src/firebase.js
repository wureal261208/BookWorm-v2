import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

// Firebase's client-side web config (apiKey, authDomain, etc.) is not a
// secret the way a server credential is - it's meant to ship in the bundle.
// It's still kept in env vars here for convenience when swapping projects
// (e.g. dev vs prod) without touching code.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
