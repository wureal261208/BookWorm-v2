import { auth } from '../features/auth-firebase/firebaseConfig'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'

async function request(path, { method = 'GET', body, requireAuth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' }

  if (auth.currentUser) {
    const token = await auth.currentUser.getIdToken()
    headers.Authorization = `Bearer ${token}`
  } else if (requireAuth) {
    throw new Error('You must log in to do this.')
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  let payload = null
  try {
    payload = await response.json()
  } catch (error) {
    payload = null
  }

  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || `Request failed with status ${response.status}`)
  }

  return payload?.data ?? {}
}

// For routes that work for anonymous visitors too (still attaches a token
// when the visitor happens to be signed in, e.g. reading a book).
export async function publicApiFetch(path, options = {}) {
  return request(path, options)
}

// For routes that require the visitor to be signed in.
export async function apiFetch(path, options = {}) {
  return request(path, { ...options, requireAuth: true })
}
