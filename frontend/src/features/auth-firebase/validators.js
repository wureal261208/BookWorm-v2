// Shared validation used by Login / Register / ForgotPassword.
// Each function returns an error string (empty string = valid), so callers
// can do: const error = validateEmail(email); if (error) { ... }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// E.164 international format: + followed by 8–15 digits total, e.g.
// +84912345678, +6591234567, +12025550123
const PHONE_RE = /^\+[1-9]\d{7,14}$/

export function validateEmail(email) {
  const value = (email || '').trim()
  if (!value) return 'Please enter your email.'
  if (!EMAIL_RE.test(value)) return 'Please enter a valid email address.'
  return ''
}

// At least 6 characters, containing both a letter and a number.
// Uppercase/lowercase are both always allowed — Firebase Auth itself never
// restricts which characters a password may contain.
export function validatePassword(password) {
  if (!password) return 'Please enter a password.'
  if (password.length < 6) return 'Password must be at least 6 characters.'
  const hasLetter = /[A-Za-z]/.test(password)
  const hasDigit = /\d/.test(password)
  if (!hasLetter || !hasDigit) return 'Password must contain both letters and numbers.'
  return ''
}

export function validateConfirmPassword(password, confirmPassword) {
  if (!confirmPassword) return 'Please confirm your password.'
  if (password !== confirmPassword) return 'Passwords do not match.'
  return ''
}

// Requires international format with a leading "+" (E.164), e.g. +84, +65.
export function validatePhone(phone) {
  const value = (phone || '').trim()
  if (!value) return 'Please enter a phone number.'
  if (!PHONE_RE.test(value)) {
    return 'Enter an international format, e.g. +84912345678 or +6591234567.'
  }
  return ''
}

export function validateOtpCode(code) {
  const value = (code || '').trim()
  if (!value) return 'Please enter the verification code.'
  if (!/^\d{6}$/.test(value)) return 'The verification code is 6 digits.'
  return ''
}
