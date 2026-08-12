// DEMO UI ONLY – logic removed
// Central mock data + tiny fake "backend" used by the stripped API layer
// (firebase.js, mockFirebaseAuth.js, utils/apiClient.js, utils/firebaseData.js,
// mongo-app/mongoApi.js). Nothing here ever leaves the browser: state is kept
// in memory and mirrored to localStorage only so a page refresh keeps you
// "logged in" during the demo, exactly like the real app used to feel.

import { starterAccounts } from './data/bookData'

const ACCOUNTS_KEY = 'demo_bw_accounts'
const SESSION_KEY = 'demo_bw_session'

function safeParse(json, fallback) {
  try {
    const value = JSON.parse(json)
    return value ?? fallback
  } catch {
    return fallback
  }
}

function readStorage(key, fallback) {
  if (typeof window === 'undefined') return fallback
  const raw = window.localStorage.getItem(key)
  return raw ? safeParse(raw, fallback) : fallback
}

function writeStorage(key, value) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, JSON.stringify(value))
}

function seedAccounts() {
  return starterAccounts.map((account, index) => ({
    uid: `demo-${account.role}-${index}`,
    name: account.name,
    email: account.email,
    password: account.password,
    role: account.role,
    avatar: '',
  }))
}

export function loadAccounts() {
  const stored = readStorage(ACCOUNTS_KEY, null)
  if (Array.isArray(stored) && stored.length) return stored
  const seeded = seedAccounts()
  writeStorage(ACCOUNTS_KEY, seeded)
  return seeded
}

export function saveAccounts(accounts) {
  writeStorage(ACCOUNTS_KEY, accounts)
}

export function findAccountByEmail(email) {
  return loadAccounts().find((item) => item.email === email.toLowerCase())
}

export function findAccountByUid(uid) {
  return loadAccounts().find((item) => item.uid === uid)
}

export function upsertAccount(account) {
  const accounts = loadAccounts()
  const index = accounts.findIndex((item) => item.email === account.email)
  if (index === -1) {
    accounts.push(account)
  } else {
    accounts[index] = { ...accounts[index], ...account }
  }
  saveAccounts(accounts)
  return account
}

export function removeAccountByUid(uid) {
  saveAccounts(loadAccounts().filter((item) => item.uid !== uid))
}

export function getSessionUid() {
  return readStorage(SESSION_KEY, null)
}

export function setSessionUid(uid) {
  writeStorage(SESSION_KEY, uid)
}

export function clearSession() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(SESSION_KEY)
}

// A handful of extra "manager/admin curated" catalog rows so pages that read
// from /api/books/mine or the admin dashboard have something to show.
export const mockManagedBooks = [
  {
    id: 'demo-managed-1',
    title: 'BookWorm Field Notes',
    author: 'BookWorm Editorial',
    category: 'Reference',
    description: 'A short, hand-curated staff pick used only for this UI demo.',
    status: 'published',
    access: 'read',
    cover: '',
    chapters: [{ title: 'Chapter 1', pages: 10, content: '' }],
  },
]

export const mockComments = {
  84: [
    { id: 'c1', author: 'Reader One', text: 'One of my favorite classics!', createdAt: new Date().toISOString() },
    { id: 'c2', author: 'Reader Two', text: 'The pacing in the second half is wonderful.', createdAt: new Date().toISOString() },
  ],
}

export const mockNotifications = [
  {
    id: 'notification-demo-1',
    targetEmail: 'customer@bookworm.test',
    type: 'rental-approved',
    message: 'Your order for "Pride and Prejudice" was approved. Expected delivery: this Friday.',
    bookTitle: 'Pride and Prejudice',
    deliveryAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    read: false,
  },
]

export const mockRentalRequests = []

export const MOCK_READER_TEXT = `This is placeholder reading text used only for this static UI demo.

In the full application, this page would show the real chapter text for the selected book, loaded from its original source. Here, the same paragraph repeats so you can see how pagination, font size, and the reading theme controls behave.

The quick brown fox jumps over the lazy dog. Chapters, page numbers, and progress tracking below are all working against local demo state only — nothing is saved to a server.

Feel free to flip through a few pages, switch the reading theme, or resize the text to see how the reader layout responds.`
