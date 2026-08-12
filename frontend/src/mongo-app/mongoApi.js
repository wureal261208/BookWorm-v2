// DEMO UI ONLY – logic removed
// The real mongoApi() called the Express + MongoDB backend under /api/*.
// This stub is a tiny self-contained fake backend that lives entirely in
// localStorage/memory for the /mongo-app/* demo routes, so every page in
// mongo-app/ (which only ever talks through this one function) keeps working
// unmodified while never reaching a real server or database.

import { fallbackBooks } from '../data/bookData'

const TOKEN_KEY = 'bw_access_token'
const USERS_KEY = 'demo_mongo_users'
const BOOKS_KEY = 'demo_mongo_books'
const COMMENTS_KEY = 'demo_mongo_comments'
const RENTALS_KEY = 'demo_mongo_rentals'

function readJson(key, fallback) {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, JSON.stringify(value))
}

function seedUsers() {
  return [
    { id: 'mongo-admin', name: 'Admin Demo', email: 'admin@bookworm.test', password: 'admin123', role: 'admin' },
    { id: 'mongo-manager', name: 'Manager Demo', email: 'manager@bookworm.test', password: 'manager123', role: 'manager' },
    { id: 'mongo-employee', name: 'Employee Demo', email: 'employee@bookworm.test', password: 'employee123', role: 'employee' },
    { id: 'mongo-customer', name: 'Customer Demo', email: 'customer@bookworm.test', password: 'customer123', role: 'customer' },
  ]
}

function seedBooks() {
  const usageTypes = ['read', 'rent', 'both', 'none']
  return fallbackBooks.map((book, index) => ({
    id: String(book.id),
    title: book.title,
    author: book.authors?.[0]?.name || 'Unknown',
    cover: book.formats?.['image/jpeg'] || '',
    description: `A BookWorm demo listing for "${book.title}".`,
    usageType: usageTypes[index % usageTypes.length],
  }))
}

function getUsers() {
  const stored = readJson(USERS_KEY, null)
  if (stored?.length) return stored
  const seeded = seedUsers()
  writeJson(USERS_KEY, seeded)
  return seeded
}

function getBooks() {
  const stored = readJson(BOOKS_KEY, null)
  if (stored?.length) return stored
  const seeded = seedBooks()
  writeJson(BOOKS_KEY, seeded)
  return seeded
}

function getComments() {
  return readJson(COMMENTS_KEY, [])
}

function getRentals() {
  return readJson(RENTALS_KEY, [])
}

function currentUser() {
  const token = getToken()
  if (!token) return null
  const userId = token.replace('demo-token-', '')
  return getUsers().find((user) => user.id === userId) || null
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

function publicUser(user) {
  if (!user) return null
  const rest = { ...user }
  delete rest.password
  return rest
}

export async function mongoApi(path, options = {}) {
  const { method = 'GET', body } = options
  const [routePath, queryString] = path.split('?')
  const params = new URLSearchParams(queryString || '')

  console.log(`demo only – ${method} ${path} not sent to a real server`)

  if (routePath === '/api/auth/register' && method === 'POST') {
    const users = getUsers()
    if (users.some((user) => user.email === body.email)) {
      throw new Error('An account with this email already exists.')
    }
    const user = { id: `mongo-${Date.now()}`, name: body.name, email: body.email, password: body.password, role: 'customer' }
    writeJson(USERS_KEY, [...users, user])
    const accessToken = `demo-token-${user.id}`
    setToken(accessToken)
    return { accessToken, user: publicUser(user) }
  }

  if (routePath === '/api/auth/login' && method === 'POST') {
    const user = getUsers().find((item) => item.email === body.email && item.password === body.password)
    if (!user) throw new Error('Invalid email or password.')
    const accessToken = `demo-token-${user.id}`
    setToken(accessToken)
    return { accessToken, user: publicUser(user) }
  }

  if (routePath === '/api/auth/me' && method === 'GET') {
    const user = currentUser()
    if (!user) throw new Error('Not signed in.')
    return { user: publicUser(user) }
  }

  if (routePath === '/api/books' && method === 'GET') {
    const query = (params.get('q') || '').toLowerCase()
    const limit = Number(params.get('limit')) || 24
    const books = getBooks().filter(
      (book) => !query || book.title.toLowerCase().includes(query) || book.author.toLowerCase().includes(query),
    )
    return { books: books.slice(0, limit) }
  }

  if (routePath === '/api/books' && method === 'POST') {
    const book = { id: `demo-mongo-${Date.now()}`, usageType: 'read', ...body }
    writeJson(BOOKS_KEY, [book, ...getBooks()])
    return { book }
  }

  if (/^\/api\/books\/[^/]+$/.test(routePath) && method === 'GET') {
    const id = routePath.split('/').pop()
    const book = getBooks().find((item) => item.id === id)
    if (!book) throw new Error('Book not found.')
    return { book }
  }

  if (routePath === '/api/comments' && method === 'GET') {
    const bookId = params.get('bookId')
    return { comments: getComments().filter((comment) => comment.bookId === bookId) }
  }

  if (routePath === '/api/comments' && method === 'POST') {
    const user = currentUser()
    const comment = {
      id: `demo-comment-${Date.now()}`,
      bookId: body.bookId,
      text: body.text,
      authorName: user?.name || 'Guest',
      createdAt: new Date().toISOString(),
    }
    writeJson(COMMENTS_KEY, [comment, ...getComments()])
    return { comment }
  }

  if (routePath === '/api/rentals/mine' && method === 'GET') {
    const user = currentUser()
    return { rentals: getRentals().filter((rental) => rental.userId === user?.id) }
  }

  if (routePath === '/api/rentals' && method === 'POST') {
    const user = currentUser()
    const rental = {
      id: `demo-rental-${Date.now()}`,
      userId: user?.id,
      bookId: body.bookId,
      bookTitle: body.bookTitle,
      recipientName: body.recipientName,
      phone: body.phone,
      address: body.address,
      note: body.note,
      status: 'pending',
      deliveryAt: null,
    }
    writeJson(RENTALS_KEY, [rental, ...getRentals()])
    return { rental }
  }

  return {}
}
