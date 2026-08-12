// Translates Firebase Auth error codes into short, user-facing English
// messages so forms never show raw "Firebase: Error (auth/xxx)" strings.

const MESSAGES = {
  // Email/password
  'auth/email-already-in-use': 'This email is already registered. Try logging in instead.',
  'auth/invalid-email': 'That email address isn\u2019t valid.',
  'auth/weak-password': 'Password is too weak — use at least 6 characters with letters and numbers.',
  'auth/user-not-found': 'No account found with this email.',
  'auth/wrong-password': 'Incorrect password. Please try again.',
  'auth/invalid-credential': 'Email or password is incorrect.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/too-many-requests': 'Too many attempts. Please try again in a few minutes.',

  // Phone
  'auth/invalid-phone-number': 'That phone number isn\u2019t valid. Use international format, e.g. +84912345678.',
  'auth/missing-phone-number': 'Please enter a phone number.',
  'auth/quota-exceeded': 'SMS limit reached for today. Please try again later.',
  'auth/code-expired': 'The verification code expired. Request a new one.',
  'auth/invalid-verification-code': 'That verification code is incorrect.',
  'auth/invalid-verification-id': 'This verification session expired. Please request a new code.',
  'auth/captcha-check-failed': 'reCAPTCHA verification failed. Reload the page and try again.',

  // General
  'auth/network-request-failed': 'Network error. Check your connection and try again.',
  'auth/popup-closed-by-user': 'The sign-in window was closed before finishing.',
  'auth/operation-not-allowed': 'This sign-in method isn\u2019t enabled in the Firebase Console.',
  'auth/unauthorized-domain': 'This domain isn\u2019t in the Firebase Authorized domains list.',
}

export function getFirebaseErrorMessage(error) {
  const code = error?.code || ''
  return MESSAGES[code] || 'Something went wrong. Please try again.'
}
