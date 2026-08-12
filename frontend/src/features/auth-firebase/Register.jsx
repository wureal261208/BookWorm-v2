import { useState } from 'react'
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth'
import { auth } from './firebaseConfig'
import { getFirebaseErrorMessage } from './firebaseErrors'
import { validateConfirmPassword, validateEmail, validatePassword } from './validators'
import BrandMark from './BrandMark'
import './AuthFirebase.css'

/**
 * Register.jsx — Firebase Email/Password sign-up.
 *
 * Props:
 *  - onSuccess?: (user) => void   called after the account is created
 *  - onGoToLogin?: () => void     called when the user clicks "Log in"
 */
function Register({ onSuccess, onGoToLogin }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [loading, setLoading] = useState(false)

  function updateField(setter, field) {
    return (event) => {
      setter(event.target.value)
      setErrors((current) => ({ ...current, [field]: '' }))
      setFormError('')
    }
  }

  function runValidation() {
    const nextErrors = {
      email: validateEmail(email),
      password: validatePassword(password),
      confirmPassword: validateConfirmPassword(password, confirmPassword),
    }
    setErrors(nextErrors)
    return Object.values(nextErrors).every((message) => !message)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')
    if (!runValidation()) return

    setLoading(true)
    try {
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password)
      if (name.trim()) {
        await updateProfile(credential.user, { displayName: name.trim() })
      }
      onSuccess?.(credential.user)
    } catch (error) {
      setFormError(getFirebaseErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="fa-page">
      <div className="fa-card">
        <BrandMark />
        <h1 className="fa-title">Create account</h1>
        <p className="fa-subtitle">Sign up to save favorites and rent books on BookWorm.</p>

        {formError && (
          <div className="fa-banner" role="alert">
            <i aria-hidden="true" className="bi bi-exclamation-circle" />
            <span>{formError}</span>
          </div>
        )}

        <form noValidate onSubmit={handleSubmit}>
          <div className="fa-field">
            <label htmlFor="register-name">Full name (optional)</label>
            <div className="fa-input-wrap">
              <input
                id="register-name"
                type="text"
                autoComplete="name"
                placeholder="Your display name"
                value={name}
                onChange={updateField(setName, 'name')}
                disabled={loading}
              />
            </div>
          </div>

          <div className="fa-field">
            <label htmlFor="register-email">Email</label>
            <div className="fa-input-wrap">
              <input
                id="register-email"
                type="email"
                autoComplete="email"
                placeholder="ban@vidu.com"
                value={email}
                onChange={updateField(setEmail, 'email')}
                disabled={loading}
                aria-invalid={Boolean(errors.email)}
                aria-describedby="register-email-error"
              />
            </div>
            {errors.email && (
              <span className="fa-error" id="register-email-error">{errors.email}</span>
            )}
          </div>

          <div className="fa-field">
            <label htmlFor="register-password">Password</label>
            <div className="fa-input-wrap">
              <input
                id="register-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="At least 6 characters, letters and numbers"
                value={password}
                onChange={updateField(setPassword, 'password')}
                disabled={loading}
                aria-invalid={Boolean(errors.password)}
                aria-describedby="register-password-error"
              />
              <button
                type="button"
                className="fa-toggle-visibility"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((current) => !current)}
                disabled={loading}
              >
                <i aria-hidden="true" className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`} />
              </button>
            </div>
            {errors.password ? (
              <span className="fa-error" id="register-password-error">{errors.password}</span>
            ) : (
              <span className="fa-hint">
                Uppercase, lowercase, and numbers are all fine — no restrictions.
              </span>
            )}
          </div>

          <div className="fa-field">
            <label htmlFor="register-confirm-password">Confirm password</label>
            <div className="fa-input-wrap">
              <input
                id="register-confirm-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={updateField(setConfirmPassword, 'confirmPassword')}
                disabled={loading}
                aria-invalid={Boolean(errors.confirmPassword)}
                aria-describedby="register-confirm-password-error"
              />
            </div>
            {errors.confirmPassword && (
              <span className="fa-error" id="register-confirm-password-error">{errors.confirmPassword}</span>
            )}
          </div>

          <button className="fa-submit" type="submit" disabled={loading}>
            {loading && <span className="fa-spinner" aria-hidden="true" />}
            {loading ? 'Creating account…' : 'Sign up'}
          </button>
        </form>

        <div className="fa-links">
          <span>Already have an account?</span>
          <button type="button" onClick={onGoToLogin}>Log in</button>
        </div>
      </div>
    </main>
  )
}

export default Register
