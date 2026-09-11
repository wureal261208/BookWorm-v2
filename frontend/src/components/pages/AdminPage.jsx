import { useEffect, useMemo, useState } from 'react'
import { getAuthor, getCategory, getDescription, getReaderUrl, getInitials } from '../../utils/bookUtils'
import { getTotalPages } from '../../utils/chapterUtils'
import { normalizeRole } from '../../data/bookData'
import { apiFetch } from '../../utils/apiClient'
import { maskEmail } from '../../utils/maskEmail'
import logo from '../../assets/logo.jpg'

const identityFields = [
  { name: 'title', label: 'Title', placeholder: 'Book title' },
  { name: 'author', label: 'Author', placeholder: 'Author name' },
  { name: 'category', label: 'Category (optional)', placeholder: 'Fantasy fiction - leave blank if unknown' },
]

const mediaFields = [
  { name: 'readerUrl', label: 'Reader URL', placeholder: 'https://...', type: 'url' },
]

// Inline SVG instead of a third-party icon URL, so the placeholder always
// renders clearly (no dependency on an external site staying reachable) -
// previously a failed external fetch made this show as an unlabeled/blurry
// "N/A" box instead of an actual readable placeholder.
const NONE_COVER_URL = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="280" viewBox="0 0 200 280">'
  + '<rect width="200" height="280" fill="#e4e4de"/>'
  + '<rect x="1" y="1" width="198" height="278" fill="none" stroke="#c7c7c0" stroke-width="2"/>'
  + '<g fill="#9a9a90">'
  + '<path d="M60 90h80v100H60z" fill="none" stroke="#9a9a90" stroke-width="4"/>'
  + '<path d="M60 90v100M140 90v100" stroke="#9a9a90" stroke-width="2"/>'
  + '</g>'
  + '<text x="100" y="215" font-family="Arial, sans-serif" font-size="15" font-weight="700" fill="#77776e" text-anchor="middle">No cover</text>'
  + '</svg>'
)

// Gutenberg only auto-generates a "medium" cover for most books, and a
// "small" one for some others - neither exists for every book. Cascade
// through both before giving up, instead of a single guess that often 404s.
function handleGutenbergCoverError(event, etextNumber) {
  const img = event.currentTarget
  const step = Number(img.dataset.coverStep || '0')
  const candidates = etextNumber
    ? [
        `https://www.gutenberg.org/cache/epub/${etextNumber}/pg${etextNumber}.cover.medium.jpg`,
        `https://www.gutenberg.org/cache/epub/${etextNumber}/pg${etextNumber}.cover.small.jpg`,
      ]
    : []
  const next = candidates[step]

  if (next) {
    img.dataset.coverStep = String(step + 1)
    img.src = next
  } else {
    img.src = NONE_COVER_URL
  }
}

const languageChoices = [
  { value: 'en', label: 'English', disabled: false },
  { value: 'vi', label: 'Vietnamese - Coming soon', disabled: true },
  { value: 'jp', label: 'Japanese - Coming soon', disabled: true },
]

const adminBookFilters = [
  { id: 'all', label: 'All books' },
  { id: 'draft', label: 'Draft' },
  { id: 'published', label: 'Published' },
]

function AdminPage({
  account,
  addManagedBook,
  adminBook,
  books,
  editManagedBook,
  managedBooks,
  managedBooksError,
  onChangePassword,
  onLogout,
  onProfileUpdate,
  onToast,
  removeManagedBook,
  resetAdminBook,
  setAdminBook,
  setWebsiteTheme,
  staff,
  users,
  websiteTheme,
  onBanUser,
  onUnbanUser,
  onRefreshStaff,
}) {
  const role = normalizeRole(account?.role)
  const isAdmin = role === 'admin'

  const canPushBooks = isAdmin
  const canManageUsers = isAdmin

  const adminNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'bi-speedometer2' },
    canPushBooks && { id: 'book', label: 'Book Management', icon: 'bi-collection' },
    canManageUsers && { id: 'contributions', label: 'User Contributions', icon: 'bi-people' },
    { id: 'settings', label: 'Settings', icon: 'bi-gear' },
  ].filter(Boolean)
  const availableSections = adminNavItems.map((item) => item.id)

  const [activeAdminSection, setActiveAdminSection] = useState(availableSections[0] || 'dashboard')
  const [contributionsTab, setContributionsTab] = useState('submissions')
  const [bookFilter, setBookFilter] = useState('all')
  const [bookPage, setBookPage] = useState(1)
  const [showPreview, setShowPreview] = useState(false)
  const [showBookModal, setShowBookModal] = useState(false)
  const [banTarget, setBanTarget] = useState(null)
  const [banBusyId, setBanBusyId] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteBusyId, setDeleteBusyId] = useState('')

  const currentErrors = getFormErrors(adminBook, managedBooks)
  const currentWarnings = getFormWarnings(adminBook)
  const previewBook = useMemo(() => createPreviewBook(adminBook), [adminBook])

  // Book Management's own catalog fetch - real server-side pagination,
  // completely separate from the `managedBooks` prop (which is just a
  // recent-200 snapshot used for the add/edit form's duplicate check).
  // At ~75k books, slicing one pre-loaded array client-side the way this
  // used to work isn't workable - filtering and paging both have to happen
  // in the query.
  const BOOKS_PER_PAGE = 20
  const [catalogBooks, setCatalogBooks] = useState([])
  const [catalogTotal, setCatalogTotal] = useState(0)
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogQuery, setCatalogQuery] = useState('')
  const [catalogQueryInput, setCatalogQueryInput] = useState('')
  const [catalogRefreshTick, setCatalogRefreshTick] = useState(0)
  const [catalogSuggestions, setCatalogSuggestions] = useState([])
  const [catalogSuggestionsLoading, setCatalogSuggestionsLoading] = useState(false)
  const [catalogSuggestionsOpen, setCatalogSuggestionsOpen] = useState(false)
  const bookPageCount = Math.max(1, Math.ceil(catalogTotal / BOOKS_PER_PAGE))
  const currentBookPage = Math.min(bookPage, bookPageCount)

  useEffect(() => {
    if (activeAdminSection !== 'book') return
    let ignore = false
    setCatalogLoading(true)
    const params = new URLSearchParams({ page: String(currentBookPage), limit: String(BOOKS_PER_PAGE) })
    if (bookFilter !== 'all') params.set('status', bookFilter)
    if (catalogQuery.trim()) params.set('q', catalogQuery.trim())

    apiFetch(`/api/books/mine?${params.toString()}`)
      .then((data) => {
        if (ignore) return
        setCatalogBooks(Array.isArray(data.books) ? data.books : [])
        setCatalogTotal(data.total || 0)
      })
      .catch((error) => {
        if (!ignore) onToast?.({ type: 'error', message: error.message })
      })
      .finally(() => {
        if (!ignore) setCatalogLoading(false)
      })

    return () => {
      ignore = true
    }
  }, [activeAdminSection, bookFilter, catalogQuery, currentBookPage, catalogRefreshTick])

  // Small, separate "does this already exist" suggestion dropdown - a light
  // debounced lookup of just a handful of matches from staff's own catalog.
  // Kept independent of the main list above: that one only re-queries on
  // Enter/submit (runCatalogSearch), since re-running a full paginated
  // fetch on every keystroke over a ~75k-book catalog is what caused the
  // lag/render thrash this replaces.
  useEffect(() => {
    const trimmed = catalogQueryInput.trim()
    if (trimmed.length < 2) {
      setCatalogSuggestions([])
      setCatalogSuggestionsLoading(false)
      return
    }

    let ignore = false
    setCatalogSuggestionsLoading(true)
    const timeout = setTimeout(() => {
      apiFetch(`/api/books/mine?limit=6&q=${encodeURIComponent(trimmed)}`)
        .then((data) => {
          if (!ignore) setCatalogSuggestions(Array.isArray(data.books) ? data.books : [])
        })
        .catch(() => {
          if (!ignore) setCatalogSuggestions([])
        })
        .finally(() => {
          if (!ignore) setCatalogSuggestionsLoading(false)
        })
    }, 300)

    return () => {
      ignore = true
      clearTimeout(timeout)
    }
  }, [catalogQueryInput])

  function submitCatalogSearch(event) {
    event?.preventDefault()
    setCatalogSuggestionsOpen(false)
    setCatalogQuery(catalogQueryInput.trim())
    setBookPage(1)
  }

  function pickCatalogSuggestion(book) {
    setCatalogQueryInput(book.title)
    setCatalogQuery(book.title)
    setBookPage(1)
    setCatalogSuggestionsOpen(false)
  }

  function changeBookFilter(filterId) {
    setBookFilter(filterId)
    setBookPage(1)
  }

  function refreshCatalog() {
    // Bumps a tick that's in the fetch effect's dependency array, so
    // add/edit/delete can force an immediate re-fetch of the current page
    // without duplicating the fetch logic itself.
    setCatalogRefreshTick((tick) => tick + 1)
  }

  const customerAccounts = users.filter((item) => normalizeRole(item.role) === 'customer')

  function updateAdminBook(name, value) {
    setAdminBook({ ...adminBook, [name]: value })
  }

  function updateCoverFile(event) {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAdminBook((current) => ({ ...current, cover: reader.result }))
      }
    }
    reader.readAsDataURL(file)
  }

  async function removeStaffAccount(member) {
    if (!member?.id) {
      setStaffActionError('This account was created before the account-management update - ask an admin to remove it from MongoDB directly.')
      return
    }
    setStaffActionError('')
    setStaffActionBusy(member.email)
    try {
      await apiFetch(`/api/users/${member.id}`, { method: 'DELETE' })
      await onRefreshStaff()
    } catch (error) {
      setStaffActionError(error.message)
    } finally {
      setStaffActionBusy('')
    }
  }

  async function handleBookSubmit(event) {
    if (currentErrors.length) {
      event.preventDefault()
      return
    }

    const saved = await addManagedBook(event)
    if (saved) {
      setShowBookModal(false)
      refreshCatalog()
    }
  }

  function openAddBookModal() {
    resetAdminBook()
    setShowBookModal(true)
  }

  function openEditBookModal(book) {
    editManagedBook(book)
    setShowBookModal(true)
  }

  function closeBookModal() {
    setShowBookModal(false)
    resetAdminBook()
  }

  async function confirmDeleteBook() {
    if (!deleteTarget) return
    setDeleteBusyId(deleteTarget.id)
    await removeManagedBook(deleteTarget.id)
    setDeleteBusyId('')
    setDeleteTarget(null)
    refreshCatalog()
  }

  async function confirmBan(days, reason) {
    if (!banTarget) return
    setBanBusyId(banTarget.id)
    const ok = await onBanUser(banTarget.id, { days, reason })
    setBanBusyId('')
    if (ok) setBanTarget(null)
  }

  async function handleUnban(user) {
    setBanBusyId(user.id)
    await onUnbanUser(user.id)
    setBanBusyId('')
  }

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const displayName = account?.name || 'Admin'

  return (
    <div className="admin-page admin-page-full">
      <button
        aria-label="Open menu"
        className="admin-sidebar-mobile-toggle"
        onClick={() => setSidebarOpen(true)}
        type="button"
      >
        <i className="bi bi-list" />
      </button>

      {sidebarOpen && (
        <div className="admin-sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      )}

      <div className="admin-shell">
        <nav className={`admin-sidebar${sidebarOpen ? ' open' : ''}`} aria-label="Management sections">
          <div className="admin-sidebar-brand">
            <img alt="" src={logo} />
            <span>BookWorm</span>
          </div>

          <div className="admin-sidebar-nav">
            {adminNavItems.map((item) => (
              <button
                className={activeAdminSection === item.id ? 'active' : ''}
                key={item.id}
                onClick={() => {
                  setActiveAdminSection(item.id)
                  setSidebarOpen(false)
                }}
                type="button"
              >
                <i className={`bi ${item.icon}`} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>

          <div className="admin-sidebar-footer">
            {typeof setWebsiteTheme === 'function' && (
              <button
                aria-pressed={websiteTheme === 'dark'}
                className="admin-theme-switch"
                onClick={() => setWebsiteTheme(websiteTheme === 'dark' ? 'light' : 'dark')}
                type="button"
              >
                <i className="bi bi-sun" />
                <span className="admin-theme-switch-track">
                  <span className="admin-theme-switch-thumb" />
                </span>
                <i className="bi bi-moon" />
              </button>
            )}

            <div className="admin-sidebar-account">
              <span className="admin-sidebar-avatar">
                {account?.avatar ? <img src={account.avatar} alt="" /> : getInitials(displayName)}
              </span>
              <span className="admin-sidebar-account-info">
                <strong>{displayName}</strong>
                <small>{normalizeRole(account?.role)}</small>
              </span>
              <button aria-label="Log out" onClick={() => setShowLogoutConfirm(true)} type="button">
                <i className="bi bi-box-arrow-right" />
              </button>
            </div>
          </div>
        </nav>

        <div className="admin-shell-content">

      {activeAdminSection === 'dashboard' ? (
        <AdminDashboard canPushBooks={canPushBooks} />
      ) : null}

      {activeAdminSection === 'book' && canPushBooks ? (
        <>
          <section className="admin-workspace admin-book-toolbar">
            <div className="section-heading">
              <div>
                <p className="mono-eyebrow">Push Book</p>
                <h2>Book catalog</h2>
              </div>
              <span>Every book here is free to open - readers just click Read.</span>
            </div>
            {managedBooksError && !showBookModal && (
              <p className="admin-validation-error"><i className="bi bi-x-circle" /> {managedBooksError}</p>
            )}

            <div className="admin-book-toolbar-row">
              <button className="primary-button admin-add-book-button" onClick={openAddBookModal} type="button">
                <i className="bi bi-plus-lg" />
                Add new book
              </button>
            </div>

            <div className="admin-filter-bar" aria-label="Filter admin books">
              {adminBookFilters.map((filter) => (
                <button className={bookFilter === filter.id ? 'active' : ''} key={filter.id} onClick={() => changeBookFilter(filter.id)} type="button">
                  {filter.label}
                </button>
              ))}
              <form className="admin-catalog-search" onSubmit={submitCatalogSearch}>
                <i className="bi bi-search" />
                <input
                  onBlur={() => setTimeout(() => setCatalogSuggestionsOpen(false), 120)}
                  onChange={(event) => {
                    setCatalogQueryInput(event.target.value)
                    setCatalogSuggestionsOpen(true)
                  }}
                  onFocus={() => setCatalogSuggestionsOpen(true)}
                  placeholder="Search title, author... (Enter to search)"
                  type="text"
                  value={catalogQueryInput}
                />
                {catalogQueryInput && (
                  <button
                    aria-label="Clear search"
                    className="admin-catalog-search-clear"
                    onClick={() => {
                      setCatalogQueryInput('')
                      setCatalogQuery('')
                      setBookPage(1)
                    }}
                    type="button"
                  >
                    <i className="bi bi-x-lg" />
                  </button>
                )}

                {catalogSuggestionsOpen && catalogQueryInput.trim().length >= 2 && (
                  <div className="admin-catalog-suggestions">
                    {catalogSuggestionsLoading ? (
                      <div className="admin-catalog-suggestions-loading">
                        <span className="admin-spin-small" />
                        Searching your catalog...
                      </div>
                    ) : catalogSuggestions.length ? (
                      catalogSuggestions.map((book) => (
                        <button
                          className="admin-catalog-suggestion"
                          key={book.id || book._id}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => pickCatalogSuggestion(book)}
                          type="button"
                        >
                          <span className={`admin-status status-${book.status || 'draft'}`}>{book.status || 'draft'}</span>
                          <span className="admin-catalog-suggestion-title">{book.title}</span>
                          <small>{getAuthor(book)}</small>
                        </button>
                      ))
                    ) : (
                      <p className="admin-catalog-suggestions-empty">Not pushed yet - no match in your catalog.</p>
                    )}
                  </div>
                )}
              </form>
            </div>

            <section className="admin-table admin-book-grid">
              <div className="admin-table-heading">
                <h2>Books</h2>
                <span className="admin-count-pill">{catalogTotal.toLocaleString()}</span>
              </div>
              {catalogLoading ? (
                <AdminLoadingScreen label="Loading books..." />
              ) : catalogBooks.length ? (
                <div className="admin-book-grid-rows">
                  {catalogBooks.map((book, bookIndex) => {
                    // Some rows can come back from Mongo without the `id`
                    // virtual populated (e.g. a document touched outside the
                    // API) - `_id` is the raw Mongo id and is always present,
                    // so fall back to it everywhere an id is needed. The key
                    // itself falls back to the row's position on the page,
                    // never the title - two genuinely different books (or
                    // two accidental duplicates) can share a title, and a
                    // title-based key would collide for both.
                    const bookId = book.id || book._id
                    const missingId = !bookId

                    return (
                      <div className="table-row admin-book-row admin-row-fade-in" key={bookId || `book-row-${bookIndex}`}>
                        <img
                          src={getAdminCover(book)}
                          alt=""
                          onError={(event) => handleGutenbergCoverError(event, book.sourceEtextNumber)}
                        />
                        <span>
                          {book.title}
                          <em className={`admin-status status-${book.status || 'draft'}`}>{book.status || 'draft'}</em>
                        </span>
                        <small>{getAuthor(book)} - {getCategory(book)}</small>
                        <div className="admin-row-actions">
                          {missingId && <strong className="admin-row-warning-broken">no id - refresh page</strong>}
                          <button className="edit-button" disabled={missingId} onClick={() => openEditBookModal({ ...book, id: bookId })} type="button">Edit</button>
                          <button className="danger-button" disabled={missingId} onClick={() => setDeleteTarget({ id: bookId, title: book.title })} type="button">Remove</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p>No books match this filter.</p>
              )}

              {catalogTotal > BOOKS_PER_PAGE && (
                <AdminPagination
                  currentPage={currentBookPage}
                  onPageChange={setBookPage}
                  totalPages={bookPageCount}
                />
              )}
            </section>
          </section>
        </>
      ) : null}

      {activeAdminSection === 'contributions' && canManageUsers ? (
        <>
          <UserSubmissionsPanel canPushBooks={canPushBooks} onEdit={openEditBookModal} onToast={onToast} />
          <UsersDirectoryPanel onToast={onToast} />
        </>
      ) : null}

      {activeAdminSection === 'settings' ? (
        <AdminSettingsPanel
          account={account}
          onChangePassword={onChangePassword}
          onProfileUpdate={onProfileUpdate}
          onToast={onToast}
          setWebsiteTheme={setWebsiteTheme}
          websiteTheme={websiteTheme}
        />
      ) : null}

        </div>
      </div>

      {showLogoutConfirm && (
        <ConfirmLogoutModal
          onCancel={() => setShowLogoutConfirm(false)}
          onConfirm={() => {
            setShowLogoutConfirm(false)
            onLogout()
          }}
        />
      )}

      {showBookModal && (
        <BookFormModal
          adminBook={adminBook}
          currentErrors={currentErrors}
          currentWarnings={currentWarnings}
          managedBooks={managedBooks}
          managedBooksError={managedBooksError}
          onClose={closeBookModal}
          onPreview={() => setShowPreview(true)}
          onSubmit={handleBookSubmit}
          setAdminBook={setAdminBook}
          updateAdminBook={updateAdminBook}
          updateCoverFile={updateCoverFile}
        />
      )}

      {showPreview && <AdminDetailPreview book={previewBook} onClose={() => setShowPreview(false)} />}

      {banTarget && (
        <BanUserModal
          busy={banBusyId === banTarget.id}
          onClose={() => setBanTarget(null)}
          onConfirm={confirmBan}
          user={banTarget}
        />
      )}

      {deleteTarget && (
        <DeleteBookModal
          busy={deleteBusyId === deleteTarget.id}
          book={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={confirmDeleteBook}
        />
      )}
    </div>
  )
}

function getPaginationItems(current, total) {
  // Always show first, last, current, and one neighbour on each side;
  // everything else collapses into a single "..." so the strip stays a
  // fixed, short width no matter how many pages there are.
  const items = []
  const pages = new Set([1, total, current, current - 1, current + 1].filter((page) => page >= 1 && page <= total))
  const sorted = [...pages].sort((a, b) => a - b)

  let previous = 0
  for (const page of sorted) {
    if (previous && page - previous > 1) items.push('ellipsis')
    items.push(page)
    previous = page
  }
  return items
}

function AdminPagination({ currentPage, onPageChange, totalPages }) {
  const items = getPaginationItems(currentPage, totalPages)

  return (
    <nav aria-label="Books pagination" className="admin-pagination">
      <button
        aria-label="Previous page"
        className="admin-pagination-arrow"
        disabled={currentPage <= 1}
        onClick={() => onPageChange(currentPage - 1)}
        type="button"
      >
        <i className="bi bi-chevron-left" />
      </button>

      {items.map((item, index) =>
        item === 'ellipsis' ? (
          <span className="admin-pagination-ellipsis" key={`ellipsis-${index}`}>...</span>
        ) : (
          <button
            aria-current={item === currentPage ? 'page' : undefined}
            className={item === currentPage ? 'active' : ''}
            key={item}
            onClick={() => onPageChange(item)}
            type="button"
          >
            {item}
          </button>
        ),
      )}

      <button
        aria-label="Next page"
        className="admin-pagination-arrow"
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(currentPage + 1)}
        type="button"
      >
        <i className="bi bi-chevron-right" />
      </button>
    </nav>
  )
}

function AdminLoadingScreen({ fill, label }) {
  return (
    <section className={`admin-workspace admin-loading-screen${fill ? ' admin-loading-screen-fill' : ''}`}>
      <div className="admin-loading-content">
        <span className="admin-loading-logo">
          <img alt="" src={logo} />
        </span>
        <div className="admin-loading-bar">
          <span />
        </div>
        <p>{label}</p>
      </div>
    </section>
  )
}

function AdminDashboard({ canPushBooks }) {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let ignore = false
    setLoading(true)
    apiFetch('/api/books/stats')
      .then((data) => {
        if (!ignore) setStats(data)
      })
      .catch((err) => {
        if (!ignore) setError(err.message)
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [])

  if (loading) {
    return <AdminLoadingScreen fill label="Loading your dashboard..." />
  }

  if (error || !stats) {
    return (
      <section className="admin-workspace admin-dashboard">
        <p className="admin-validation-error"><i className="bi bi-x-circle" /> {error || 'Could not load stats.'}</p>
      </section>
    )
  }

  const byStatus = stats.byStatus || {}
  const statusEntries = ['published', 'draft', 'hidden'].map((key) => ({ key, count: byStatus[key] || 0 }))
  const maxStatusCount = Math.max(1, ...statusEntries.map((entry) => entry.count))
  const maxViews = Math.max(1, ...(stats.mostViewed || []).map((book) => book.views))
  const maxComments = Math.max(1, ...(stats.mostCommented || []).map((book) => book.commentCount))
  const mostActiveReaders = stats.mostActiveReaders || []
  const maxReaderCount = Math.max(1, ...mostActiveReaders.map((reader) => reader.booksReadCount))

  return (
    <section className="admin-workspace admin-dashboard">
      <div className="section-heading">
        <div>
          <p className="mono-eyebrow">Overview</p>
          <h2>Dashboard</h2>
        </div>
        <span>Real numbers straight from the database - refresh the page to update.</span>
      </div>

      <div className="admin-dashboard-summary">
        <div className="admin-summary-card admin-row-fade-in">
          <i className="bi bi-collection" />
          <strong>{stats.totalBooks}</strong>
          <span>Total books</span>
        </div>
        {statusEntries.map((entry) => (
          <div className="admin-summary-card admin-row-fade-in" key={entry.key}>
            <i className={`bi ${entry.key === 'published' ? 'bi-check-circle' : entry.key === 'draft' ? 'bi-pencil-square' : 'bi-eye-slash'}`} />
            <strong>{entry.count}</strong>
            <span>{entry.key.charAt(0).toUpperCase() + entry.key.slice(1)}</span>
          </div>
        ))}
      </div>

      <div className="admin-dashboard-grid">
        <div className="admin-chart-card">
          <h3><i className="bi bi-bar-chart" /> Books by status</h3>
          {statusEntries.map((entry) => (
            <div className="admin-bar-row" key={entry.key}>
              <span className="admin-bar-label">{entry.key}</span>
              <div className="admin-bar-track">
                <div className="admin-bar-fill" style={{ width: `${(entry.count / maxStatusCount) * 100}%` }} />
              </div>
              <span className="admin-bar-value">{entry.count}</span>
            </div>
          ))}
        </div>

        <div className="admin-chart-card">
          <h3><i className="bi bi-trophy" /> Top readers</h3>
          {mostActiveReaders.length ? (
            mostActiveReaders.map((reader) => (
              <div className="admin-bar-row" key={reader.id}>
                <span className="admin-bar-label admin-bar-label-title" title={reader.name}>{reader.name}</span>
                <div className="admin-bar-track">
                  <div className="admin-bar-fill admin-bar-fill-alt" style={{ width: `${(reader.booksReadCount / maxReaderCount) * 100}%` }} />
                </div>
                <span className="admin-bar-value">{reader.booksReadCount}</span>
              </div>
            ))
          ) : (
            <p className="settings-copy">No reading activity recorded yet.</p>
          )}
        </div>

        <div className="admin-chart-card">
          <h3><i className="bi bi-eye" /> Most viewed</h3>
          {stats.mostViewed?.length ? (
            stats.mostViewed.map((book) => (
              <div className="admin-bar-row" key={book.id}>
                <span className="admin-bar-label admin-bar-label-title" title={book.title}>{book.title}</span>
                <div className="admin-bar-track">
                  <div className="admin-bar-fill" style={{ width: `${(book.views / maxViews) * 100}%` }} />
                </div>
                <span className="admin-bar-value">{book.views}</span>
              </div>
            ))
          ) : (
            <p className="settings-copy">No views recorded yet.</p>
          )}
        </div>

        <div className="admin-chart-card">
          <h3><i className="bi bi-chat-dots" /> Most commented</h3>
          {stats.mostCommented?.length ? (
            stats.mostCommented.map((book) => (
              <div className="admin-bar-row" key={book.bookId}>
                <span className="admin-bar-label admin-bar-label-title" title={book.title}>{book.title}</span>
                <div className="admin-bar-track">
                  <div className="admin-bar-fill admin-bar-fill-alt" style={{ width: `${(book.commentCount / maxComments) * 100}%` }} />
                </div>
                <span className="admin-bar-value">{book.commentCount}</span>
              </div>
            ))
          ) : (
            <p className="settings-copy">No comments recorded yet.</p>
          )}
        </div>
      </div>
    </section>
  )
}

function UserSubmissionsPanel({ onEdit, onToast }) {
  const [submissions, setSubmissions] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const LIMIT = 10

  useEffect(() => {
    let ignore = false
    setLoading(true)
    apiFetch(`/api/books/mine?contributorRole=customer&page=${page}&limit=${LIMIT}`)
      .then((data) => {
        if (!ignore) {
          setSubmissions(Array.isArray(data.books) ? data.books : [])
          setTotal(data.total || 0)
        }
      })
      .catch((error) => {
        if (!ignore) onToast?.({ type: 'error', message: error.message })
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [page])

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  return (
    <section className="admin-workspace">
      <div className="section-heading">
        <div>
          <p className="mono-eyebrow">User Contributions</p>
          <h2>Book submissions</h2>
        </div>
        <span>Books customers pushed themselves - they land as a draft until a staff member reviews and publishes them.</span>
      </div>

      <section className="admin-table">
        {loading ? (
          <AdminLoadingScreen fill label="Loading submissions..." />
        ) : submissions.length ? (
          submissions.map((book) => (
            <div className="table-row admin-book-row admin-row-fade-in" key={book.id || book._id}>
              <img alt="" src={getAdminCover(book)} onError={(event) => handleGutenbergCoverError(event, book.sourceEtextNumber)} />
              <span>
                {book.title}
                <em className={`admin-status status-${book.status || 'draft'}`}>{book.status || 'draft'}</em>
              </span>
              <small>
                {getAuthor(book)}
                <span className="admin-contributor-tag" title={book.createdBy?.email ? maskEmail(book.createdBy.email) : ''}>
                  <i className="bi bi-person" /> Customer
                </span>
              </small>
              <div className="admin-row-actions">
                <button className="edit-button" onClick={() => onEdit(book)} type="button">Review</button>
              </div>
            </div>
          ))
        ) : (
          <p>No customer submissions yet.</p>
        )}

        {total > LIMIT && (
          <AdminPagination currentPage={page} onPageChange={setPage} totalPages={totalPages} />
        )}
      </section>
    </section>
  )
}

function UsersDirectoryPanel({ onToast }) {
  const [users, setUsers] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const LIMIT = 10

  useEffect(() => {
    let ignore = false
    setLoading(true)
    apiFetch(`/api/users?page=${page}&limit=${LIMIT}`)
      .then((data) => {
        if (!ignore) {
          setUsers(Array.isArray(data.users) ? data.users : [])
          setTotal(data.total || 0)
        }
      })
      .catch((error) => {
        if (!ignore) onToast?.({ type: 'error', message: error.message })
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [page])

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  return (
    <section className="admin-workspace">
      <div className="section-heading">
        <div>
          <p className="mono-eyebrow">User Contributions</p>
          <h2>Users</h2>
        </div>
        <span>Every account on the site - display name and masked email only, for reference before any moderation action.</span>
      </div>

      <section className="admin-table">
        {loading ? (
          <AdminLoadingScreen fill label="Loading users..." />
        ) : users.length ? (
          <>
            <div className="admin-users-directory">
              {users.map((user) => (
                <div className="admin-users-directory-row admin-row-fade-in" key={user.id}>
                  <span className="admin-sidebar-avatar admin-users-directory-avatar">{getInitials(user.name)}</span>
                  <span className="admin-users-directory-info">
                    <strong>{user.name}</strong>
                    <small>{user.email}</small>
                  </span>
                  <span className="admin-contributor-tag">
                    <i className="bi bi-person" /> {user.role}
                  </span>
                  {user.isRestricted && (
                    <span className="admin-status status-hidden">Restricted</span>
                  )}
                </div>
              ))}
            </div>

            {total > LIMIT && (
              <AdminPagination currentPage={page} onPageChange={setPage} totalPages={totalPages} />
            )}
          </>
        ) : (
          <p>No users found.</p>
        )}
      </section>
    </section>
  )
}

function AdminSettingsPanel({ account, onChangePassword, onProfileUpdate, onToast, setWebsiteTheme, websiteTheme }) {
  const [avatarPreview, setAvatarPreview] = useState(account?.avatar || '')
  const [displayName, setDisplayName] = useState(account?.name || 'Admin')
  const [savingProfile, setSavingProfile] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)

  const safeName = displayName || account?.name || 'Admin'
  const safeAvatar = avatarPreview || account?.avatar || ''
  const safeEmail = account?.email || ''

  function handleAvatarChange(event) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setAvatarPreview(String(reader.result))
    reader.readAsDataURL(file)
  }

  async function saveProfile(event) {
    event.preventDefault()
    setSavingProfile(true)
    try {
      await onProfileUpdate({ avatar: safeAvatar, displayName: displayName.trim() })
      onToast?.({ type: 'success', message: 'Profile updated successfully.' })
    } catch {
      onToast?.({ type: 'error', message: 'Could not update your profile. Please try again.' })
    } finally {
      setSavingProfile(false)
    }
  }

  return (
    <section className="admin-workspace admin-settings-panel">
      <div className="section-heading">
        <div>
          <p className="mono-eyebrow">Admin</p>
          <h2>Settings</h2>
        </div>
        <span>Your profile, password, and how the site looks to you.</span>
      </div>

      <div className="admin-settings-grid">
        <form className="account-settings-card" onSubmit={saveProfile}>
          <h3><i className="bi bi-person-gear" /> Identity</h3>
          <div className="avatar-editor">
            <span>{safeAvatar ? <img src={safeAvatar} alt="" /> : getInitials(safeName)}</span>
            <label className="file-picker">
              <i className="bi bi-image" />
              Change avatar
              <input accept="image/jpeg,image/png,image/webp,image/gif" type="file" onChange={handleAvatarChange} />
            </label>
            <small>JPG, PNG, WEBP, or GIF. Max 2MB.</small>
          </div>
          <label>
            Display name
            <input maxLength={32} value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </label>
          <button className="primary-button" disabled={savingProfile} type="submit">
            <i className="bi bi-check2-circle" />
            {savingProfile ? 'Saving...' : 'Save profile'}
          </button>
        </form>

        <div className="account-settings-card">
          <h3><i className="bi bi-shield-lock" /> Security</h3>
          <p className="settings-copy">Change your password. We'll email {safeEmail ? maskEmail(safeEmail) : 'you'} to confirm.</p>
          <button className="primary-button" onClick={() => setShowPasswordModal(true)} type="button">
            <i className="bi bi-key" />
            Change password
          </button>
        </div>

        <div className="account-settings-card">
          <h3><i className="bi bi-palette" /> Appearance</h3>
          <div className="theme-options" role="group" aria-label="Website theme">
            {[['light', 'Light'], ['dark', 'Dark']].map(([value, label]) => (
              <button
                className={websiteTheme === value ? 'active' : ''}
                key={value}
                onClick={() => setWebsiteTheme(value)}
                type="button"
              >
                <span className={`theme-swatch theme-swatch-${value}`} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {showPasswordModal && (
        <ChangePasswordModal
          onClose={() => setShowPasswordModal(false)}
          onSubmit={onChangePassword}
          onToast={onToast}
        />
      )}
    </section>
  )
}

function ChangePasswordModal({ onClose, onSubmit, onToast }) {
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    if (!oldPassword.trim()) return setError('Enter your current password.')
    if (newPassword.length < 8) return setError('New password must be at least 8 characters.')
    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return setError('New password must include at least one letter and one number.')
    }
    if (newPassword !== confirmPassword) return setError("New password and confirmation don't match.")
    if (newPassword === oldPassword) return setError('New password must be different from your current password.')

    setBusy(true)
    try {
      await onSubmit({ oldPassword, newPassword })
      onToast?.({ type: 'success', message: 'Password changed successfully.' })
      onClose()
    } catch (submitError) {
      const code = submitError?.code || ''
      let message = 'Could not change your password. Please try again.'
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials') {
        message = 'Current password is incorrect.'
      } else if (code === 'auth/too-many-requests') {
        message = 'Too many attempts. Please wait a bit and try again.'
      } else if (code === 'auth/weak-password') {
        message = 'New password is too weak - use at least 8 characters.'
      }
      setError(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="reader-modal-backdrop admin-ban-backdrop" role="dialog" aria-modal="true" aria-labelledby="change-password-title">
      <form className="admin-ban-modal" onSubmit={handleSubmit}>
        <button aria-label="Close" className="admin-book-modal-close" onClick={onClose} type="button">
          <i className="bi bi-x-lg" />
        </button>
        <p className="mono-eyebrow">Security</p>
        <h2 id="change-password-title">Change password</h2>

        <label>
          Current password
          <input autoComplete="current-password" onChange={(event) => setOldPassword(event.target.value)} type="password" value={oldPassword} />
        </label>
        <label>
          New password
          <input autoComplete="new-password" onChange={(event) => setNewPassword(event.target.value)} type="password" value={newPassword} />
        </label>
        <label>
          Confirm new password
          <input autoComplete="new-password" onChange={(event) => setConfirmPassword(event.target.value)} type="password" value={confirmPassword} />
        </label>

        {error && <p className="settings-error"><i className="bi bi-exclamation-circle" /> {error}</p>}

        <div className="admin-form-actions">
          <button className="ghost-button" disabled={busy} onClick={onClose} type="button">Cancel</button>
          <button className="primary-button" disabled={busy || !oldPassword || !newPassword || !confirmPassword} type="submit">
            {busy ? 'Changing...' : 'Change password'}
          </button>
        </div>
      </form>
    </div>
  )
}

function ConfirmLogoutModal({ onCancel, onConfirm }) {
  return (
    <div
      aria-labelledby="confirm-logout-title"
      aria-modal="true"
      className="reader-modal-backdrop admin-ban-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
      role="dialog"
    >
      <div className="admin-ban-modal">
        <button aria-label="Close" className="admin-book-modal-close" onClick={onCancel} type="button">
          <i className="bi bi-x-lg" />
        </button>
        <p className="mono-eyebrow">Log out</p>
        <h2 id="confirm-logout-title">Leave the dashboard?</h2>
        <p className="form-note">You'll need to log back in to manage books and users again.</p>

        <div className="admin-form-actions">
          <button className="ghost-button" onClick={onCancel} type="button">Stay signed in</button>
          <button className="danger-button" onClick={onConfirm} type="button">
            <i className="bi bi-box-arrow-right" />
            Log out
          </button>
        </div>
      </div>
    </div>
  )
}

function DeleteBookModal({ busy, book, onClose, onConfirm }) {
  return (
    <div
      aria-labelledby="admin-delete-book-title"
      aria-modal="true"
      className="reader-modal-backdrop admin-ban-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      role="dialog"
    >
      <div className="admin-ban-modal">
        <button aria-label="Close" className="admin-book-modal-close" onClick={onClose} type="button">
          <i className="bi bi-x-lg" />
        </button>
        <p className="mono-eyebrow">Delete this book?</p>
        <h2 id="admin-delete-book-title">{book.title}</h2>
        <p className="form-note">This will permanently remove the book from the catalog. This action cannot be undone.</p>

        <div className="admin-form-actions">
          <button className="ghost-button" onClick={onClose} type="button">Cancel</button>
          <button className="danger-button" disabled={busy} onClick={onConfirm} type="button">
            {busy ? 'Removing...' : 'Confirm delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

function BookFormModal({
  adminBook,
  currentErrors,
  currentWarnings,
  managedBooks = [],
  managedBooksError,
  onClose,
  onPreview,
  onSubmit,
  setAdminBook,
  updateAdminBook,
  updateCoverFile,
}) {
  const isEditing = Boolean(adminBook.id)
  const [catalogQuery, setCatalogQuery] = useState('')
  const [catalogResults, setCatalogResults] = useState([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState('')
  const [publishBlockers, setPublishBlockers] = useState([])
  const [formBlockers, setFormBlockers] = useState([])
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (currentErrors.length) {
      setFormBlockers(currentErrors)
      return
    }

    if (adminBook.status === 'published') {
      const missing = getPublishRequirements(adminBook)
      if (missing.length) {
        setPublishBlockers(missing)
        return
      }
    }

    setFormBlockers([])
    setPublishBlockers([])
    setSubmitting(true)
    try {
      await onSubmit(event)
    } finally {
      setSubmitting(false)
    }
  }

  // Live-search the synced Gutenberg catalog as the admin types, so
  // suggestions are the first thing they see instead of a bare form.
  useEffect(() => {
    const query = catalogQuery.trim()
    if (query.length < 2) {
      setCatalogLoading(false)
      setCatalogResults([])
      setCatalogError('')
      return
    }

    setCatalogLoading(true)
    const timeout = setTimeout(() => {
      runCatalogSearch(query)
    }, 350)

    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogQuery])

  async function runCatalogSearch(query) {
    setCatalogError('')
    try {
      const data = await apiFetch(`/api/book-metadata?q=${encodeURIComponent(query)}&limit=6`)
      setCatalogResults(data.results || [])
    } catch (error) {
      setCatalogError(error.message)
      setCatalogResults([])
    } finally {
      setCatalogLoading(false)
    }
  }

  function handleSearchSubmit(event) {
    event.preventDefault()
    const query = catalogQuery.trim()
    if (query.length < 2) return
    setCatalogLoading(true)
    runCatalogSearch(query)
  }

  // `entry` is a raw book_metadata document (see backend/models/BookMetadata.js).
  // Note the Gutenberg catalog only carries bibliographic fields - it has no
  // plot description, so `description` is intentionally left for staff to write.
  function importCatalogBook(entry) {
    if (isEntryAlreadyAdded(entry)) return
    const guessedCover = entry.etextNumber
      ? `https://www.gutenberg.org/cache/epub/${entry.etextNumber}/pg${entry.etextNumber}.cover.medium.jpg`
      : ''
    // Gutenberg's "bookshelves" is a semicolon list like "Politics; American
    // Revolutionary War; ..." - Category is a required field to push
    // (see getFormErrors), but catalog entries don't map to it directly, so
    // without this the Push button silently stayed disabled after import.
    const guessedCategory = entry.bookshelves?.split(';')[0]?.trim() || ''

    setAdminBook({
      ...adminBook,
      title: entry.title || adminBook.title,
      author: entry.authors || adminBook.author,
      category: adminBook.category || guessedCategory,
      subjects: entry.subjects || adminBook.subjects,
      cover: adminBook.cover || guessedCover,
      readerUrl: entry.readOnlineUrl || entry.plainTextUtf8Url || adminBook.readerUrl,
      language: (entry.bookLanguage || 'en').toLowerCase(),
      sourceEtextNumber: entry.etextNumber ?? null,
    })
    setCatalogQuery('')
    setCatalogResults([])
    setCatalogError('')
  }

  function isEntryAlreadyAdded(entry) {
    const normalizedEntryTitle = (entry.title || '').trim().toLowerCase()
    return managedBooks.some((book) => {
      if (entry.etextNumber && book.sourceEtextNumber === entry.etextNumber) return true
      return normalizedEntryTitle && book.title?.trim().toLowerCase() === normalizedEntryTitle
    })
  }

  return (
    <div className="reader-modal-backdrop admin-book-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="admin-book-modal-title">
      <div className="admin-book-modal">
        <header className="admin-book-modal-header">
          <div>
            <p className="mono-eyebrow">{isEditing ? 'Edit book' : 'Push Book'}</p>
            <h2 id="admin-book-modal-title">{isEditing ? (adminBook.title || 'Edit book') : 'Add a new book'}</h2>
          </div>
          <button aria-label="Close" className="admin-book-modal-close" onClick={onClose} type="button">
            <i className="bi bi-x-lg" />
          </button>
        </header>

        <div className="admin-book-modal-body">
          {managedBooksError && (
            <p className="admin-validation-error admin-book-modal-error"><i className="bi bi-x-circle" /> {managedBooksError}</p>
          )}

          {isEditing ? (
            <div className="admin-search-hero admin-editing-notice">
              <div className="admin-search-hero-label">
                <i className="bi bi-pencil-square" />
                <div>
                  <strong>Editing "{adminBook.title}"</strong>
                  <span>The Gutenberg search is hidden while editing, so you can't accidentally overwrite this book's title, cover, or content with a different one. To link a different catalog entry, cancel and push it as a new book instead.</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="admin-search-hero">
              <div className="admin-search-hero-label">
                <i className="bi bi-stars" />
                <div>
                  <strong>Find it in the Gutenberg catalog</strong>
                  <span>75k+ synced books - search and autofill the form in one click.</span>
                </div>
              </div>
              <form className="admin-search-box" onSubmit={handleSearchSubmit}>
                <i className="bi bi-search" />
                <input
                  autoFocus
                  onChange={(event) => setCatalogQuery(event.target.value)}
                  placeholder="Search by title, e.g. Pride and Prejudice"
                  value={catalogQuery}
                />
                {catalogLoading && <span className="admin-search-spinner" aria-hidden="true" />}
              </form>
              {catalogError && <p className="settings-error">{catalogError}</p>}
              {adminBook.sourceEtextNumber && (
                <p className="form-note">
                  <i className="bi bi-link-45deg" /> Filled from Gutenberg #{adminBook.sourceEtextNumber}. Cover is a guess - check it loaded before pushing.
                </p>
              )}
              {catalogResults.length > 0 && (
                <ul className="admin-search-results">
                  {catalogResults.map((entry) => {
                    const alreadyAdded = isEntryAlreadyAdded(entry)
                    return (
                      <li key={entry.etextNumber}>
                        <button
                          className={`admin-search-result${alreadyAdded ? ' admin-search-result-disabled' : ''}`}
                          disabled={alreadyAdded}
                          onClick={() => importCatalogBook(entry)}
                          type="button"
                        >
                          <img
                            alt=""
                            onError={(event) => handleGutenbergCoverError(event, entry.etextNumber)}
                            src={entry.etextNumber ? `https://www.gutenberg.org/cache/epub/${entry.etextNumber}/pg${entry.etextNumber}.cover.medium.jpg` : NONE_COVER_URL}
                          />
                          <span>
                            <strong>{entry.title || 'Untitled'}</strong>
                            <small>{entry.authors || 'Unknown author'} - Gutenberg #{entry.etextNumber}</small>
                            {alreadyAdded && <em className="admin-search-result-tag">This book already exists</em>}
                          </span>
                          {alreadyAdded ? <i className="bi bi-check-circle" /> : <i className="bi bi-arrow-right-circle" />}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
              {!catalogLoading && catalogQuery.trim().length >= 2 && catalogResults.length === 0 && !catalogError && (
                <p className="form-note">No matches yet - keep typing, or fill the fields below by hand.</p>
              )}
            </div>
          )}

          <div className="admin-validation-panel" aria-live="polite">
            <strong>{currentWarnings.length ? 'Ready with notes' : 'Ready checklist'}</strong>
            {currentWarnings.length ? (
              currentWarnings.map((warning) => (
                <span className="admin-validation-warning" key={warning.id}>
                  <i className="bi bi-exclamation-circle" />
                  {warning.message}
                </span>
              ))
            ) : (
              <span>
                <i className="bi bi-check-circle" />
                This book has the key Detail and Reader fields.
              </span>
            )}
          </div>

          <form className="admin-form admin-book-form" id="admin-book-form" onSubmit={handleSubmit}>
            <fieldset>
              <legend>Detail information</legend>
              {identityFields.map((field) => (
                <label key={field.name}>
                  {field.label}
                  <input
                    type={field.type || 'text'}
                    value={adminBook[field.name]}
                    onChange={(event) => updateAdminBook(field.name, event.target.value)}
                    placeholder={field.placeholder}
                  />
                </label>
              ))}
              <label>
                Status
                <select value={adminBook.status} onChange={(event) => updateAdminBook('status', event.target.value)}>
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="hidden">Hidden</option>
                </select>
              </label>
              <div className="admin-choice-field">
                <span>Language</span>
                <div className="admin-choice-grid">
                  {languageChoices.map((choice) => (
                    <button
                      className={adminBook.language === choice.value ? 'active' : ''}
                      disabled={choice.disabled}
                      key={choice.value}
                      onClick={() => updateAdminBook('language', choice.value)}
                      type="button"
                    >
                      {choice.label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="wide-field">
                Description
                <textarea
                  value={adminBook.description}
                  onChange={(event) => updateAdminBook('description', event.target.value)}
                  placeholder="Short book description shown on the detail page."
                />
              </label>
              <label className="wide-field">
                Subjects
                <input
                  value={adminBook.subjects}
                  onChange={(event) => updateAdminBook('subjects', event.target.value)}
                  placeholder="Adventure, Mystery, Classic"
                />
              </label>
            </fieldset>

            <fieldset>
              <legend>Reader setup</legend>
              <div className="admin-cover-picker wide-field">
                <img
                  src={getAdminCover(adminBook)}
                  alt=""
                  onError={(event) => handleGutenbergCoverError(event, adminBook.sourceEtextNumber)}
                />
                <div>
                  <label>
                    Cover URL
                    <input
                      value={adminBook.cover}
                      onChange={(event) => updateAdminBook('cover', event.target.value)}
                      placeholder="https://..."
                    />
                  </label>
                  <label className="file-picker admin-cover-upload">
                    <i className="bi bi-image" />
                    Upload cover image
                    <input accept="image/*" onChange={updateCoverFile} type="file" />
                  </label>
                </div>
              </div>
              {mediaFields.map((field) => (
                <label key={field.name}>
                  {field.label}
                  <input
                    type={field.type || 'text'}
                    value={adminBook[field.name]}
                    onChange={(event) => updateAdminBook(field.name, event.target.value)}
                    placeholder={field.placeholder}
                  />
                </label>
              ))}
            </fieldset>
          </form>
        </div>

        <footer className="admin-book-modal-footer">
          <button className="ghost-button" disabled={submitting} onClick={onPreview} type="button">
            <i className="bi bi-eye" />
            Preview as Detail
          </button>
          <button className="ghost-button" disabled={submitting} onClick={onClose} type="button">
            {isEditing ? 'Cancel edit' : 'Cancel'}
          </button>
          <button className="primary-button" disabled={submitting} form="admin-book-form" type="submit">
            {submitting ? (
              <>
                <i className="bi bi-arrow-repeat admin-spin" />
                {isEditing ? 'Updating...' : 'Pushing...'}
              </>
            ) : (
              <>
                <i className="bi bi-cloud-upload" />
                {isEditing ? 'Update book' : 'Push book'}
              </>
            )}
          </button>
        </footer>

        {submitting && (
          <div aria-hidden="true" className="admin-book-modal-progress">
            <span />
          </div>
        )}

        {formBlockers.length > 0 && (
          <div className="admin-publish-alert-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="admin-form-alert-title">
            <div className="admin-publish-alert">
              <i className="bi bi-exclamation-triangle" />
              <h3 id="admin-form-alert-title">A few things need fixing</h3>
              <p>This book can't be saved yet. Please fix:</p>
              <ul>
                {formBlockers.map((item) => (
                  <li key={item.id}>{item.message}</li>
                ))}
              </ul>
              <div className="admin-form-actions">
                <button className="primary-button" onClick={() => setFormBlockers([])} type="button">
                  Go back and fill it in
                </button>
              </div>
            </div>
          </div>
        )}

        {publishBlockers.length > 0 && (
          <div className="admin-publish-alert-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="admin-publish-alert-title">
            <div className="admin-publish-alert">
              <i className="bi bi-exclamation-triangle" />
              <h3 id="admin-publish-alert-title">You're missing a few things</h3>
              <p>This book can't go live as Published yet. You're missing:</p>
              <ul>
                {publishBlockers.map((item) => (
                  <li key={item.id}>{item.message}</li>
                ))}
              </ul>
              <div className="admin-form-actions">
                <button
                  className="ghost-button"
                  onClick={() => {
                    updateAdminBook('status', 'draft')
                    setPublishBlockers([])
                  }}
                  type="button"
                >
                  Switch to Draft instead
                </button>
                <button className="primary-button" onClick={() => setPublishBlockers([])} type="button">
                  Go back and fill it in
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ExistingAccountPicker({ onPick }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState('')

  function handleChange(value) {
    setQuery(value)
    setPicked('')
    setResults([])
  }

  async function search(event) {
    event.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    setError('')
    try {
      const data = await apiFetch(`/api/users/search?q=${encodeURIComponent(query.trim())}`)
      setResults(data.users || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function pick(user) {
    onPick(user)
    setPicked(user.email)
    setResults([])
    setQuery('')
  }

  return (
    <div className="admin-import-panel">
      <p className="form-note">
        Search for someone who already has an account instead of typing a brand new person.
      </p>
      <form className="admin-form compact-form" onSubmit={search}>
        <label className="wide-field">
          Search by name or email
          <input onChange={(event) => handleChange(event.target.value)} placeholder="jane@bookworm.com" value={query} />
        </label>
        <button className="ghost-button" disabled={loading} type="submit">
          <i className="bi bi-search" />
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>
      {error && <p className="settings-error">{error}</p>}
      {picked && <p className="form-note">Filled the form below with {picked} - review and submit to grant access.</p>}
      {results.length > 0 && (
        <div className="book-thumb-list">
          {results.map((user) => (
            <button className="book-pick-row" key={user.email} onClick={() => pick(user)} type="button">
              <div>
                <strong>{user.name}</strong>
                <span>{user.email} - currently {user.role}</span>
              </div>
              <i className="bi bi-arrow-return-left" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function BanUserModal({ busy, onClose, onConfirm, user }) {
  const [days, setDays] = useState('7')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    if (!reason.trim()) {
      setError('A reason is required.')
      return
    }
    const numDays = Number(days)
    if (!Number.isFinite(numDays) || numDays < 0) {
      setError('Days must be 0 (permanent) or a positive number.')
      return
    }
    setError('')
    onConfirm(numDays, reason.trim())
  }

  return (
    <div
      aria-labelledby="admin-ban-title"
      aria-modal="true"
      className="reader-modal-backdrop admin-ban-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      role="dialog"
    >
      <form className="admin-ban-modal" onSubmit={handleSubmit}>
        <button aria-label="Close" className="admin-book-modal-close" onClick={onClose} type="button">
          <i className="bi bi-x-lg" />
        </button>
        <p className="mono-eyebrow">Ban customer</p>
        <h2 id="admin-ban-title">{user.name}</h2>
        <p className="form-note">{user.displayId ? `${user.displayId} - ` : ''}{user.email}</p>

        <label>
          Ban length
          <select onChange={(event) => setDays(event.target.value)} value={days}>
            <option value="1">1 day</option>
            <option value="3">3 days</option>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="0">Permanent (until manually unbanned)</option>
          </select>
        </label>
        <label className="wide-field">
          Reason
          <textarea
            autoFocus
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why is this account being banned?"
            value={reason}
          />
        </label>
        {error && (
          <p className="admin-validation-error">
            <i className="bi bi-x-circle" />
            {error}
          </p>
        )}

        <div className="admin-form-actions">
          <button className="ghost-button" onClick={onClose} type="button">Cancel</button>
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? 'Banning...' : 'Confirm ban'}
          </button>
        </div>
      </form>
    </div>
  )
}

function AdminDetailPreview({ book, onClose }) {
  const totalPages = getTotalPages(book)

  return (
    <div
      aria-labelledby="admin-preview-title"
      aria-modal="true"
      className="reader-modal-backdrop admin-preview-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      role="dialog"
    >
      <div className="admin-preview-modal">
        <button aria-label="Close preview" className="admin-preview-close" onClick={onClose} type="button">
          <i className="bi bi-x-lg" />
        </button>
        <img
          src={getAdminCover(book)}
          alt=""
          onError={(event) => {
            event.currentTarget.src = NONE_COVER_URL
          }}
        />
        <div>
          <p className="mono-eyebrow">{getCategory(book)}</p>
          <h2 id="admin-preview-title">{book.title || 'Untitled book'}</h2>
          <p>{getAuthor(book)}</p>
          <p>{getDescription(book)}</p>
          <div className="admin-preview-meta">
            <span>{totalPages} pages</span>
            <span>{book.languages?.[0]?.toUpperCase() || 'EN'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function createPreviewBook(adminBook) {
  const subjects = adminBook.subjects
    .split(',')
    .map((subject) => subject.trim())
    .filter(Boolean)

  return {
    ...adminBook,
    id: adminBook.id || 'admin-preview',
    title: adminBook.title.trim() || 'Untitled book',
    author: adminBook.author.trim() || 'BookWorm editor',
    category: adminBook.category.trim() || 'Admin pick',
    authors: [{ name: adminBook.author.trim() || 'BookWorm editor' }],
    bookshelves: [adminBook.category.trim() || 'Admin pick'],
    subjects,
    languages: ['en'],
    pageCount: 120,
    formats: {
      ...(adminBook.cover.trim() ? { 'image/jpeg': adminBook.cover.trim() } : {}),
      ...(adminBook.readerUrl.trim() ? { 'text/html': adminBook.readerUrl.trim() } : {}),
    },
  }
}

function getAdminCover(book) {
  return book.coverUrl || book.formats?.['image/jpeg'] || book.cover || NONE_COVER_URL
}

function getFormWarnings(book) {
  const errors = new Set(getFormErrors(book).map((error) => error.id))

  return [
    !book.subjects?.split(',').some((subject) => hasText(subject)) && {
      id: 'subjects',
      message: 'Add subjects to make Discover filtering better.',
    },
  ].filter(Boolean).filter((warning) => !errors.has(warning.id))
}

// Base rules that block saving in ANY status, including Draft: the record
// must at least be identifiable and not contain malformed data.
function getFormErrors(book, managedBooks = []) {
  const duplicateTitle = managedBooks.some((managedBook) => (
    managedBook.id !== book.id && managedBook.title?.trim().toLowerCase() === book.title.trim().toLowerCase()
  ))

  return [
    !hasText(book.title) && { id: 'title', message: 'Add a title.' },
    duplicateTitle && { id: 'duplicate-title', message: 'A managed book already uses this title.' },
    !hasText(book.author) && { id: 'author', message: 'Add an author.' },
    hasText(book.cover) && !isValidImageSource(book.cover) && { id: 'cover-url', message: 'Cover must be an http(s) image URL or an uploaded image.' },
    hasText(book.readerUrl) && !isValidHttpUrl(book.readerUrl) && { id: 'reader-url', message: 'Reader URL must start with http:// or https://.' },
  ].filter(Boolean)
}

// Content-completeness rules - fine to leave blank while a book is still a
// Draft, but required before it can go out as Published. Shown as a popup
// on submit rather than a permanently disabled button, so drafting stays fast.
function getPublishRequirements(book) {
  return [
    !hasText(book.cover) && { id: 'cover', message: 'a cover image (URL or upload)' },
    !hasText(book.description) && { id: 'description', message: 'a description' },
    !hasReaderSource(book) && { id: 'reader', message: 'reader content - a Reader URL, or a linked Gutenberg catalog entry' },
  ].filter(Boolean)
}

function getBookWarnings(book) {
  return [
    !hasCover(book) && { id: 'cover' },
    !hasText(book.description) && { id: 'description' },
    !isReaderReady(book) && { id: 'reader' },
  ].filter(Boolean)
}

function hasText(value) {
  return String(value || '').trim().length > 0
}

function hasCover(book) {
  return Boolean(book.coverUrl || book.formats?.['image/jpeg'] || book.cover)
}

// A book linked to the Gutenberg catalog (sourceEtextNumber) always has
// reader text - the backend fetches it live from book_metadata's
// readOnlineUrl at read time (see getBookReaderText), regardless of whether
// the readerUrl field here was filled in. Only unlinked/manual books
// actually need a readerUrl typed in by hand.
function isReaderReady(book) {
  return Boolean(getReaderUrl(book) || book.sourceEtextNumber)
}

function hasReaderSource(book) {
  return Boolean(hasText(book.readerUrl) || book.sourceEtextNumber)
}

function isValidHttpUrl(value) {
  if (!hasText(value)) return true

  try {
    const url = new URL(String(value).trim())
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isValidImageSource(value) {
  if (!hasText(value)) return true
  const source = String(value).trim()
  return source.startsWith('data:image/') || isValidHttpUrl(source)
}

export default AdminPage
