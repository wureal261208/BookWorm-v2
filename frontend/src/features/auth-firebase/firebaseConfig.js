// Real Firebase initialization for BookWorm v2.
// This is a genuine `firebase/app` + `firebase/auth` client, distinct from
// the demo mock at `src/firebase.js` used by the rest of this UI-only repo.
// Requires the real `firebase` package: `npm install firebase`.

import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

// NOTE: a Firebase Web API key is not a secret — it just identifies which
// Firebase project a request belongs to. Access is controlled by Firebase's
// Authorized domains list and by your Firestore/Storage security rules, not
// by hiding this value. It's still fine (and common practice) to move this
// into Vite env vars (import.meta.env.VITE_FIREBASE_*) if you want one
// config file per environment (dev/staging/prod) later.
const firebaseConfig = {
  apiKey: 'AIzaSyBJYQZxgPDX4odyyajl-uPnQZZlBhjd7bI',
  authDomain: 'bookworm-v2-ced9e.firebaseapp.com',
  projectId: 'bookworm-v2-ced9e',
  storageBucket: 'bookworm-v2-ced9e.firebasestorage.app',
  messagingSenderId: '846936171643',
  appId: '1:846936171643:web:ff00e2785e23647e4a2ede',
  measurementId: 'G-XFE0S4GBGC',
}

// Guards against re-initializing if this module is somehow evaluated twice
// (e.g. hot module reload during `vite dev`).
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig)
export const auth = getAuth(app)
