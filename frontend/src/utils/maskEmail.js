// Masks the local part of an email address for display, e.g.
// "johnsmith@example.com" -> "jo*******h@example.com". Used both for a
// person's own email on their profile, and for every account-management
// view (Manager/Employee/Customer lists) where an Admin/Manager is looking
// at someone else's email.
export function maskEmail(email) {
  if (!email) return 'No email linked yet'
  const [localPart, domain = ''] = email.split('@')
  if (!localPart || !domain) return email

  const visiblePrefix = localPart.slice(0, Math.min(2, localPart.length))
  const visibleSuffix = localPart.slice(-1)
  const maskedLocal = `${visiblePrefix}${'*'.repeat(Math.max(2, localPart.length - 2))}${visibleSuffix}`
  return `${maskedLocal}@${domain}`
}
