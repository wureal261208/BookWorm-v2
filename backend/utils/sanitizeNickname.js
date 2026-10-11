/**
 * Ensures user display names, pen names, or author tags are clean nicknames
 * and NEVER contain email addresses or raw email domains.
 *
 * @param {string} input - Raw author name, user name, or email string
 * @param {string} [fallback='Reader'] - Fallback name if input is empty or invalid
 * @returns {string} Clean, friendly nickname
 */
function sanitizeNickname(input, fallback = 'Reader') {
  if (!input || typeof input !== 'string') {
    return fallback;
  }

  let clean = input.trim();
  if (!clean) return fallback;

  // If formatted like "Display Name <email@example.com>", extract display name first
  if (clean.includes('<') && clean.includes('>')) {
    const withoutBrackets = clean.replace(/<[^>]*>/g, '').trim();
    if (withoutBrackets) {
      clean = withoutBrackets;
    }
  }

  // If input contains an email address (e.g. user@gmail.com)
  if (clean.includes('@')) {
    clean = clean.split('@')[0].trim();
  }

  // Replace common email separators like dots, underscores, pluses, or hyphens with spaces
  clean = clean.replace(/[._+\-]+/g, ' ').replace(/\s+/g, ' ').trim();

  // Strip out remaining punctuation/symbols while preserving letters (including unicode) and digits
  clean = clean.replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();

  if (!clean) {
    return fallback;
  }

  // Capitalize each word properly (e.g. "john doe" -> "John Doe")
  clean = clean
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  // Limit max length
  if (clean.length > 40) {
    clean = clean.slice(0, 40).trim();
  }

  return clean || fallback;
}

module.exports = sanitizeNickname;
