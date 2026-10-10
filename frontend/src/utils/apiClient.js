import { auth } from '../features/auth-firebase/firebaseConfig'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'

async function request(path, { method = 'GET', body, requireAuth = false } = {}) {
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
  const headers = isFormData ? {} : { 'Content-Type': 'application/json' }

  if (auth.currentUser) {
    const token = await auth.currentUser.getIdToken()
    headers.Authorization = `Bearer ${token}`
  } else if (requireAuth) {
    throw new Error('You must log in to do this.')
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: isFormData ? body : (body !== undefined ? JSON.stringify(body) : undefined),
  })

  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok || payload?.success === false) {
    const error = new Error(payload?.message || `Request failed with status ${response.status}`)
    // Lets a caller tell "the server rejected me" (401/403 - a real auth
    // failure) apart from "something went wrong reaching the server"
    // (network error, 500, cold start) - see App.jsx's resolveTrustedProfile,
    // which used to sign a person back out on ANY failure here, including
    // ones that had nothing to do with their account being invalid.
    error.status = response.status
    throw error
  }

  // A bare `?? {}` here would silently turn a legitimate `null` (several
  // endpoints - getCurrentConversation, getPendingRating - return null on
  // purpose to mean "nothing here") into a truthy `{}`, which every caller
  // checking `if (result)` would then wrongly treat as "something's there".
  // Only missing the `data` key entirely (a response with no data field at
  // all) falls back to `{}` - an explicit null is passed through as null.
  return 'data' in (payload || {}) ? payload.data : {}
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
