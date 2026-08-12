import { useState } from 'react'
import { sendPasswordResetEmail } from 'firebase/auth'
import { auth } from './firebaseConfig'
import { getFirebaseErrorMessage } from './firebaseErrors'
import { validateEmail } from './validators'
import BrandMark from './BrandMark'
import './AuthFirebase.css'

/**
 * ForgotPassword.jsx — sends a Firebase password-reset email.
 *
 * Props:
 *  - onBackToLogin?: () => void   called when the user clicks "Back to login"
 */
function ForgotPassword({ onBackToLogin }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  function updateEmail(event) {
    setEmail(event.target.value)
    setError('')
    setFormError('')
    setSent(false)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')
    const emailError = validateEmail(email)
    setError(emailError)
    if (emailError) return

    setLoading(true)
    try {
      await sendPasswordResetEmail(auth, email.trim())
      setSent(true)
    } catch (err) {
      // Firebase's default project settings return `auth/user-not-found`
      // for unregistered emails; some projects instead have "email
      // enumeration protection" on, in which case this call always
      // succeeds silently. Either way we show the same neutral success
      // message so we never confirm whether an email is registered.
      if (err?.code === 'auth/user-not-found') {
        setSent(true)
      } else {
        setFormError(getFirebaseErrorMessage(err))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="fa-page">
      <div className="fa-card">
        <BrandMark />
        <h1 className="fa-title">Reset password</h1>
        <p className="fa-subtitle">
          Enter your account email and BookWorm will send a password reset link.
        </p>

        {formError && (
          <div className="fa-banner" role="alert">
            <i aria-hidden="true" className="bi bi-exclamation-circle" />
            <span>{formError}</span>
          </div>
        )}

        {sent && (
          <div className="fa-banner is-success" role="status">
            <i aria-hidden="true" className="bi bi-check-circle" />
            <span>
              If this email has an account, a password reset link was just sent to{' '}
              {email.trim()}. Please check your inbox (including spam).
            </span>
          </div>
        )}

        <form noValidate onSubmit={handleSubmit}>
          <div className="fa-field">
            <label htmlFor="forgot-email">Email</label>
            <div className="fa-input-wrap">
              <input
                id="forgot-email"
                type="email"
                autoComplete="email"
                placeholder="ban@vidu.com"
                value={email}
                onChange={updateEmail}
                disabled={loading}
                aria-invalid={Boolean(error)}
                aria-describedby="forgot-email-error"
              />
            </div>
            {error && <span className="fa-error" id="forgot-email-error">{error}</span>}
          </div>

          <button className="fa-submit" type="submit" disabled={loading}>
            {loading && <span className="fa-spinner" aria-hidden="true" />}
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>

        <div className="fa-links" style={{ justifyContent: 'center' }}>
          <button type="button" onClick={onBackToLogin}>
            <i aria-hidden="true" className="bi bi-arrow-left" style={{ marginRight: 4 }} />
            Back to login
          </button>
        </div>
      </div>
    </main>
  )
}

export default ForgotPassword
