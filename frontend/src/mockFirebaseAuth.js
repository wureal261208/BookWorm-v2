// DEMO UI ONLY – logic removed
// Drop-in replacement for the handful of `firebase/auth` functions App.jsx
// used to call. Same names, same call signatures, no real Firebase project
// involved — everything reads/writes the local mock account list from
// ./mockData.js. Error `code`s match what App.jsx's getAuthMessage() expects
// so the sign-in/sign-up form still shows the right inline error copy.

import {
  clearSession,
  findAccountByEmail,
  findAccountByUid,
  loadAccounts,
  setSessionUid,
  upsertAccount,
} from './mockData'

function buildFirebaseUser(account) {
  if (!account) return null
  return {
    uid: account.uid,
    email: account.email,
    displayName: account.name,
    photoURL: account.avatar || '',
  }
}

function authError(code) {
  const error = new Error(code)
  error.code = code
  return error
}

function notify(auth) {
  auth._listeners.forEach((listener) => listener(auth.currentUser))
}

export function onAuthStateChanged(auth, callback) {
  auth._listeners.add(callback)
  // Mirrors Firebase's async-first callback so effects that depend on it
  // don't run before React has finished mounting.
  Promise.resolve().then(() => callback(auth.currentUser))
  return () => auth._listeners.delete(callback)
}

export async function signInWithEmailAndPassword(auth, email, password) {
  console.log('demo only – no real Firebase sign-in')
  const account = findAccountByEmail(email)
  if (!account || account.password !== password) {
    throw authError('auth/invalid-credential')
  }
  auth.currentUser = buildFirebaseUser(account)
  setSessionUid(account.uid)
  notify(auth)
  return { user: auth.currentUser }
}

export async function createUserWithEmailAndPassword(auth, email, password) {
  console.log('demo only – no real Firebase account created')
  if (findAccountByEmail(email)) throw authError('auth/email-already-in-use')
  if (!password || password.length < 6) throw authError('auth/weak-password')

  const account = {
    uid: `demo-customer-${Date.now()}`,
    name: email.split('@')[0],
    email,
    password,
    role: 'customer',
    avatar: '',
  }
  upsertAccount(account)
  auth.currentUser = buildFirebaseUser(account)
  setSessionUid(account.uid)
  notify(auth)
  return { user: auth.currentUser }
}

export async function signOut(auth) {
  console.log('demo only – local session cleared')
  auth.currentUser = null
  clearSession()
  notify(auth)
}

export async function updateProfile(user, { displayName } = {}) {
  console.log('demo only – profile change kept in local demo data only')
  if (!user) return
  const account = findAccountByUid(user.uid)
  if (account) {
    upsertAccount({ ...account, name: displayName ?? account.name })
  }
  user.displayName = displayName ?? user.displayName
}

export async function sendPasswordResetEmail(_auth, email) {
  console.log(`demo only – no reset email actually sent to ${email}`)
}

// Not used directly by App.jsx today, but kept for completeness in case a
// component reaches for the full account list (e.g. an admin tool).
export function listMockAccounts() {
  return loadAccounts()
}
