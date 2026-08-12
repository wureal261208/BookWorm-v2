import { useEffect, useRef, useState } from 'react'
import {
  RecaptchaVerifier,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
} from 'firebase/auth'
import { auth } from './firebaseConfig'
import { getFirebaseErrorMessage } from './firebaseErrors'
import { validateEmail, validateOtpCode, validatePassword, validatePhone } from './validators'
import BrandMark from './BrandMark'
import './AuthFirebase.css'

/**
 * Login.jsx — Firebase sign-in with two methods:
 *   1. Email/Password
 *   2. Phone number (SMS OTP via invisible reCAPTCHA)
 * Anonymous sign-in is available as a low-key text link, not a primary
 * button, per the "optional, not required in the main UI" requirement.
 *
 * Props:
 *  - onSuccess?: (user) => void       called after any successful sign-in
 *  - onGoToRegister?: () => void      called when the user clicks "Sign up"
 *  - onForgotPassword?: () => void    called when the user clicks "Forgot password?"
 */
function Login({ onSuccess, onGoToRegister, onForgotPassword }) {
  const [method, setMethod] = useState('email') // 'email' | 'phone'

  // --- Email/Password state ---
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [emailErrors, setEmailErrors] = useState({})
  const [emailFormError, setEmailFormError] = useState('')
  const [emailLoading, setEmailLoading] = useState(false)

  // --- Phone/OTP state ---
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [phoneStep, setPhoneStep] = useState('enter-phone') // 'enter-phone' | 'enter-otp'
  const [phoneErrors, setPhoneErrors] = useState({})
  const [phoneFormError, setPhoneFormError] = useState('')
  const [phoneLoading, setPhoneLoading] = useState(false)
  const confirmationResultRef = useRef(null)
  const recaptchaVerifierRef = useRef(null)
  const recaptchaContainerRef = useRef(null)

  // --- Anonymous state ---
  const [guestLoading, setGuestLoading] = useState(false)
  const [guestError, setGuestError] = useState('')

  // Set up one invisible reCAPTCHA instance for the lifetime of this page.
  useEffect(() => {
    if (!recaptchaContainerRef.current || recaptchaVerifierRef.current) return

    recaptchaVerifierRef.current = new RecaptchaVerifier(auth, recaptchaContainerRef.current, {
      size: 'invisible',
    })

    return () => {
      recaptchaVerifierRef.current?.clear()
      recaptchaVerifierRef.current = null
    }
  }, [])

  function switchMethod(nextMethod) {
    setMethod(nextMethod)
    setEmailFormError('')
    setPhoneFormError('')
    setGuestError('')
  }

  // ---------- Email/Password ----------

  function updateEmailField(setter, field) {
    return (event) => {
      setter(event.target.value)
      setEmailErrors((current) => ({ ...current, [field]: '' }))
      setEmailFormError('')
    }
  }

  async function handleEmailSubmit(event) {
    event.preventDefault()
    setEmailFormError('')
    const nextErrors = {
      email: validateEmail(email),
      password: validatePassword(password),
    }
    setEmailErrors(nextErrors)
    if (Object.values(nextErrors).some(Boolean)) return

    setEmailLoading(true)
    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password)
      onSuccess?.(credential.user)
    } catch (error) {
      setEmailFormError(getFirebaseErrorMessage(error))
    } finally {
      setEmailLoading(false)
    }
  }

  // ---------- Phone/OTP ----------

  function updatePhoneField(event) {
    setPhone(event.target.value)
    setPhoneErrors((current) => ({ ...current, phone: '' }))
    setPhoneFormError('')
  }

  function updateOtpField(event) {
    setOtp(event.target.value)
    setPhoneErrors((current) => ({ ...current, otp: '' }))
    setPhoneFormError('')
  }

  async function handleSendOtp(event) {
    event.preventDefault()
    setPhoneFormError('')
    const phoneError = validatePhone(phone)
    setPhoneErrors({ phone: phoneError })
    if (phoneError) return

    setPhoneLoading(true)
    try {
      const confirmationResult = await signInWithPhoneNumber(
        auth,
        phone.trim(),
        recaptchaVerifierRef.current,
      )
      confirmationResultRef.current = confirmationResult
      setPhoneStep('enter-otp')
    } catch (error) {
      setPhoneFormError(getFirebaseErrorMessage(error))
      // Reset the widget so the next attempt gets a fresh reCAPTCHA token.
      recaptchaVerifierRef.current?.render().then((widgetId) => {
        window.grecaptcha?.reset(widgetId)
      })
    } finally {
      setPhoneLoading(false)
    }
  }

  async function handleVerifyOtp(event) {
    event.preventDefault()
    setPhoneFormError('')
    const otpError = validateOtpCode(otp)
    setPhoneErrors((current) => ({ ...current, otp: otpError }))
    if (otpError) return

    if (!confirmationResultRef.current) {
      setPhoneFormError('Verification session expired. Please request a new code.')
      setPhoneStep('enter-phone')
      return
    }

    setPhoneLoading(true)
    try {
      const credential = await confirmationResultRef.current.confirm(otp.trim())
      onSuccess?.(credential.user)
    } catch (error) {
      setPhoneFormError(getFirebaseErrorMessage(error))
    } finally {
      setPhoneLoading(false)
    }
  }

  function handleChangePhoneNumber() {
    setPhoneStep('enter-phone')
    setOtp('')
    setPhoneFormError('')
    confirmationResultRef.current = null
  }

  // ---------- Anonymous ----------

  async function handleGuestSignIn() {
    setGuestError('')
    setGuestLoading(true)
    try {
      const credential = await signInAnonymously(auth)
      onSuccess?.(credential.user)
    } catch (error) {
      setGuestError(getFirebaseErrorMessage(error))
    } finally {
      setGuestLoading(false)
    }
  }

  return (
    <main className="fa-page">
      <div className="fa-card">
        <BrandMark />
        <h1 className="fa-title">Log in</h1>
        <p className="fa-subtitle">Welcome back to BookWorm.</p>

        <div className="fa-tabs" role="tablist" aria-label="Sign-in method">
          <button
            type="button"
            role="tab"
            aria-selected={method === 'email'}
            className={`fa-tab ${method === 'email' ? 'is-active' : ''}`}
            onClick={() => switchMethod('email')}
          >
            Email
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={method === 'phone'}
            className={`fa-tab ${method === 'phone' ? 'is-active' : ''}`}
            onClick={() => switchMethod('phone')}
          >
            Phone
          </button>
        </div>

        {method === 'email' ? (
          <>
            {emailFormError && (
              <div className="fa-banner" role="alert">
                <i aria-hidden="true" className="bi bi-exclamation-circle" />
                <span>{emailFormError}</span>
              </div>
            )}

            <form noValidate onSubmit={handleEmailSubmit}>
              <div className="fa-field">
                <label htmlFor="login-email">Email</label>
                <div className="fa-input-wrap">
                  <input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    placeholder="ban@vidu.com"
                    value={email}
                    onChange={updateEmailField(setEmail, 'email')}
                    disabled={emailLoading}
                    aria-invalid={Boolean(emailErrors.email)}
                    aria-describedby="login-email-error"
                  />
                </div>
                {emailErrors.email && (
                  <span className="fa-error" id="login-email-error">{emailErrors.email}</span>
                )}
              </div>

              <div className="fa-field">
                <label htmlFor="login-password">Password</label>
                <div className="fa-input-wrap">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Password"
                    value={password}
                    onChange={updateEmailField(setPassword, 'password')}
                    disabled={emailLoading}
                    aria-invalid={Boolean(emailErrors.password)}
                    aria-describedby="login-password-error"
                  />
                  <button
                    type="button"
                    className="fa-toggle-visibility"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((current) => !current)}
                    disabled={emailLoading}
                  >
                    <i aria-hidden="true" className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`} />
                  </button>
                </div>
                {emailErrors.password && (
                  <span className="fa-error" id="login-password-error">{emailErrors.password}</span>
                )}
              </div>

              <button className="fa-submit" type="submit" disabled={emailLoading}>
                {emailLoading && <span className="fa-spinner" aria-hidden="true" />}
                {emailLoading ? 'Logging in…' : 'Log in'}
              </button>
            </form>

            <div className="fa-links">
              <button type="button" onClick={onForgotPassword} disabled={emailLoading}>
                Forgot password?
              </button>
              <span>
                Don’t have an account?{' '}
                <button type="button" onClick={onGoToRegister}>Sign up</button>
              </span>
            </div>
          </>
        ) : (
          <>
            {phoneFormError && (
              <div className="fa-banner" role="alert">
                <i aria-hidden="true" className="bi bi-exclamation-circle" />
                <span>{phoneFormError}</span>
              </div>
            )}

            {phoneStep === 'enter-phone' ? (
              <form noValidate onSubmit={handleSendOtp}>
                <div className="fa-field">
                  <label htmlFor="login-phone">Phone number</label>
                  <div className="fa-input-wrap">
                    <input
                      id="login-phone"
                      type="tel"
                      autoComplete="tel"
                      placeholder="+84912345678"
                      value={phone}
                      onChange={updatePhoneField}
                      disabled={phoneLoading}
                      aria-invalid={Boolean(phoneErrors.phone)}
                      aria-describedby="login-phone-error"
                    />
                  </div>
                  {phoneErrors.phone ? (
                    <span className="fa-error" id="login-phone-error">{phoneErrors.phone}</span>
                  ) : (
                    <span className="fa-hint">Include the country code, e.g. +84 (VN) or +65 (SG).</span>
                  )}
                </div>

                <button className="fa-submit" type="submit" disabled={phoneLoading}>
                  {phoneLoading && <span className="fa-spinner" aria-hidden="true" />}
                  {phoneLoading ? 'Sending code…' : 'Send verification code'}
                </button>
              </form>
            ) : (
              <form noValidate onSubmit={handleVerifyOtp}>
                <div className="fa-field">
                  <label htmlFor="login-otp">Verification code</label>
                  <div className="fa-input-wrap">
                    <input
                      id="login-otp"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="6 digits"
                      maxLength={6}
                      value={otp}
                      onChange={updateOtpField}
                      disabled={phoneLoading}
                      aria-invalid={Boolean(phoneErrors.otp)}
                      aria-describedby="login-otp-error"
                    />
                  </div>
                  {phoneErrors.otp ? (
                    <span className="fa-error" id="login-otp-error">{phoneErrors.otp}</span>
                  ) : (
                    <span className="fa-hint">Code sent to {phone.trim()}.</span>
                  )}
                </div>

                <button className="fa-submit" type="submit" disabled={phoneLoading}>
                  {phoneLoading && <span className="fa-spinner" aria-hidden="true" />}
                  {phoneLoading ? 'Verifying…' : 'Verify code'}
                </button>
                <button
                  className="fa-secondary"
                  type="button"
                  onClick={handleChangePhoneNumber}
                  disabled={phoneLoading}
                >
                  Change phone number
                </button>
              </form>
            )}

            <div className="fa-links">
              <span>
                Don’t have an account?{' '}
                <button type="button" onClick={onGoToRegister}>Sign up</button>
              </span>
            </div>
          </>
        )}

        {guestError && (
          <div className="fa-banner" role="alert" style={{ marginTop: 16, marginBottom: 0 }}>
            <i aria-hidden="true" className="bi bi-exclamation-circle" />
            <span>{guestError}</span>
          </div>
        )}
        <button
          type="button"
          className="fa-ghost-link"
          onClick={handleGuestSignIn}
          disabled={guestLoading}
        >
          {guestLoading ? 'Continuing as guest…' : 'Continue as guest'}
        </button>

        {/* Invisible reCAPTCHA anchor required by signInWithPhoneNumber. */}
        <div ref={recaptchaContainerRef} id="recaptcha-container" />
      </div>
    </main>
  )
}

export default Login
