# auth-firebase — real Firebase Authentication for BookWorm

This folder is **independent** from the demo auth system
(`../../firebase.js`, `../../mockFirebaseAuth.js`) — it doesn't touch the
existing demo UI, so you can integrate it gradually without breaking what's
already running.

## Setup

```bash
cd frontend
npm install    # also installs the "firebase" package already in package.json
```

## Files

| File                  | Role                                                                    |
| ---------------------- | ------------------------------------------------------------------------ |
| `firebaseConfig.js`   | Real Firebase App + Auth initialization, using your project's config   |
| `validators.js`       | Validates email, password (≥6 chars, letters + numbers), intl phone, OTP |
| `firebaseErrors.js`   | Maps Firebase error codes (`auth/...`) to plain English messages       |
| `AuthFirebase.css`    | Shared, responsive styling — minimal design system (see design notes below) |
| `BrandMark.jsx`       | Inline SVG bookmark logo + wordmark (crisp at any screen density)      |
| `Login.jsx`           | Sign-in: Email/Password tab + Phone tab (reCAPTCHA + OTP), plus a low-key "Continue as guest" link |
| `Register.jsx`        | Email/Password sign-up                                                 |
| `ForgotPassword.jsx`  | Sends a password reset email                                           |
| `AuthFlow.jsx`        | Convenience wrapper that switches login/register/forgot screens without a router |

## Quick start (no router needed)

```jsx
import AuthFlow from './features/auth-firebase/AuthFlow'

function App() {
  return <AuthFlow onSuccess={(user) => console.log('Signed in', user)} />
}
```

## Using with react-router-dom (recommended for production)

```jsx
import { useNavigate } from 'react-router-dom'
import Login from './features/auth-firebase/Login'
import Register from './features/auth-firebase/Register'
import ForgotPassword from './features/auth-firebase/ForgotPassword'

// Inside <Routes>:
<Route path="/login" element={
  <Login
    onSuccess={() => navigate('/')}
    onGoToRegister={() => navigate('/register')}
    onForgotPassword={() => navigate('/forgot-password')}
  />
} />
<Route path="/register" element={
  <Register onSuccess={() => navigate('/')} onGoToLogin={() => navigate('/login')} />
} />
<Route path="/forgot-password" element={
  <ForgotPassword onBackToLogin={() => navigate('/login')} />
} />
```

## Watching auth state elsewhere in the app

```js
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from './features/auth-firebase/firebaseConfig'

onAuthStateChanged(auth, (user) => {
  // user === null if signed out
})
```

## Signing out

```js
import { signOut } from 'firebase/auth'
import { auth } from './features/auth-firebase/firebaseConfig'

await signOut(auth)
```

## Required checks in the Firebase Console before running

1. **Authentication → Sign-in method**: Email/Password, Phone, and
   Anonymous should be Enabled.
2. **Authentication → Settings → Authorized domains**: must include
   `localhost` (for `npm run dev`) and your real domain once deployed.
   A missing domain blocks sign-in with `auth/unauthorized-domain`.
3. **Phone Auth on localhost**: Google's free SMS quota is fairly low.
   During development, add test phone numbers under
   **Authentication → Sign-in method → Phone → Phone numbers for testing**
   (a number + a fixed OTP, e.g. `+84912345678` / `123456`) to avoid
   burning real SMS while iterating.
4. For production, consider enabling **App Check** (Firebase → App Check)
   to block bot abuse of the SMS quota.

## Design notes

`AuthFirebase.css` is a small, self-contained design system: warm paper
background, ink text, a single teal accent, underline-style inputs instead
of boxed borders, and a serif display face (`Lora`, loaded via Google
Fonts) reserved for headlines only — every control, label, and line of
copy stays on the app's existing `Inter` body font. Colors reuse CSS
custom properties scoped to `.fa-page`, so this folder doesn't leak styles
into the rest of the app.

## A note on uppercase passwords

Firebase Auth places **no restriction** on which characters a password may
contain — uppercase, lowercase, digits, and symbols are all accepted with
no extra Console configuration. The "≥6 characters, letters + numbers"
rule in `validators.js` is **client-side** validation matching your
original spec; to change it (e.g. require an uppercase character), edit
`validatePassword()`.
