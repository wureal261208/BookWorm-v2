// DEMO UI ONLY – logic removed
// The real file synced BookWorm's "global" and "per-user" documents to
// Firestore in realtime (onSnapshot) and wrote changes back (setDoc). This
// stub keeps every exported function name and shape identical, but the
// "database" is just an in-memory object seeded from ./mockData.js. Reads
// fire once with mock data (like a snapshot that never changes); writes are
// no-ops that log to the console instead of touching Firebase.

import { mockComments } from '../mockData'

export const globalDataDefaults = {
  viewCounts: {},
  bookReaders: {},
  comments: {},
  staff: [],
  knownUsers: [],
}

export const userDataDefaults = {
  favorites: [],
  history: [],
  readingActivity: {},
  progress: {},
  checkpoints: {},
  notes: {},
  highlights: {},
  searchHistory: [],
  accountSettings: {},
  websiteTheme: 'light',
  readerTheme: 'light',
  readerFontSize: 18,
}

const mockGlobalData = {
  ...globalDataDefaults,
  comments: mockComments,
}

export function subscribeGlobalData(onData) {
  let cancelled = false
  // Fires once with the seeded demo data, then never again — there is no
  // real backend to push further changes.
  Promise.resolve().then(() => {
    if (!cancelled) onData(mockGlobalData)
  })
  return () => {
    cancelled = true
  }
}

export function subscribeUserData(_userId, onData) {
  let cancelled = false
  Promise.resolve().then(() => {
    if (!cancelled) onData(userDataDefaults)
  })
  return () => {
    cancelled = true
  }
}

export function saveGlobalData() {
  console.log('demo only – global data change not persisted')
  return Promise.resolve()
}

export function subscribeComments(onData) {
  let cancelled = false
  Promise.resolve().then(() => {
    if (!cancelled) onData(mockComments)
  })
  return () => {
    cancelled = true
  }
}

export function saveBookComment(bookId, comment) {
  console.log(`demo only – comment on book ${bookId} not persisted`, comment)
  return Promise.resolve()
}

export function migrateLegacyComments() {
  return Promise.resolve()
}

export function saveUserData(userId) {
  console.log(`demo only – user data for ${userId} not persisted`)
  return Promise.resolve()
}

export function stableStringify(value) {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (!value || typeof value !== 'object') return value

  return Object.keys(value)
    .sort()
    .reduce((result, key) => {
      result[key] = sortKeys(value[key])
      return result
    }, {})
}
