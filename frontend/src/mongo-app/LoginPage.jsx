import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'

export default function LoginPage() {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { login, register } = useAuth()
  const navigate = useNavigate()

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      if (mode === 'login') {
        await login(form.email, form.password)
      } else {
        await register(form.name, form.email, form.password)
      }
      navigate('/mongo-app')
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mongo-login">
      <div className="account-settings-card">
        <div className="admin-filter-bar">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')} type="button">Login</button>
          <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')} type="button">Register</button>
        </div>
        {error && <p className="settings-error">{error}</p>}
        <form className="admin-form compact-form" onSubmit={submit}>
          {mode === 'register' && (
            <label className="wide-field">
              Full name
              <input onChange={(event) => updateForm('name', event.target.value)} required value={form.name} />
            </label>
          )}
          <label className="wide-field">
            Email
            <input onChange={(event) => updateForm('email', event.target.value)} required type="email" value={form.email} />
          </label>
          <label className="wide-field">
            Password
            <input onChange={(event) => updateForm('password', event.target.value)} required type="password" value={form.password} />
          </label>
          <button className="primary-button" disabled={submitting} type="submit">
            {submitting ? 'Please wait...' : mode === 'login' ? 'Login' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  )
}
