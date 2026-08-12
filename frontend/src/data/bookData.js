export const API_URL = 'https://gutendex.com/books'

const buildGutenbergBook = ({ id, title, author, category, subjects = [], downloadCount = 1000 }) => ({
  id,
  title,
  authors: [{ name: author }],
  subjects: subjects.length ? subjects : [category],
  bookshelves: [category],
  languages: ['en'],
  download_count: downloadCount,
  formats: {
    'image/jpeg': `https://www.gutenberg.org/cache/epub/${id}/pg${id}.cover.medium.jpg`,
    'text/html': `https://www.gutenberg.org/files/${id}/${id}-h/${id}-h.htm`,
    'text/plain': `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`,
  },
})

export const fallbackBooks = [
  buildGutenbergBook({ id: 84, title: 'Frankenstein; Or, The Modern Prometheus', author: 'Mary Shelley', category: 'Gothic fiction', subjects: ['Gothic fiction', 'Science fiction'], downloadCount: 106943 }),
  buildGutenbergBook({ id: 1342, title: 'Pride and Prejudice', author: 'Jane Austen', category: 'Romance', subjects: ['Courtship -- Fiction', 'England -- Fiction'], downloadCount: 73721 }),
  buildGutenbergBook({ id: 11, title: "Alice's Adventures in Wonderland", author: 'Lewis Carroll', category: 'Fantasy', subjects: ['Fantasy fiction', 'Children stories'], downloadCount: 42856 }),
  buildGutenbergBook({ id: 1661, title: 'The Adventures of Sherlock Holmes', author: 'Arthur Conan Doyle', category: 'Mystery', subjects: ['Detective and mystery stories'], downloadCount: 38722 }),
  buildGutenbergBook({ id: 76, title: 'Adventures of Huckleberry Finn', author: 'Mark Twain', category: 'Adventure', subjects: ['Missouri -- Fiction', 'Race relations -- Fiction'], downloadCount: 35120 }),
  buildGutenbergBook({ id: 98, title: 'A Tale of Two Cities', author: 'Charles Dickens', category: 'Historical fiction', subjects: ['France -- History -- Revolution, 1789-1799 -- Fiction'], downloadCount: 30145 }),
  buildGutenbergBook({ id: 2701, title: 'Moby-Dick; Or, The Whale', author: 'Herman Melville', category: 'Adventure', subjects: ['Whaling -- Fiction', 'Sea stories'], downloadCount: 28360 }),
  buildGutenbergBook({ id: 16328, title: 'Beowulf', author: 'Unknown', category: 'Epic poetry', subjects: ['Epic poetry', 'Anglo-Saxons -- Poetry'], downloadCount: 24301 }),
  buildGutenbergBook({ id: 219, title: 'The Scarlet Letter', author: 'Nathaniel Hawthorne', category: 'Classic', subjects: ['Adultery -- Fiction', 'Puritans -- Fiction'], downloadCount: 21893 }),
  buildGutenbergBook({ id: 42, title: 'The Strange Case of Dr. Jekyll and Mr. Hyde', author: 'Robert Louis Stevenson', category: 'Gothic fiction', subjects: ['Science fiction', 'Psychological fiction'], downloadCount: 20611 }),
  buildGutenbergBook({ id: 174, title: 'The Picture of Dorian Gray', author: 'Oscar Wilde', category: 'Gothic fiction', subjects: ['London (England) -- Fiction', 'Young men -- Fiction'], downloadCount: 19898 }),
  buildGutenbergBook({ id: 3600, title: 'The Time Machine', author: 'H. G. Wells', category: 'Science fiction', subjects: ['Time travel -- Fiction', 'Science fiction'], downloadCount: 18510 }),
  buildGutenbergBook({ id: 1400, title: 'Great Expectations', author: 'Charles Dickens', category: 'Classic', subjects: ['Bildungsromans', 'England -- Fiction'], downloadCount: 17340 }),
  buildGutenbergBook({ id: 1232, title: 'The Prince and the Pauper', author: 'Mark Twain', category: 'Adventure', subjects: ['London (England) -- Fiction', 'Impostors and imposture -- Fiction'], downloadCount: 16700 }),
  buildGutenbergBook({ id: 1001, title: 'The Complete Works of William Shakespeare', author: 'William Shakespeare', category: 'Drama', subjects: ['Drama', 'Poetry'], downloadCount: 15204 }),
]

export function mergeBookCatalogs(primaryBooks = [], secondaryBooks = fallbackBooks) {
  const combinedBooks = [...secondaryBooks, ...primaryBooks]
  const uniqueBooks = []
  const seenIds = new Set()

  for (const book of combinedBooks) {
    if (!book?.id || seenIds.has(book.id)) continue
    seenIds.add(book.id)
    uniqueBooks.push(book)
  }

  return uniqueBooks
}

export const BOOK_ACCESS_LABELS = {
  read: 'To Read',
  rent: 'To Rent',
}

export const ROLE_LABELS = {
  guest: 'Guest',
  customer: 'Customer',
  employee: 'Employee',
  manager: 'Manager',
  admin: 'Admin',
}

export const ROLE_LEVELS = {
  guest: 0,
  customer: 1,
  employee: 2,
  manager: 3,
  admin: 4,
}

export const ROLE_ORDER = ['guest', 'customer', 'employee', 'manager', 'admin']

export function normalizeRole(role) {
  const value = (role || '').toLowerCase()
  return ROLE_ORDER.includes(value) ? value : 'customer'
}

export function getRoleLevel(role) {
  return ROLE_LEVELS[normalizeRole(role)] ?? 1
}

export function hasAccess(role, minimumRole) {
  return getRoleLevel(role) >= getRoleLevel(minimumRole)
}

// Reference credentials used by backend/scripts/seedTestAccounts.js to
// provision the 4 test roles (Admin/Manager/Employee/Customer) end to end.
export const starterAccounts = [
  { name: 'Customer Demo', email: 'customer@bookworm.test', password: 'customer123', role: 'customer' },
  { name: 'Employee Demo', email: 'employee@bookworm.test', password: 'employee123', role: 'employee' },
  { name: 'Manager Demo', email: 'manager@bookworm.test', password: 'manager123', role: 'manager' },
  { name: 'Admin Demo', email: 'admin@bookworm.test', password: 'admin123', role: 'admin' },
]
