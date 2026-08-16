// This file used to hold its own Firebase config that read from
// import.meta.env.VITE_FIREBASE_* env vars - but the project never had a
// `.env` file, so `apiKey` was always undefined and any code importing from
// here crashed with `auth/invalid-api-key`.
//
// The one working, correct config lives in
// `./features/auth-firebase/firebaseConfig.js` (already used by Login,
// Register, and ForgotPassword). Re-exporting from there instead of keeping
// a second copy means both configs can no longer drift apart.
export { app, auth } from './features/auth-firebase/firebaseConfig'
