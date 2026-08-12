/**
 * Masks an email address for safe display in API responses.
 * Example: "john.doe@gmail.com" -> "jo****@gmail.com"
 * @param {string} email
 * @returns {string}
 */
function maskEmail(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return email;
  }

  const [name, domain] = email.split('@');
  const visible = name.slice(0, 2);
  const maskedName = visible.length > 0 ? `${visible}****` : '****';

  return `${maskedName}@${domain}`;
}

module.exports = maskEmail;
