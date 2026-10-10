export const NO_COVER_IMAGE = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300" width="200" height="300">'
  + '<rect width="200" height="300" fill="#f4f4ee" rx="4"/>'
  + '<rect x="2" y="2" width="196" height="296" rx="3" fill="none" stroke="#d5d5cc" stroke-width="2"/>'
  + '<rect x="62" y="85" width="76" height="100" rx="3" fill="none" stroke="#99998e" stroke-width="2.5"/>'
  + '<line x1="72" y1="85" x2="72" y2="185" stroke="#99998e" stroke-width="2"/>'
  + '<path d="M84 115h32M84 130h32M84 145h20" stroke="#abab9e" stroke-width="2" stroke-linecap="round"/>'
  + '<text x="100" y="222" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-size="14" font-weight="700" fill="#75756c" text-anchor="middle" letter-spacing="0.5">No cover</text>'
  + '</svg>'
)

export function getCover(book) {
  if (!book) return NO_COVER_IMAGE
  const rawCover =
    book.cover_image ||
    book.coverUrl ||
    book.cover ||
    book.formats?.['image/jpeg'] ||
    ''

  return typeof rawCover === 'string' && rawCover.trim() ? rawCover.trim() : NO_COVER_IMAGE
}

export function getAuthor(book) {
  return book.authors?.map((author) => author.name).join(', ') || book.author || 'Unknown author'
}

export function getReaderUrl(book) {
  const formats = book.formats || {}

  return (
    formats['text/html'] ||
    formats['text/html; charset=utf-8'] ||
    formats['text/plain'] ||
    formats['text/plain; charset=utf-8'] ||
    book.readerUrl ||
    ''
  )
}

export function getCategory(book) {
  return book.bookshelves?.[0] || book.subjects?.[0]?.split('--')[0].trim() || book.category || 'Classic'
}

export function getDescription(book) {
  const subjects = book.subjects?.slice(0, 3).join(', ')
  return (
    book.description ||
    `A public-domain ${getCategory(book).toLowerCase()} title by ${getAuthor(book)}. Explore the story, save it to your shelf, and continue reading in the BookWorm reader.${subjects ? ` Subjects: ${subjects}.` : ''}`
  )
}

export function getInitials(name = '') {
  const clean = name.trim()
  if (!clean) return 'BW'

  const words = clean.split(/\s+/).filter(Boolean)
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()

  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
}

// Some raw category text still carries Gutenberg's own site-chrome prefix
// verbatim (e.g. "Browsing: History - Ancient" is a real shelf name on
// gutenberg.org, not corrupted data - see the comment on guessedCategory
// in AdminPage.jsx). Newly-imported books already have this stripped at
// import time; this is a display-only cleanup for topic pills/tiles built
// from categories that were imported before that fix. Running
// backend/scripts/cleanCategoryPrefixes.js --apply fixes it at the data
// level instead, permanently, for every reader of it - do that when
// convenient rather than relying on this forever.
export function formatTopicLabel(topic) {
  if (topic === 'all') return 'All'
  return topic.replace(/^browsing:\s*/i, '')
}
