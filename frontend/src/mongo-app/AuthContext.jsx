import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { clearToken, getToken, mongoApi, setToken } from './mongoApi'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const restoreSession = useCallback(async () => {
    if (!getToken()) {
      setLoading(false)
      return
    }
    try {
      const data = await mongoApi('/api/auth/me')
      setUser(data.user)
    } catch {
      clearToken()
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    restoreSession()
  }, [restoreSession])

  async function register(name, email, password) {
    const data = await mongoApi('/api/auth/register', { method: 'POST', body: { name, email, password } })
    setToken(data.accessToken)
    setUser(data.user)
    return data.user
  }

  async function login(email, password) {
    const data = await mongoApi('/api/auth/login', { method: 'POST', body: { email, password } })
    setToken(data.accessToken)
    setUser(data.user)
    return data.user
  }

  function logout() {
    clearToken()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, register, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
