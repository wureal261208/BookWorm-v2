export function getCover(book) {
  return book.formats?.['image/jpeg'] || book.cover || book.coverUrl || 'https://www.gutenberg.org/cache/epub/2701/pg2701.cover.medium.jpg'
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
