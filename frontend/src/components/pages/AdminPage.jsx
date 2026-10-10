import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

function playNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(587.33, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15)
    gain.gain.setValueAtTime(0.12, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.35)
  } catch (_) {}
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

  const [pendingSupportCount, setPendingSupportCount] = useState(0)
  const lastSupportCountRef = useRef(0)

  useEffect(() => {
    if (!canManageUsers) return

    let ignore = false
    function checkSupportInbox() {
      apiFetch('/api/admin/support/conversations?status=escalated')
        .then((data) => {
          if (ignore) return
          const count = Array.isArray(data) ? data.length : 0
          if (count > lastSupportCountRef.current && lastSupportCountRef.current !== 0) {
            onToast?.({
              type: 'info',
              message: 'New customer support message received in inbox!',
            })
            playNotificationChime()
          }
          lastSupportCountRef.current = count
          setPendingSupportCount(count)
        })
        .catch(() => {})
    }

    checkSupportInbox()
    const interval = setInterval(checkSupportInbox, 25000)
    return () => {
      ignore = true
      clearInterval(interval)
    }
  }, [canManageUsers, onToast])

  const adminNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'bi-speedometer2' },
    canPushBooks && { id: 'book', label: 'Book Management', icon: 'bi-collection' },
    { id: 'stories', label: 'Stories Management', icon: 'bi-chat-heart' },
    canManageUsers && {
      id: 'contributions',
      label: 'User Management',
      icon: 'bi-people',
      badge: pendingSupportCount > 0 ? pendingSupportCount : null,
    },
    { id: 'settings', label: 'Settings', icon: 'bi-gear' },
  ].filter(Boolean)
  const availableSections = adminNavItems.map((item) => item.id)

  const [activeAdminSection, setActiveAdminSection] = useState(availableSections[0] || 'dashboard')
  const [contributionsTab, setContributionsTab] = useState('submissions')
  // Which sub-view Book Management shows: the existing hand-curated
  // catalog (Push Book / edit / delete) vs the new Gutendex/LibriVox
  // synced Content collection (see ContentManagementPanel below) - two
  // different collections with two different workflows, so they're kept
  // as separate sub-tabs rather than merged into one table.
  const [bookManagementView, setBookManagementView] = useState('catalog')
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

  const [userRefreshTick, setUserRefreshTick] = useState(0)

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
    if (ok) {
      setBanTarget(null)
      setUserRefreshTick((tick) => tick + 1)
    }
  }

  async function handleUnban(user) {
    setBanBusyId(user.id)
    const ok = await onUnbanUser(user.id)
    setBanBusyId('')
    if (ok) {
      setUserRefreshTick((tick) => tick + 1)
    }
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
                {item.badge && <span className="admin-inbox-badge" style={{ marginLeft: 'auto' }}>{item.badge}</span>}
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
        <AdminDashboard
          canManageUsers={canManageUsers}
          canPushBooks={canPushBooks}
          onNavigateSection={(section, subTab) => {
            setActiveAdminSection(section)
            if (subTab) setContributionsTab(subTab)
          }}
        />
      ) : null}

      {activeAdminSection === 'book' && canPushBooks ? (
        <>
          <div className="admin-filter-bar admin-book-management-tabs" aria-label="Book Management view">
            <button className={bookManagementView === 'catalog' ? 'active' : ''} onClick={() => setBookManagementView('catalog')} type="button">
              Catalog books
            </button>
            <button className={bookManagementView === 'synced' ? 'active' : ''} onClick={() => setBookManagementView('synced')} type="button">
              Synced content (Gutenberg/LibriVox)
            </button>
          </div>

          {bookManagementView === 'synced' && <ContentManagementPanel />}

          {bookManagementView === 'catalog' && (
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
                          <img alt="" src={getAdminCover(book)} onError={(event) => { event.currentTarget.src = NONE_COVER_URL }} />
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
          )}
        </>
      ) : null}

      {activeAdminSection === 'stories' && <StoriesManagementPanel onToast={onToast} />}

      {activeAdminSection === 'contributions' && canManageUsers ? (
        <>
          <div className="admin-filter-bar admin-book-management-tabs" aria-label="User Management view">
            <button
              className={contributionsTab === 'submissions' ? 'active' : ''}
              onClick={() => setContributionsTab('submissions')}
              type="button"
            >
              <i className="bi bi-journal-arrow-up" style={{ marginRight: '6px' }} />
              Book submissions
            </button>
            <button
              className={contributionsTab === 'users' ? 'active' : ''}
              onClick={() => setContributionsTab('users')}
              type="button"
            >
              <i className="bi bi-people" style={{ marginRight: '6px' }} />
              User directory
            </button>
            <button
              className={contributionsTab === 'comments' ? 'active' : ''}
              onClick={() => setContributionsTab('comments')}
              type="button"
            >
              <i className="bi bi-chat-square-quote" style={{ marginRight: '6px' }} />
              Comments moderation
            </button>
            <button
              className={contributionsTab === 'support' ? 'active' : ''}
              onClick={() => setContributionsTab('support')}
              type="button"
            >
              <i className="bi bi-chat-left-dots" style={{ marginRight: '6px' }} />
              Help chat inbox
              {pendingSupportCount > 0 && (
                <span className="admin-inbox-badge" style={{ marginLeft: '8px' }}>
                  {pendingSupportCount}
                </span>
              )}
            </button>
            <button
              className={contributionsTab === 'broadcast' ? 'active' : ''}
              onClick={() => setContributionsTab('broadcast')}
              type="button"
            >
              <i className="bi bi-megaphone" style={{ marginRight: '6px' }} />
              System broadcast
            </button>
          </div>

          {contributionsTab === 'submissions' && <UserSubmissionsPanel onToast={onToast} />}
          {contributionsTab === 'users' && (
            <UsersDirectoryPanel
              banBusyId={banBusyId}
              onBan={(user) => setBanTarget(user)}
              onToast={onToast}
              onUnban={handleUnban}
              refreshTick={userRefreshTick}
            />
          )}
          {contributionsTab === 'comments' && (
            <CommentsModerationPanel onBanUser={(user) => setBanTarget(user)} onToast={onToast} />
          )}
          {contributionsTab === 'support' && (
            <SupportInboxPanel onCountChange={setPendingSupportCount} onToast={onToast} />
          )}
          {contributionsTab === 'broadcast' && <SystemBroadcastPanel onToast={onToast} />}
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

const CONTENT_STATUS_FILTERS = [
  { id: '', label: 'All statuses' },
  { id: 'published', label: 'Published' },
  { id: 'draft', label: 'Draft' },
  { id: 'hidden', label: 'Hidden' },
]

const CONTENT_PER_PAGE = 20

// Same placeholder used for the catalog book grid above, reused here so a
// missing cover_image (a Content doc synced without one) doesn't leave a
// blank cell in the table.
const CONTENT_NONE_COVER_URL = NONE_COVER_URL

// Book Management's "Synced content" sub-tab: everything in the Content
// collection (see backend/models/Content.js), which is a completely
// different collection/workflow from the hand-curated catalog above - this
// is auto-synced from Gutendex/LibriVox by the daily cron (see
// backend/utils/contentIngestion.js), not pushed one book at a time by an
// admin, so there's no Add/Edit here - only filtering, inspecting, and
// Publish/Hide.
function ContentManagementPanel() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryInput, setCategoryInput] = useState('')
  const [authorInput, setAuthorInput] = useState('')
  const [detailItem, setDetailItem] = useState(null)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    let ignore = false
    setLoading(true)
    setError('')

    const params = new URLSearchParams({ page: String(page), limit: String(CONTENT_PER_PAGE) })
    if (typeFilter) params.set('type', typeFilter)
    if (statusFilter) params.set('status', statusFilter)
    if (categoryInput.trim()) params.set('category', categoryInput.trim())
    if (authorInput.trim()) params.set('author', authorInput.trim())

    apiFetch(`/api/admin/content?${params.toString()}`)
      .then((data) => {
        if (ignore) return
        setItems(Array.isArray(data.items) ? data.items : [])
        setTotal(data.total || 0)
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
  }, [page, typeFilter, statusFilter, categoryInput, authorInput])

  // Any filter change starts back on page 1 - staying on e.g. page 4 of a
  // filter that now only has 1 page would just show an empty table.
  function updateFilter(setter, value) {
    setter(value)
    setPage(1)
  }

  async function changeStatus(item, status) {
    setActionError('')
    try {
      await apiFetch(`/api/admin/content/${item._id}/status`, { method: 'PATCH', body: { status } })
      setItems((current) => current.map((row) => (row._id === item._id ? { ...row, status } : row)))
      setDetailItem((current) => (current && current._id === item._id ? { ...current, status } : current))
    } catch (err) {
      setActionError(err.message)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / CONTENT_PER_PAGE))

  return (
    <section className="admin-workspace admin-book-toolbar">
      <div className="section-heading">
        <div>
          <p className="mono-eyebrow">Auto-synced</p>
          <h2>Synced content</h2>
        </div>
        <span>Ebooks from Gutenberg and audiobooks from LibriVox, kept fresh by the daily sync job.</span>
      </div>

      {actionError && <p className="admin-validation-error"><i className="bi bi-x-circle" /> {actionError}</p>}

      <div className="admin-filter-bar" aria-label="Filter synced content">
        {[{ id: '', label: 'All types' }, { id: 'ebook', label: 'Ebooks' }, { id: 'audiobook', label: 'Audiobooks' }].map((option) => (
          <button
            className={typeFilter === option.id ? 'active' : ''}
            key={option.id || 'all-types'}
            onClick={() => updateFilter(setTypeFilter, option.id)}
            type="button"
          >
            {option.label}
          </button>
        ))}
        {CONTENT_STATUS_FILTERS.map((option) => (
          <button
            className={statusFilter === option.id ? 'active' : ''}
            key={option.id || 'all-statuses'}
            onClick={() => updateFilter(setStatusFilter, option.id)}
            type="button"
          >
            {option.label}
          </button>
        ))}
        <input
          onChange={(event) => updateFilter(setCategoryInput, event.target.value)}
          placeholder="Filter by category..."
          type="text"
          value={categoryInput}
        />
        <input
          onChange={(event) => updateFilter(setAuthorInput, event.target.value)}
          placeholder="Filter by author..."
          type="text"
          value={authorInput}
        />
      </div>

      <section className="admin-table admin-book-grid">
        <div className="admin-table-heading">
          <h2>Content</h2>
          <span className="admin-count-pill">{total.toLocaleString()}</span>
        </div>

        {error && <p className="admin-validation-error"><i className="bi bi-x-circle" /> {error}</p>}

        {loading ? (
          <AdminLoadingScreen label="Loading synced content..." />
        ) : items.length ? (
          <div className="admin-book-grid-rows">
            {items.map((item) => (
              <div className="table-row admin-book-row admin-row-fade-in" key={item._id}>
                <img
                  alt=""
                  onError={(event) => {
                    event.currentTarget.src = CONTENT_NONE_COVER_URL
                  }}
                  onClick={() => setDetailItem(item)}
                  src={item.cover_image || CONTENT_NONE_COVER_URL}
                  style={{ cursor: 'pointer' }}
                />
                <span onClick={() => setDetailItem(item)} style={{ cursor: 'pointer' }}>
                  {item.title}
                  <em className={`admin-status status-${item.status}`}>{item.status}</em>
                </span>
                <small>
                  {item.author} - {item.type === 'ebook' ? 'Ebook' : 'Audiobook'} - {item.source}
                  {item.categories?.length ? ` - ${item.categories.slice(0, 2).join(', ')}` : ''}
                </small>
                <div className="admin-row-actions">
                  <button className="edit-button" onClick={() => setDetailItem(item)} type="button">
                    View
                  </button>
                  {item.status !== 'published' && (
                    <button className="primary-button" onClick={() => changeStatus(item, 'published')} type="button">
                      Publish
                    </button>
                  )}
                  {item.status !== 'hidden' && (
                    <button className="danger-button" onClick={() => changeStatus(item, 'hidden')} type="button">
                      Hide
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p>No content matches this filter.</p>
        )}

        {total > CONTENT_PER_PAGE && <AdminPagination currentPage={page} onPageChange={setPage} totalPages={totalPages} />}
      </section>

      {detailItem && <ContentDetailModal item={detailItem} onChangeStatus={changeStatus} onClose={() => setDetailItem(null)} />}
    </section>
  )
}

// Full metadata + file list for one Content document - opened by clicking a
// row in ContentManagementPanel above. Reuses the same modal shell classes
// as the "Push Book" modal (admin-book-modal / -header / -body) so it
// matches the rest of the admin panel without new CSS.
function ContentDetailModal({ item, onChangeStatus, onClose }) {
  return (
    <div aria-labelledby="content-detail-title" aria-modal="true" className="reader-modal-backdrop admin-content-detail-backdrop" role="dialog">
      <div className="admin-book-modal">
        <header className="admin-book-modal-header">
          <div>
            <p className="mono-eyebrow">{item.type === 'ebook' ? 'Ebook' : 'Audiobook'} - {item.source}</p>
            <h2 id="content-detail-title">{item.title}</h2>
          </div>
          <button aria-label="Close" className="admin-book-modal-close" onClick={onClose} type="button">
            <i className="bi bi-x-lg" />
          </button>
        </header>

        <div className="admin-book-modal-body">
          <div className="admin-search-hero">
            <img alt="" src={item.cover_image || NONE_COVER_URL} style={{ width: 96, height: 134, objectFit: 'cover', borderRadius: 6 }} />
            <div className="admin-search-hero-label">
              <div>
                <strong>{item.author}</strong>
                <span>
                  {item.language} - <em className={`admin-status status-${item.status}`}>{item.status}</em>
                  {item.categories?.length ? ` - ${item.categories.join(', ')}` : ''}
                </span>
              </div>
            </div>
          </div>

          <p>{item.description || 'No description available.'}</p>

          {item.source === 'User' && (
            <p className="community-submission-meta">
              <i className="bi bi-person-circle" /> Submitted by {item.uploadedBy?.name || 'a community member'}
            </p>
          )}

          <h3>Files</h3>
          {item.files?.length ? (
            <ul>
              {item.files.map((file) => (
                <li key={file.url}>
                  <a href={file.url} rel="noreferrer" target="_blank">
                    {file.format}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p>No files recorded.</p>
          )}

          <div className="admin-row-actions">
            {item.status !== 'published' && (
              <button className="primary-button" onClick={() => onChangeStatus(item, 'published')} type="button">
                Publish
              </button>
            )}
            {item.status !== 'draft' && (
              <button className="edit-button" onClick={() => onChangeStatus(item, 'draft')} type="button">
                Move to draft
              </button>
            )}
            {item.status !== 'hidden' && (
              <button className="danger-button" onClick={() => onChangeStatus(item, 'hidden')} type="button">
                Hide
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function AdminDashboard({ canManageUsers, canPushBooks, onNavigateSection }) {
  const [stats, setStats] = useState(null)
  const [totalUsers, setTotalUsers] = useState(0)
  const [opsCounts, setOpsCounts] = useState({
    pendingSupport: 0,
    pendingSubmissions: 0,
    totalComments: 0,
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let ignore = false
    setLoading(true)

    const calls = [
      apiFetch('/api/books/stats'),
      canManageUsers ? apiFetch('/api/users?limit=1') : Promise.resolve(null),
      canManageUsers ? apiFetch('/api/admin/support/conversations?status=escalated') : Promise.resolve([]),
      canManageUsers ? apiFetch('/api/books/mine?status=draft&contributorRole=customer&limit=1') : Promise.resolve({ total: 0 }),
      canManageUsers ? apiFetch('/api/admin/comments?limit=1') : Promise.resolve({ total: 0 }),
      canManageUsers ? apiFetch('/api/admin/content?status=draft&source=User&limit=1') : Promise.resolve({ total: 0 }),
    ]

    Promise.allSettled(calls).then(([statsRes, usersRes, supportRes, subsRes, commentsRes, commRes]) => {
      if (ignore) return
      if (statsRes.status === 'fulfilled' && statsRes.value) {
        setStats(statsRes.value)
      } else {
        setError(statsRes.reason?.message || 'Could not load stats.')
      }

      if (usersRes.status === 'fulfilled' && usersRes.value?.total) {
        setTotalUsers(usersRes.value.total)
      }

      const booksPending = subsRes.status === 'fulfilled' && typeof subsRes.value?.total === 'number' ? subsRes.value.total : 0
      const communityPending = commRes.status === 'fulfilled' && typeof commRes.value?.total === 'number' ? commRes.value.total : 0

      setOpsCounts({
        pendingSupport: supportRes.status === 'fulfilled' && Array.isArray(supportRes.value) ? supportRes.value.length : 0,
        pendingSubmissions: booksPending + communityPending,
        totalComments: commentsRes.status === 'fulfilled' && typeof commentsRes.value?.total === 'number' ? commentsRes.value.total : 0,
      })

      setLoading(false)
    })

    return () => {
      ignore = true
    }
  }, [canManageUsers])

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

      {canManageUsers && (
        <div className="admin-ops-pulse">
          <div className="admin-ops-card admin-row-fade-in">
            <div className="admin-ops-card-left">
              <span className="admin-ops-icon admin-ops-icon-support">
                <i className="bi bi-chat-dots-fill" />
              </span>
              <div className="admin-ops-info">
                <strong>{opsCounts.pendingSupport} escalated</strong>
                <span>Support chats waiting for response</span>
              </div>
            </div>
            <button
              className="ghost-button"
              onClick={() => onNavigateSection?.('contributions', 'support')}
              style={{ padding: '6px 12px', fontSize: '13px' }}
              type="button"
            >
              Open inbox <i className="bi bi-arrow-right" />
            </button>
          </div>

          <div className="admin-ops-card admin-row-fade-in">
            <div className="admin-ops-card-left">
              <span className="admin-ops-icon admin-ops-icon-submissions">
                <i className="bi bi-file-earmark-text-fill" />
              </span>
              <div className="admin-ops-info">
                <strong>{opsCounts.pendingSubmissions} submissions</strong>
                <span>Customer submissions to review</span>
              </div>
            </div>
            <button
              className="ghost-button"
              onClick={() => onNavigateSection?.('contributions', 'submissions')}
              style={{ padding: '6px 12px', fontSize: '13px' }}
              type="button"
            >
              Review <i className="bi bi-arrow-right" />
            </button>
          </div>

          <div className="admin-ops-card admin-row-fade-in">
            <div className="admin-ops-card-left">
              <span className="admin-ops-icon admin-ops-icon-comments">
                <i className="bi bi-shield-check" />
              </span>
              <div className="admin-ops-info">
                <strong>{opsCounts.totalComments} comments</strong>
                <span>Customer comments & reviews</span>
              </div>
            </div>
            <button
              className="ghost-button"
              onClick={() => onNavigateSection?.('contributions', 'comments')}
              style={{ padding: '6px 12px', fontSize: '13px' }}
              type="button"
            >
              Moderate <i className="bi bi-arrow-right" />
            </button>
          </div>
        </div>
      )}

      <div className="admin-dashboard-summary">
        <div className="admin-summary-card admin-row-fade-in">
          <i className="bi bi-collection" />
          <strong>{stats.totalBooks}</strong>
          <span>Total books</span>
        </div>
        {totalUsers > 0 && (
          <div className="admin-summary-card admin-row-fade-in">
            <i className="bi bi-people-fill" />
            <strong>{totalUsers}</strong>
            <span>Registered users</span>
          </div>
        )}
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

      {canPushBooks && <ContentStatsSection />}
    </section>
  )
}

// Separate fetch/loading state from the catalog stats above on purpose -
// Content (Gutendex/LibriVox synced items) is a different collection with
// its own independent daily sync job, so one endpoint being slow or down
// shouldn't block the other's numbers from showing.
function ContentStatsSection() {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let ignore = false
    apiFetch('/api/admin/content/stats')
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

  if (loading) return null
  if (error || !stats) {
    return <p className="admin-validation-error"><i className="bi bi-x-circle" /> {error || 'Could not load synced content stats.'}</p>
  }

  const byStatus = stats.byStatus || {}
  const statusEntries = ['published', 'draft', 'hidden'].map((key) => ({ key, count: byStatus[key] || 0 }))
  const maxStatusCount = Math.max(1, ...statusEntries.map((entry) => entry.count))
  const byCategory = (stats.byCategory || []).slice(0, 8)
  const maxCategoryCount = Math.max(1, ...byCategory.map((entry) => entry.count))

  return (
    <>
      <div className="section-heading">
        <div>
          <p className="mono-eyebrow">Auto-synced</p>
          <h2>Synced content</h2>
        </div>
        <span>Gutendex ebooks + LibriVox audiobooks, kept fresh by the daily sync job.</span>
      </div>

      <div className="admin-dashboard-summary">
        <div className="admin-summary-card admin-row-fade-in">
          <i className="bi bi-collection" />
          <strong>{stats.total}</strong>
          <span>Total content</span>
        </div>
        <div className="admin-summary-card admin-row-fade-in">
          <i className="bi bi-book" />
          <strong>{stats.byType?.ebook || 0}</strong>
          <span>Ebooks</span>
        </div>
        <div className="admin-summary-card admin-row-fade-in">
          <i className="bi bi-headphones" />
          <strong>{stats.byType?.audiobook || 0}</strong>
          <span>Audiobooks</span>
        </div>
        <div className="admin-summary-card admin-row-fade-in">
          <i className="bi bi-clock-history" />
          <strong>{stats.updatedToday}</strong>
          <span>Updated today</span>
        </div>
      </div>

      <div className="admin-dashboard-grid">
        <div className="admin-chart-card">
          <h3><i className="bi bi-bar-chart" /> Content by status</h3>
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
          <h3><i className="bi bi-tags" /> Content by category</h3>
          {byCategory.length ? (
            byCategory.map((entry) => (
              <div className="admin-bar-row" key={entry.category}>
                <span className="admin-bar-label admin-bar-label-title" title={entry.category}>{entry.category}</span>
                <div className="admin-bar-track">
                  <div className="admin-bar-fill admin-bar-fill-alt" style={{ width: `${(entry.count / maxCategoryCount) * 100}%` }} />
                </div>
                <span className="admin-bar-value">{entry.count}</span>
              </div>
            ))
          ) : (
            <p className="settings-copy">No categories recorded yet.</p>
          )}
        </div>
      </div>
    </>
  )
}

function UserSubmissionsPanel({ onToast }) {
  const [submissionSource, setSubmissionSource] = useState('stories')
  const [submissions, setSubmissions] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('draft')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [actionBusyId, setActionBusyId] = useState('')
  const [reviewTarget, setReviewTarget] = useState(null)
  const [rejectTarget, setRejectTarget] = useState(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const LIMIT = 12

  useEffect(() => {
    let ignore = false
    setLoading(true)

    const isCommunity = submissionSource === 'community'
    const endpoint = isCommunity
      ? (() => {
          const params = new URLSearchParams({
            source: 'User',
            page: String(page),
            limit: String(LIMIT),
          })
          if (statusFilter && statusFilter !== 'all') {
            params.set('status', statusFilter)
          }
          if (searchQuery.trim()) {
            params.set('search', searchQuery.trim())
          }
          return `/api/admin/content?${params.toString()}`
        })()
      : (() => {
          const params = new URLSearchParams({
            contributorRole: 'customer',
            page: String(page),
            limit: String(LIMIT),
          })
          if (statusFilter && statusFilter !== 'all') {
            params.set('status', statusFilter)
          }
          if (searchQuery.trim()) {
            params.set('q', searchQuery.trim())
          }
          return `/api/books/mine?${params.toString()}`
        })()

    apiFetch(endpoint)
      .then((data) => {
        if (!ignore) {
          const list = isCommunity
            ? (Array.isArray(data.items) ? data.items : [])
            : (Array.isArray(data.books) ? data.books : [])
          setSubmissions(list)
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
  }, [submissionSource, page, statusFilter, searchQuery, refreshTick])

  async function updateStatus(itemId, newStatus, reason = '') {
    setActionBusyId(itemId)
    try {
      const isCommunity = submissionSource === 'community' || reviewTarget?.source === 'User' || rejectTarget?.source === 'User'
      if (isCommunity) {
        await apiFetch(`/api/admin/content/${itemId}/status`, {
          method: 'PATCH',
          body: { status: newStatus, reason },
        })
        onToast?.({
          type: 'success',
          message: newStatus === 'published' ? 'Community contribution approved and published.' : 'Community contribution hidden/rejected.',
        })
      } else {
        await apiFetch(`/api/books/${itemId}`, {
          method: 'PATCH',
          body: { status: newStatus, rejectionReason: reason, reason },
        })
        onToast?.({
          type: 'success',
          message: newStatus === 'published' ? 'Book approved and published.' : 'Book hidden/rejected.',
        })
      }
      setSubmissions((current) =>
        current.map((item) => (item.id === itemId || item._id === itemId ? { ...item, status: newStatus, rejectionReason: reason } : item))
      )
      if (reviewTarget && (reviewTarget.id === itemId || reviewTarget._id === itemId)) {
        setReviewTarget((curr) => ({ ...curr, status: newStatus, rejectionReason: reason }))
      }
      setRefreshTick((t) => t + 1)
      setRejectTarget(null)
    } catch (error) {
      onToast?.({ type: 'error', message: error.message })
    } finally {
      setActionBusyId('')
    }
  }

  function handleSearchSubmit(event) {
    event.preventDefault()
    setSearchQuery(searchInput.trim())
    setPage(1)
  }

  function handleClearSearch() {
    setSearchInput('')
    setSearchQuery('')
    setPage(1)
  }

  const submissionFilters = [
    { id: 'draft', label: 'Pending review (Draft)' },
    { id: 'published', label: 'Published' },
    { id: 'hidden', label: 'Hidden / Rejected' },
    { id: 'all', label: 'All submissions' },
  ]

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  return (
    <section className="admin-workspace admin-book-toolbar">
      <div className="section-heading">
        <div>
          <p className="mono-eyebrow">User Management</p>
          <h2>Customer submissions</h2>
        </div>
        <span>Review written stories and community narrations submitted by readers. Approve to publish to the catalog, or reject/hide.</span>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <button
          className={submissionSource === 'stories' ? 'primary-button' : 'ghost-button'}
          onClick={() => {
            setSubmissionSource('stories')
            setPage(1)
          }}
          type="button"
        >
          <i className="bi bi-journal-text" style={{ marginRight: '6px' }} />
          Written stories (Original books)
        </button>
        <button
          className={submissionSource === 'community' ? 'primary-button' : 'ghost-button'}
          onClick={() => {
            setSubmissionSource('community')
            setPage(1)
          }}
          type="button"
        >
          <i className="bi bi-mic" style={{ marginRight: '6px' }} />
          Community narrations (Audio & files)
        </button>
      </div>

      <div className="admin-filter-bar" aria-label="Filter customer submissions">
        {submissionFilters.map((filter) => (
          <button
            className={statusFilter === filter.id ? 'active' : ''}
            key={filter.id}
            onClick={() => {
              setStatusFilter(filter.id)
              setPage(1)
            }}
            type="button"
          >
            {filter.label}
          </button>
        ))}

        <form className="admin-catalog-search" onSubmit={handleSearchSubmit}>
          <i className="bi bi-search" />
          <input
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search title, author... (Enter)"
            type="text"
            value={searchInput}
          />
          {searchQuery && (
            <button
              className="ghost-button"
              onClick={handleClearSearch}
              style={{ border: 'none', padding: '0 8px', minHeight: 'auto' }}
              title="Clear search"
              type="button"
            >
              <i className="bi bi-x-lg" />
            </button>
          )}
        </form>
      </div>

      <section className="admin-table admin-book-grid">
        <div className="admin-table-heading">
          <h2>{submissionSource === 'community' ? 'Community narrations' : 'Written stories'}</h2>
          <span className="admin-count-pill">{total.toLocaleString()}</span>
        </div>

        {loading ? (
          <AdminLoadingScreen label="Loading submissions..." />
        ) : submissions.length ? (
          <>
            <div className="admin-book-grid-rows">
              {submissions.map((book, bookIndex) => {
                const bookId = book.id || book._id
                const isCommunity = submissionSource === 'community' || book.source === 'User'
                const submitter = isCommunity
                  ? (book.uploadedBy?.name || book.uploadedBy?.email || 'Community member')
                  : (book.createdBy?.name || book.author || 'Customer')
                const categoryLabel = isCommunity
                  ? (Array.isArray(book.categories) && book.categories.length ? book.categories.join(', ') : book.type === 'audiobook' ? 'Audiobook' : 'Ebook')
                  : getCategory(book)
                const isBusy = actionBusyId === bookId

                return (
                  <div className="table-row admin-book-row admin-row-fade-in" key={bookId || `sub-${bookIndex}`}>
                    <img
                      alt=""
                      onError={(event) => {
                        event.currentTarget.src = NONE_COVER_URL
                      }}
                      src={getAdminCover(book)}
                    />
                    <span>
                      {book.title}
                      <em className={`admin-status status-${book.status || 'draft'}`}>{book.status || 'draft'}</em>
                      {isCommunity && (
                        <span style={{ marginLeft: '6px', fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: '#ecece8', color: '#555', textTransform: 'uppercase' }}>
                          {book.type || 'audio'}
                        </span>
                      )}
                    </span>
                    <small>
                      By {book.author || 'Unknown'} · Contributor: {submitter} · {categoryLabel}
                      {isCommunity && book.files?.length ? ` · ${book.files.length} file(s)` : ''}
                      {book.createdAt && ` · ${new Date(book.createdAt).toLocaleDateString()}`}
                    </small>
                    <div className="admin-row-actions">
                      <button
                        className="edit-button"
                        onClick={() => setReviewTarget(book)}
                        type="button"
                      >
                        <i className="bi bi-eye" style={{ marginRight: '4px' }} />
                        Review
                      </button>
                      {book.status !== 'published' && (
                        <button
                          className="primary-button"
                          disabled={isBusy}
                          onClick={() => updateStatus(bookId, 'published')}
                          type="button"
                        >
                          {isBusy ? 'Publishing...' : 'Publish'}
                        </button>
                      )}
                      {book.status !== 'hidden' && (
                        <button
                          className="danger-button"
                          disabled={isBusy}
                          onClick={() => setRejectTarget(book)}
                          type="button"
                        >
                          <i className="bi bi-x-circle" style={{ marginRight: '4px' }} />
                          {isBusy ? 'Processing...' : 'Reject'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {total > LIMIT && (
              <AdminPagination currentPage={page} onPageChange={setPage} totalPages={totalPages} />
            )}
          </>
        ) : (
          <p>No customer submissions match this filter.</p>
        )}
      </section>

      {reviewTarget && (
        <SubmissionReviewModal
          book={reviewTarget}
          busy={actionBusyId === (reviewTarget.id || reviewTarget._id)}
          isCommunity={submissionSource === 'community' || reviewTarget.source === 'User'}
          onChangeStatus={updateStatus}
          onReject={(target) => setRejectTarget(target)}
          onClose={() => setReviewTarget(null)}
        />
      )}

      {rejectTarget && (
        <RejectSubmissionModal
          busy={actionBusyId === (rejectTarget.id || rejectTarget._id)}
          item={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onConfirm={(itemId, reason) => updateStatus(itemId, 'hidden', reason)}
        />
      )}
    </section>
  )
}

function SubmissionReviewModal({ book, busy, isCommunity, onChangeStatus, onReject, onClose }) {
  const [fullBook, setFullBook] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeChapterIndex, setActiveChapterIndex] = useState(0)

  const bookId = book.id || book._id

  useEffect(() => {
    let ignore = false
    setLoading(true)

    const endpoint = isCommunity
      ? `/api/admin/content/${bookId}`
      : `/api/books/${bookId}`

    apiFetch(endpoint)
      .then((data) => {
        if (!ignore) {
          setFullBook(data.book || data)
        }
      })
      .catch(() => {
        if (!ignore) {
          setFullBook(book)
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })

    return () => {
      ignore = true
    }
  }, [bookId, isCommunity])

  const targetBook = fullBook || book
  const chapters = targetBook.chapters || []
  const activeChapter = chapters[activeChapterIndex] || null
  const submitterName = targetBook.createdBy?.name || targetBook.uploadedBy?.name || targetBook.author || 'Customer'
  const submitterEmail = targetBook.createdBy?.email || targetBook.uploadedBy?.email

  return (
    <div
      aria-labelledby="submission-review-title"
      aria-modal="true"
      className="reader-modal-backdrop admin-book-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
    >
      <div className="admin-book-modal" style={{ maxWidth: '920px', width: '95%' }}>
        <header className="admin-book-modal-header">
          <div>
            <p className="mono-eyebrow">{isCommunity ? 'Community Contribution Review' : 'Book Submission Review'}</p>
            <h2 id="submission-review-title">{targetBook.title}</h2>
          </div>
          <button aria-label="Close" className="admin-book-modal-close" onClick={onClose} type="button">
            <i className="bi bi-x-lg" />
          </button>
        </header>

        <div className="admin-book-modal-body" style={{ maxHeight: '72vh' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '20px', alignItems: 'start' }}>
            <img
              alt=""
              onError={(e) => {
                e.currentTarget.src = NONE_COVER_URL
              }}
              src={getAdminCover(targetBook)}
              style={{ width: '120px', height: '168px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #d8d8d3' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span className={`admin-status status-${targetBook.status || 'draft'}`}>{targetBook.status || 'draft'}</span>
                <span style={{ fontSize: '13px', color: '#555550' }}>
                  {isCommunity
                    ? (Array.isArray(targetBook.categories) && targetBook.categories.length ? targetBook.categories.join(', ') : targetBook.type === 'audiobook' ? 'Audiobook' : 'Ebook')
                    : getCategory(targetBook)}
                </span>
                {!isCommunity && <span style={{ fontSize: '13px', color: '#74746f' }}>· {chapters.length} chapter(s)</span>}
                {isCommunity && targetBook.language && (
                  <span style={{ fontSize: '13px', color: '#74746f' }}>· Language: {targetBook.language}</span>
                )}
              </div>
              <p style={{ margin: '4px 0', fontSize: '15px' }}>
                <strong>Author:</strong> {targetBook.author}
              </p>
              <p style={{ margin: '0', fontSize: '13px', color: '#555550' }}>
                <strong>Submitter:</strong> {submitterName} {submitterEmail ? `(${submitterEmail})` : ''}
              </p>
              {targetBook.createdAt && (
                <small style={{ color: '#74746f' }}>
                  Submitted on {new Date(targetBook.createdAt).toLocaleString()}
                </small>
              )}
              {targetBook.description && (
                <div style={{ marginTop: '8px', padding: '10px 14px', background: '#f8f8f6', borderRadius: '8px', fontSize: '13px', lineHeight: '1.6' }}>
                  <strong>Description:</strong> {targetBook.description}
                </div>
              )}
              {targetBook.rejectionReason && (
                <div style={{ marginTop: '8px', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '13px', color: '#991b1b', lineHeight: '1.5' }}>
                  <strong style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="bi bi-exclamation-triangle-fill" /> Previous rejection reason:
                  </strong>
                  <p style={{ margin: '4px 0 0' }}>{targetBook.rejectionReason}</p>
                </div>
              )}
            </div>
          </div>

          {isCommunity ? (
            <div style={{ marginTop: '16px', borderTop: '1px solid #e4e4df', paddingTop: '16px' }}>
              <h3 style={{ fontSize: '16px', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="bi bi-file-earmark-music" /> Attached Audio & Files ({targetBook.files?.length || 0})
              </h3>
              {targetBook.files && targetBook.files.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {targetBook.files.map((file, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        background: '#f8f8f6',
                        borderRadius: '8px',
                        border: '1px solid #e4e4df',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ textTransform: 'uppercase', fontSize: '12px', fontWeight: 'bold', background: '#e0e0dc', padding: '3px 8px', borderRadius: '4px' }}>
                          {file.format || 'file'}
                        </span>
                        <span style={{ fontSize: '13px', color: '#333', maxWidth: '450px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.url}>
                          {file.url}
                        </span>
                      </div>
                      <a
                        className="ghost-button"
                        href={file.url}
                        rel="noopener noreferrer"
                        style={{ textDecoration: 'none', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                        target="_blank"
                      >
                        <i className="bi bi-box-arrow-up-right" />
                        Open / Listen
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: '#74746f', fontStyle: 'italic' }}>No media files attached to this contribution.</p>
              )}
            </div>
          ) : (
            <div style={{ marginTop: '16px', borderTop: '1px solid #e4e4df', paddingTop: '16px' }}>
              <h3 style={{ fontSize: '16px', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="bi bi-book-half" /> Chapters & Content Preview ({chapters.length})
              </h3>

              {loading ? (
                <AdminLoadingScreen label="Loading chapters..." />
              ) : chapters.length ? (
                <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '16px', minHeight: '260px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '360px', overflowY: 'auto' }}>
                    {chapters.map((ch, idx) => (
                      <button
                        className={`ghost-button ${idx === activeChapterIndex ? 'active' : ''}`}
                        key={ch.id || ch._id || `ch-${idx}`}
                        onClick={() => setActiveChapterIndex(idx)}
                        style={{
                          textAlign: 'left',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: idx === activeChapterIndex ? '1px solid var(--app-accent, #16a09a)' : '1px solid #e4e4df',
                          background: idx === activeChapterIndex ? 'color-mix(in srgb, var(--app-accent, #16a09a) 12%, transparent)' : '#ffffff',
                          fontWeight: idx === activeChapterIndex ? 'bold' : 'normal',
                        }}
                        type="button"
                      >
                        {ch.title || `Chapter ${idx + 1}`}
                      </button>
                    ))}
                  </div>

                  <div style={{ background: '#fbfbf8', border: '1px solid #e4e4df', borderRadius: '8px', padding: '16px', maxHeight: '360px', overflowY: 'auto' }}>
                    <h4 style={{ margin: '0 0 10px', fontSize: '15px' }}>
                      {activeChapter?.title || `Chapter ${activeChapterIndex + 1}`}
                    </h4>
                    <div style={{ fontSize: '13px', lineHeight: '1.7', whiteSpace: 'pre-wrap', color: '#2d2d2d' }}>
                      {activeChapter?.content || activeChapter?.text || 'No text content available in this chapter.'}
                    </div>
                  </div>
                </div>
              ) : (
                <p style={{ color: '#74746f', fontStyle: 'italic' }}>
                  This book does not have structured chapters (plain readerUrl or empty draft).
                  {targetBook.readerUrl && (
                    <span style={{ display: 'block', marginTop: '6px' }}>
                      Reader link: <a href={targetBook.readerUrl} rel="noreferrer" target="_blank">{targetBook.readerUrl}</a>
                    </span>
                  )}
                </p>
              )}
            </div>
          )}
        </div>

        <footer className="admin-book-modal-footer">
          <button className="ghost-button" disabled={busy} onClick={onClose} type="button">
            Close
          </button>
          {targetBook.status !== 'published' && (
            <button
              className="primary-button"
              disabled={busy}
              onClick={() => onChangeStatus(bookId, 'published')}
              type="button"
            >
              <i className="bi bi-check-circle" style={{ marginRight: '6px' }} />
              {busy ? 'Publishing...' : 'Approve & Publish'}
            </button>
          )}
          {targetBook.status !== 'hidden' && (
            <button
              className="danger-button"
              disabled={busy}
              onClick={() => (onReject ? onReject(targetBook) : onChangeStatus(bookId, 'hidden'))}
              type="button"
            >
              <i className="bi bi-eye-slash" style={{ marginRight: '6px' }} />
              {busy ? 'Processing...' : 'Reject / Hide'}
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}

function RejectSubmissionModal({ item, busy, onConfirm, onClose }) {
  const PRESET_REASONS = [
    'Does not meet editorial or publication standards',
    'Inappropriate, harmful, or offensive content',
    'Copyright infringement or duplicate submission',
    'Incomplete chapters or broken text formatting',
    'Other (custom reason)',
  ]

  const [selectedPreset, setSelectedPreset] = useState(PRESET_REASONS[0])
  const [customReason, setCustomReason] = useState(PRESET_REASONS[0])

  function handlePresetChange(preset) {
    setSelectedPreset(preset)
    if (preset === 'Other (custom reason)') {
      setCustomReason('')
    } else {
      setCustomReason(preset)
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    const finalReason = customReason.trim() || selectedPreset
    onConfirm(item.id || item._id, finalReason)
  }

  return (
    <div
      aria-labelledby="reject-submission-title"
      aria-modal="true"
      className="reader-modal-backdrop admin-book-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
    >
      <div className="admin-book-modal admin-reject-modal" style={{ maxWidth: '520px', width: '92%' }}>
        <header className="admin-book-modal-header">
          <div>
            <p className="mono-eyebrow">Editorial Review</p>
            <h2 id="reject-submission-title">Reject submission</h2>
          </div>
          <button aria-label="Close" className="admin-book-modal-close" onClick={onClose} type="button">
            <i className="bi bi-x-lg" />
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="admin-book-modal-body" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--app-text-muted, #555550)', lineHeight: '1.5' }}>
              Specify the reason for ignoring or rejecting <strong>"{item?.title}"</strong>. This note will be recorded and sent to the author so they can revise their book.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '13px', fontWeight: '700', color: 'var(--app-text, #111)' }}>
                Select common reason:
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {PRESET_REASONS.map((preset) => (
                  <label
                    key={preset}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '13px',
                      cursor: 'pointer',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      background: selectedPreset === preset ? 'rgba(22, 160, 154, 0.08)' : 'transparent',
                      border: selectedPreset === preset ? '1px solid var(--app-accent, #16a09a)' : '1px solid transparent',
                    }}
                  >
                    <input
                      type="radio"
                      name="presetReason"
                      value={preset}
                      checked={selectedPreset === preset}
                      onChange={() => handlePresetChange(preset)}
                    />
                    <span>{preset}</span>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label htmlFor="rejection-note-textarea" style={{ fontSize: '13px', fontWeight: '700', color: 'var(--app-text, #111)' }}>
                Reason details sent to author:
              </label>
              <textarea
                id="rejection-note-textarea"
                rows={3}
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Provide details or instructions for the author..."
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--app-line, #d8d8d3)',
                  fontSize: '13px',
                  lineHeight: '1.5',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
                required
              />
            </div>
          </div>

          <footer className="admin-book-modal-footer">
            <button className="ghost-button" disabled={busy} onClick={onClose} type="button">
              Cancel
            </button>
            <button className="danger-button" disabled={busy || !customReason.trim()} type="submit">
              <i className="bi bi-x-circle" style={{ marginRight: '6px' }} />
              {busy ? 'Rejecting...' : 'Reject & Notify Author'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}

function UsersDirectoryPanel({ banBusyId, onBan, onToast, onUnban, refreshTick = 0 }) {
  const [users, setUsers] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const LIMIT = 10

  useEffect(() => {
    let ignore = false
    setLoading(true)
    const params = new URLSearchParams({
      role: 'customer',
      page: String(page),
      limit: String(LIMIT),
    })
    if (searchQuery.trim()) {
      params.set('q', searchQuery.trim())
    }

    apiFetch(`/api/users?${params.toString()}`)
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
  }, [page, searchQuery, refreshTick])

  function handleSearchSubmit(event) {
    event.preventDefault()
    setSearchQuery(searchInput.trim())
    setPage(1)
  }

  function handleClearSearch() {
    setSearchInput('')
    setSearchQuery('')
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  return (
    <section className="admin-workspace">
      <div className="section-heading">
        <div>
          <p className="mono-eyebrow">User Management</p>
          <h2>User directory</h2>
        </div>
        <span>Customer accounts only - display name and masked email, ranked by how many books they've pushed.</span>
      </div>

      <div className="admin-book-toolbar-row" style={{ marginBottom: '16px' }}>
        <form className="admin-catalog-search" onSubmit={handleSearchSubmit} style={{ maxWidth: '420px', width: '100%' }}>
          <i className="bi bi-search" />
          <input
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search by name... (Enter to search)"
            type="text"
            value={searchInput}
          />
          {searchQuery && (
            <button
              className="ghost-button"
              onClick={handleClearSearch}
              style={{ border: 'none', padding: '0 8px', minHeight: 'auto' }}
              title="Clear search"
              type="button"
            >
              <i className="bi bi-x-lg" />
            </button>
          )}
        </form>
      </div>

      <section className="admin-table">
        <div className="admin-table-heading">
          <h2>Users</h2>
          <span className="admin-count-pill">{total.toLocaleString()}</span>
        </div>
        {loading ? (
          <AdminLoadingScreen label="Loading users..." />
        ) : users.length ? (
          <>
            <div className="admin-users-directory">
              {users.map((user) => (
                <div className="admin-users-directory-row admin-row-fade-in" key={user.id}>
                  <span className="admin-sidebar-avatar admin-users-directory-avatar">{getInitials(user.name)}</span>
                  <span className="admin-users-directory-info">
                    <strong>{user.name}</strong>
                    <small>{user.email}</small>
                    {user.isRestricted && (
                      <span style={{ fontSize: '12px', color: '#dc2626', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <i className="bi bi-exclamation-triangle-fill" />
                        {user.banReason ? `Banned: ${user.banReason}` : 'Account suspended'}
                        {user.banExpiresAt ? ` (until ${new Date(user.banExpiresAt).toLocaleDateString()})` : ' (Permanent)'}
                      </span>
                    )}
                  </span>
                  <span className="admin-contributor-tag">
                    <i className="bi bi-journal-text" /> Pushed {user.bookCount || 0} books
                  </span>
                  {user.isRestricted ? (
                    <span className="admin-status status-hidden">Restricted</span>
                  ) : (
                    <span className="admin-status status-published">Active</span>
                  )}
                  <div className="admin-row-actions">
                    {user.isRestricted ? (
                      <button
                        className="edit-button"
                        disabled={banBusyId === user.id}
                        onClick={() => onUnban?.(user)}
                        type="button"
                      >
                        {banBusyId === user.id ? 'Unbanning...' : 'Unban'}
                      </button>
                    ) : (
                      <button
                        className="danger-button"
                        disabled={banBusyId === user.id}
                        onClick={() => onBan?.(user)}
                        type="button"
                      >
                        Ban
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {total > LIMIT && (
              <AdminPagination currentPage={page} onPageChange={setPage} totalPages={totalPages} />
            )}
          </>
        ) : (
          <p>No customer accounts found.</p>
        )}
      </section>
    </section>
  )
}

function SupportInboxPanel({ onCountChange, onToast }) {
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [statusFilter, setStatusFilter] = useState('escalated')
  const messagesEndRef = useRef(null)

  function loadList() {
    setLoading(true)
    apiFetch(`/api/admin/support/conversations?status=${statusFilter}`)
      .then((data) => {
        const list = Array.isArray(data) ? data : []
        setConversations(list)
        if (statusFilter === 'escalated') {
          onCountChange?.(list.length)
        }
      })
      .catch((error) => onToast?.({ type: 'error', message: error.message }))
      .finally(() => setLoading(false))
  }

  useEffect(loadList, [statusFilter])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [detail?.messages])

  function openConversation(id) {
    setActiveId(id)
    setDetail(null)
    apiFetch(`/api/admin/support/conversations/${id}`)
      .then((data) => setDetail(data))
      .catch((error) => onToast?.({ type: 'error', message: error.message }))
  }

  async function sendReply() {
    const text = reply.trim()
    if (!text || sending) return
    setSending(true)
    try {
      const data = await apiFetch(`/api/admin/support/conversations/${activeId}/reply`, { method: 'POST', body: { text } })
      setDetail(data)
      setReply('')
    } catch (error) {
      onToast?.({ type: 'error', message: error.message })
    } finally {
      setSending(false)
    }
  }

  async function closeConversation() {
    try {
      await apiFetch(`/api/admin/support/conversations/${activeId}/close`, { method: 'POST' })
      setActiveId(null)
      setDetail(null)
      loadList()
      onToast?.({ type: 'success', message: 'Conversation closed.' })
    } catch (error) {
      onToast?.({ type: 'error', message: error.message })
    }
  }

  return (
    <section className="admin-workspace">
      <div className="section-heading">
        <div>
          <p className="mono-eyebrow">User Management</p>
          <h2>Help chat inbox</h2>
        </div>
        <span>Conversations the AI couldn't finish - the visitor's account is notified as soon as you reply.</span>
      </div>

      <div className="admin-filter-bar" style={{ marginBottom: '14px' }}>
        {[
          { id: 'escalated', label: 'Escalated (Pending)' },
          { id: 'closed', label: 'Closed' },
          { id: 'all', label: 'All conversations' },
        ].map((tab) => (
          <button
            className={statusFilter === tab.id ? 'active' : ''}
            key={tab.id}
            onClick={() => {
              setStatusFilter(tab.id)
              setActiveId(null)
              setDetail(null)
            }}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={`support-inbox-layout ${activeId ? 'has-active-chat' : ''}`}>
        <section className="admin-table support-inbox-list">
          {loading ? (
            <p>Loading...</p>
          ) : conversations.length ? (
            conversations.map((conversation) => (
              <button
                className={`table-row support-inbox-row ${conversation.id === activeId ? 'active' : ''}`}
                key={conversation.id}
                onClick={() => openConversation(conversation.id)}
                type="button"
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>{conversation.user?.name || 'Reader'}</strong>
                  <em className={`admin-status status-${conversation.status === 'closed' ? 'hidden' : 'published'}`} style={{ fontSize: '10px' }}>
                    {conversation.status}
                  </em>
                </div>
                <small>{conversation.lastMessage?.text || 'No messages'}</small>
              </button>
            ))
          ) : (
            <p>No conversations in this status.</p>
          )}
        </section>

        <section className="admin-table support-inbox-detail">
          {!activeId ? (
            <div className="support-inbox-empty-prompt">
              <i className="bi bi-chat-left-dots" />
              <p>Select a conversation from the left to start replying.</p>
            </div>
          ) : !detail ? (
            <div className="support-inbox-empty-prompt">
              <span className="admin-spin-small" />
              <p>Loading conversation...</p>
            </div>
          ) : (
            <>
              <div className="support-inbox-header">
                <button
                  className="ghost-button support-back-to-list-btn"
                  onClick={() => {
                    setActiveId(null)
                    setDetail(null)
                  }}
                  type="button"
                >
                  <i className="bi bi-arrow-left" /> Back
                </button>
                <div className="support-inbox-customer-meta">
                  <div className="support-customer-avatar">
                    <i className="bi bi-person-circle" />
                  </div>
                  <div>
                    <div className="support-customer-name-row">
                      <strong>{detail.user?.name || 'Reader'}</strong>
                      <span className={`admin-status status-${detail.status === 'closed' ? 'hidden' : 'published'}`}>
                        {detail.status === 'closed' ? 'Closed' : 'Escalated (Pending)'}
                      </span>
                    </div>
                    <small className="support-customer-subtext">
                      {detail.user?.email || 'Registered reader'} {detail.user?.displayId ? `• ID: ${detail.user.displayId}` : ''}
                    </small>
                  </div>
                </div>
                <div className="support-inbox-header-actions">
                  {detail.status !== 'closed' ? (
                    <button className="danger-button support-close-btn" onClick={closeConversation} type="button">
                      <i className="bi bi-check2-circle" />
                      <span>Close Conversation</span>
                    </button>
                  ) : (
                    <span className="support-closed-tag">
                      <i className="bi bi-lock-fill" /> Ticket Closed
                    </span>
                  )}
                </div>
              </div>

              <div className="ai-chat-messages support-inbox-messages" style={{ maxHeight: '420px', overflowY: 'auto' }}>
                {detail.messages.map((message, index) => {
                  const isUser = message.role === 'user'
                  const isAdmin = message.role === 'admin'
                  const isSystem = message.role === 'system'
                  const isAi = message.role === 'assistant'

                  return (
                    <div
                      className={`ai-chat-bubble ${
                        isUser
                          ? 'support-bubble-user'
                          : isAdmin
                          ? 'support-bubble-admin'
                          : isSystem
                          ? 'ai-chat-bubble-system'
                          : 'support-bubble-ai'
                      }`}
                      key={index}
                    >
                      <span className="ai-chat-role-label">
                        <i
                          className={`bi ${
                            isUser
                              ? 'bi-person-circle'
                              : isAdmin
                              ? 'bi-shield-check'
                              : isAi
                              ? 'bi-robot'
                              : 'bi-info-circle'
                          }`}
                        />
                        {isUser
                          ? ` Customer (${detail.user?.name || 'Reader'})`
                          : isAdmin
                          ? ' You (Support Admin)'
                          : isAi
                          ? ' BookWorm AI Assistant'
                          : ' System Notice'}
                      </span>
                      {isSystem ? (
                        <div className="system-notice-content">
                          <i className="bi bi-shield-check" />
                          <span>{message.text}</span>
                        </div>
                      ) : (
                        <p>{message.text}</p>
                      )}
                      {message.createdAt && (
                        <span className="ai-chat-timestamp">
                          {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>

              {detail.status === 'closed' ? (
                <div className="support-inbox-closed-banner">
                  <i className="bi bi-info-circle-fill" />
                  <span>This conversation has been closed. If the customer reaches out again, a new ticket will be opened.</span>
                </div>
              ) : (
                <form
                  className="support-inbox-reply-bar"
                  onSubmit={(event) => {
                    event.preventDefault()
                    sendReply()
                  }}
                >
                  <input
                    aria-label="Admin reply input"
                    className="support-inbox-reply-input"
                    disabled={sending}
                    onChange={(event) => setReply(event.target.value)}
                    placeholder="Type your reply to customer..."
                    type="text"
                    value={reply}
                  />
                  <button
                    aria-label="Send reply"
                    className="primary-button support-inbox-send-btn"
                    disabled={!reply.trim() || sending}
                    type="submit"
                  >
                    <i className={`bi ${sending ? 'bi-arrow-repeat spin' : 'bi-send-fill'}`} />
                    <span>Send</span>
                  </button>
                </form>
              )}
            </>
          )}
        </section>
      </div>
    </section>
  )
}

function DeleteCommentModal({ busy, item, onClose, onConfirm }) {
  if (!item) return null

  return (
    <div
      aria-labelledby="admin-delete-comment-title"
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
        <p className="mono-eyebrow">Moderation</p>
        <h2 id="admin-delete-comment-title">Delete this comment?</h2>
        <p className="form-note">
          Are you sure you want to delete this comment by{' '}
          <strong>{item.author?.name || 'Reader'}</strong>? It will be removed permanently from readers' view.
        </p>

        <blockquote
          style={{
            margin: '12px 0 20px',
            padding: '10px 14px',
            borderLeft: '3px solid var(--app-line)',
            background: 'var(--app-surface-soft)',
            fontStyle: 'italic',
            fontSize: '13.5px',
            color: 'var(--app-muted)',
            maxHeight: '120px',
            overflowY: 'auto',
          }}
        >
          "{item.text}"
        </blockquote>

        <div className="admin-form-actions">
          <button className="ghost-button" disabled={busy} onClick={onClose} type="button">
            Cancel
          </button>
          <button className="danger-button" disabled={busy} onClick={onConfirm} type="button">
            <i className="bi bi-trash" />
            {busy ? 'Deleting...' : 'Delete comment'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CommentsModerationPanel({ onBanUser, onToast }) {
  const [comments, setComments] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [targetType, setTargetType] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)
  const LIMIT = 15

  useEffect(() => {
    let ignore = false
    setLoading(true)

    const params = new URLSearchParams({
      page: String(page),
      limit: String(LIMIT),
    })
    if (targetType && targetType !== 'all') {
      params.set('targetType', targetType)
    }
    if (searchQuery.trim()) {
      params.set('q', searchQuery.trim())
    }

    apiFetch(`/api/admin/comments?${params.toString()}`)
      .then((data) => {
        if (!ignore) {
          setComments(Array.isArray(data?.comments) ? data.comments : [])
          setTotal(data?.total || 0)
          setTotalPages(data?.totalPages || 1)
        }
      })
      .catch((error) => {
        if (!ignore) onToast?.({ type: 'error', message: error.message || 'Failed to load comments.' })
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })

    return () => {
      ignore = true
    }
  }, [page, targetType, searchQuery, refreshTick, onToast])

  function handleSearchSubmit(e) {
    e.preventDefault()
    setSearchQuery(searchInput.trim())
    setPage(1)
  }

  function handleClearSearch() {
    setSearchInput('')
    setSearchQuery('')
    setPage(1)
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return
    setDeleteBusy(true)
    try {
      await apiFetch(`/api/admin/comments/${deleteTarget.id}`, { method: 'DELETE' })
      onToast?.({ type: 'success', message: 'Comment removed successfully.' })
      setComments((curr) => curr.filter((c) => c.id !== deleteTarget.id))
      setTotal((t) => Math.max(0, t - 1))
      setDeleteTarget(null)
    } catch (error) {
      onToast?.({ type: 'error', message: error.message || 'Failed to delete comment.' })
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <section className="admin-workspace">
      <div className="section-heading">
        <div>
          <p className="mono-eyebrow">User Management</p>
          <h2>Comments & reviews moderation</h2>
        </div>
        <span className="admin-count-pill">{total} total</span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '16px' }}>
        <form onSubmit={handleSearchSubmit} className="admin-catalog-search" style={{ margin: 0, maxWidth: '380px' }}>
          <i className="bi bi-search" />
          <input
            type="text"
            placeholder="Search comment contents..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          {searchInput && (
            <button
              type="button"
              onClick={handleClearSearch}
              style={{ background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--app-muted)' }}
              title="Clear search"
            >
              <i className="bi bi-x-circle-fill" />
            </button>
          )}
        </form>

        <div className="admin-filter-bar">
          <button
            type="button"
            className={targetType === 'all' ? 'active' : ''}
            onClick={() => {
              setTargetType('all')
              setPage(1)
            }}
          >
            All sources
          </button>
          <button
            type="button"
            className={targetType === 'book' ? 'active' : ''}
            onClick={() => {
              setTargetType('book')
              setPage(1)
            }}
          >
            <i className="bi bi-book" style={{ marginRight: '4px' }} />
            Books
          </button>
          <button
            type="button"
            className={targetType === 'content' ? 'active' : ''}
            onClick={() => {
              setTargetType('content')
              setPage(1)
            }}
          >
            <i className="bi bi-headphones" style={{ marginRight: '4px' }} />
            Audio / Media
          </button>
        </div>
      </div>

      {loading ? (
        <AdminLoadingScreen label="Loading comments for moderation..." />
      ) : comments.length === 0 ? (
        <div className="admin-submissions-empty" style={{ padding: '48px 16px' }}>
          <i className="bi bi-chat-square-quote" style={{ fontSize: '36px', color: 'var(--app-muted)' }} />
          <p style={{ margin: '10px 0 0' }}>
            {searchQuery
              ? `No comments match keyword "${searchQuery}".`
              : 'No reader comments found in this category.'}
          </p>
        </div>
      ) : (
        <div className="admin-comments-list">
          {comments.map((item) => {
            const authorInitials = (item.author?.name || 'R').slice(0, 2).toUpperCase()
            const formattedDate = item.createdAt
              ? new Date(item.createdAt).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : 'Recent'

            return (
              <article key={item.id} className="admin-comment-card admin-row-fade-in">
                <div className="admin-comment-header">
                  <div className="admin-comment-author-info">
                    <span className="admin-comment-author-avatar">{authorInitials}</span>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <strong style={{ fontSize: '14px' }}>{item.author?.name || 'Reader'}</strong>
                        <span className={`admin-status status-${item.author?.role || 'draft'}`} style={{ fontSize: '11px', padding: '1px 6px' }}>
                          {item.author?.role || 'customer'}
                        </span>
                        {item.author?.isRestricted && (
                          <span className="admin-status status-hidden" style={{ fontSize: '11px', padding: '1px 6px' }}>
                            Restricted
                          </span>
                        )}
                      </div>
                      <small style={{ color: 'var(--app-muted)', fontSize: '12px' }}>
                        {item.author?.maskedEmail || item.author?.email || 'Anonymous'} · {formattedDate}
                      </small>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {item.target && (
                      <span
                        className={`admin-status ${item.target.type === 'book' ? 'status-published' : 'status-draft'}`}
                        style={{ fontSize: '12px', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={`${item.target.type === 'book' ? 'Book' : 'Media'}: ${item.target.title}`}
                      >
                        <i className={item.target.type === 'book' ? 'bi bi-book' : 'bi bi-headphones'} style={{ marginRight: '5px' }} />
                        {item.target.title}
                      </span>
                    )}

                    {onBanUser && item.author?.id && !item.author?.isRestricted && (
                      <button
                        type="button"
                        className="ghost-button"
                        style={{ padding: '4px 10px', fontSize: '12px', minHeight: '28px', color: 'var(--app-danger, #ef4444)' }}
                        onClick={() =>
                          onBanUser({
                            id: item.author.id,
                            name: item.author.name || 'Reader',
                            email: item.author.email || item.author.maskedEmail || '',
                          })
                        }
                        title={`Ban user ${item.author.name || ''}`}
                      >
                        <i className="bi bi-slash-circle" style={{ marginRight: '4px' }} />
                        Ban user
                      </button>
                    )}

                    <button
                      type="button"
                      className="danger-button"
                      style={{ padding: '4px 10px', fontSize: '12px', minHeight: '28px' }}
                      onClick={() => setDeleteTarget(item)}
                      title="Delete inappropriate comment"
                    >
                      <i className="bi bi-trash" style={{ marginRight: '4px' }} />
                      Delete
                    </button>
                  </div>
                </div>

                <p className="admin-comment-text">{item.text}</p>
              </article>
            )
          })}
        </div>
      )}

      {totalPages > 1 && (
        <AdminPagination
          currentPage={page}
          onPageChange={setPage}
          totalPages={totalPages}
        />
      )}

      {deleteTarget && (
        <DeleteCommentModal
          busy={deleteBusy}
          item={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </section>
  )
}

function DeleteBroadcastModal({ busy, item, onClose, onConfirm }) {
  if (!item) return null

  return (
    <div
      aria-labelledby="admin-delete-broadcast-title"
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
        <p className="mono-eyebrow">Remove Announcement</p>
        <h2 id="admin-delete-broadcast-title">{item.title}</h2>
        <p className="form-note">
          Are you sure you want to remove this announcement? Readers will no longer see it in their notifications list.
        </p>

        <div className="admin-form-actions">
          <button className="ghost-button" disabled={busy} onClick={onClose} type="button">
            Cancel
          </button>
          <button className="danger-button" disabled={busy} onClick={onConfirm} type="button">
            <i className="bi bi-trash" />
            {busy ? 'Removing...' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SystemBroadcastPanel({ onToast }) {
  const [broadcasts, setBroadcasts] = useState([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [audience, setAudience] = useState('all-customers')
  const [targetUserId, setTargetUserId] = useState('')
  const [targetUserQuery, setTargetUserQuery] = useState('')
  const [suggestedUsers, setSuggestedUsers] = useState([])
  const [selectedUser, setSelectedUser] = useState(null)
  const [searchingUsers, setSearchingUsers] = useState(false)
  const [sending, setSending] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [filterAudience, setFilterAudience] = useState('all')

  const loadBroadcasts = useCallback(() => {
    setLoading(true)
    apiFetch('/api/notifications/broadcasts')
      .then((data) => {
        setBroadcasts(Array.isArray(data?.broadcasts) ? data.broadcasts : [])
      })
      .catch((error) => {
        onToast?.({ type: 'error', message: error.message || 'Failed to load announcements.' })
      })
      .finally(() => {
        setLoading(false)
      })
  }, [onToast])

  useEffect(() => {
    loadBroadcasts()
  }, [loadBroadcasts])

  useEffect(() => {
    if (audience !== 'single-customer' || !targetUserQuery.trim() || selectedUser) {
      setSuggestedUsers([])
      return
    }

    const timer = setTimeout(() => {
      setSearchingUsers(true)
      apiFetch(`/api/users?role=customer&q=${encodeURIComponent(targetUserQuery.trim())}&limit=5`)
        .then((data) => {
          setSuggestedUsers(Array.isArray(data?.users) ? data.users : [])
        })
        .catch(() => {
          setSuggestedUsers([])
        })
        .finally(() => {
          setSearchingUsers(false)
        })
    }, 250)

    return () => clearTimeout(timer)
  }, [audience, targetUserQuery, selectedUser])

  function handleSelectUser(u) {
    setSelectedUser(u)
    setTargetUserId(u.id || u._id)
    setTargetUserQuery(u.name || u.email)
    setSuggestedUsers([])
  }

  function handleClearUser() {
    setSelectedUser(null)
    setTargetUserId('')
    setTargetUserQuery('')
  }

  async function handleSend(e) {
    e.preventDefault()
    if (!title.trim() || !message.trim() || sending) return

    if (audience === 'single-customer' && !targetUserId) {
      onToast?.({ type: 'error', message: 'Please select a recipient customer.' })
      return
    }

    setSending(true)
    try {
      await apiFetch('/api/notifications', {
        method: 'POST',
        body: {
          title: title.trim(),
          message: message.trim(),
          targetUserId: audience === 'single-customer' ? targetUserId : undefined,
        },
      })
      onToast?.({ type: 'success', message: 'Broadcast announcement sent successfully!' })
      setTitle('')
      setMessage('')
      setAudience('all-customers')
      handleClearUser()
      loadBroadcasts()
    } catch (error) {
      onToast?.({ type: 'error', message: error.message || 'Failed to send announcement.' })
    } finally {
      setSending(false)
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return
    setDeleteBusy(true)
    try {
      await apiFetch(`/api/notifications/${deleteTarget.id}`, { method: 'DELETE' })
      onToast?.({ type: 'success', message: 'Announcement deleted.' })
      setBroadcasts((curr) => curr.filter((item) => item.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (error) {
      onToast?.({ type: 'error', message: error.message || 'Failed to delete announcement.' })
    } finally {
      setDeleteBusy(false)
    }
  }

  const filteredBroadcasts = broadcasts.filter((item) => {
    if (filterAudience === 'all') return true
    return item.audience === filterAudience
  })

  return (
    <section className="admin-workspace">
      <div className="section-heading">
        <div>
          <p className="mono-eyebrow">User Management</p>
          <h2>System broadcast & announcements</h2>
        </div>
        <span className="admin-count-pill">{broadcasts.length} sent</span>
      </div>

      <div className="admin-broadcast-layout">
        {/* Compose Form Card */}
        <div className="admin-broadcast-card">
          <h3>
            <i className="bi bi-megaphone" style={{ color: 'var(--app-accent)' }} />
            Compose Announcement
          </h3>
          <p className="form-note" style={{ margin: 0 }}>
            Send real-time alerts or updates to readers. They will see it immediately in their header notification bell.
          </p>

          <form onSubmit={handleSend} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="form-field">
              <label htmlFor="broadcast-audience">Target Audience</label>
              <div className="admin-broadcast-audience-selector" id="broadcast-audience">
                <button
                  type="button"
                  className={`admin-broadcast-audience-btn ${audience === 'all-customers' ? 'active' : ''}`}
                  onClick={() => {
                    setAudience('all-customers')
                    handleClearUser()
                  }}
                >
                  <i className="bi bi-people" />
                  All customers
                </button>
                <button
                  type="button"
                  className={`admin-broadcast-audience-btn ${audience === 'single-customer' ? 'active' : ''}`}
                  onClick={() => setAudience('single-customer')}
                >
                  <i className="bi bi-person" />
                  Single customer
                </button>
              </div>
            </div>

            {audience === 'single-customer' && (
              <div className="form-field admin-broadcast-user-select-wrap">
                <label htmlFor="broadcast-target-user">Search Recipient</label>
                {selectedUser ? (
                  <div className="admin-broadcast-user-tag">
                    <span>
                      <i className="bi bi-person-check" style={{ marginRight: '6px' }} />
                      <strong>{selectedUser.name || 'Customer'}</strong> ({selectedUser.email || selectedUser.id})
                    </span>
                    <button
                      type="button"
                      onClick={handleClearUser}
                      style={{
                        background: 'transparent',
                        border: 0,
                        cursor: 'pointer',
                        color: 'var(--app-muted)',
                      }}
                      title="Clear selection"
                    >
                      <i className="bi bi-x-circle-fill" />
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      id="broadcast-target-user"
                      type="text"
                      placeholder="Type customer name or email..."
                      value={targetUserQuery}
                      onChange={(e) => setTargetUserQuery(e.target.value)}
                      autoComplete="off"
                    />
                    {searchingUsers && <small style={{ color: 'var(--app-muted)' }}>Searching customers...</small>}
                    {suggestedUsers.length > 0 && (
                      <div className="admin-broadcast-user-suggestions">
                        {suggestedUsers.map((u) => (
                          <div
                            key={u.id || u._id}
                            className="admin-broadcast-user-suggestion-item"
                            onClick={() => handleSelectUser(u)}
                          >
                            <strong>{u.name || 'Unnamed'}</strong>
                            <small style={{ color: 'var(--app-muted)' }}>{u.email}</small>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="form-field">
              <label htmlFor="broadcast-title">Announcement Title</label>
              <input
                id="broadcast-title"
                type="text"
                placeholder="e.g. System Maintenance Tonight, New Library Release"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={120}
              />
            </div>

            <div className="form-field">
              <label htmlFor="broadcast-message">Message</label>
              <textarea
                id="broadcast-message"
                rows={4}
                placeholder="Write your announcement details here..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                maxLength={1000}
                style={{ resize: 'vertical' }}
              />
              <small style={{ color: 'var(--app-muted)', textAlign: 'right' }}>
                {message.length} / 1000 characters
              </small>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
              <button
                type="submit"
                className="primary-button"
                disabled={sending || !title.trim() || !message.trim()}
                style={{ flex: 1 }}
              >
                <i className={sending ? 'bi bi-hourglass-split' : 'bi bi-send'} style={{ marginRight: '6px' }} />
                {sending ? 'Sending...' : 'Send Announcement'}
              </button>
              {(title || message) && (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setTitle('')
                    setMessage('')
                    handleClearUser()
                  }}
                  disabled={sending}
                >
                  Clear
                </button>
              )}
            </div>
          </form>
        </div>

        {/* History List Card */}
        <div className="admin-broadcast-card">
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
            <h3>
              <i className="bi bi-clock-history" style={{ color: 'var(--app-muted)' }} />
              Broadcast History
            </h3>

            <div className="admin-filter-bar" style={{ gap: '4px' }}>
              <button
                type="button"
                className={filterAudience === 'all' ? 'active' : ''}
                onClick={() => setFilterAudience('all')}
                style={{ minHeight: '30px', fontSize: '12px', padding: '0 8px' }}
              >
                All ({broadcasts.length})
              </button>
              <button
                type="button"
                className={filterAudience === 'all-customers' ? 'active' : ''}
                onClick={() => setFilterAudience('all-customers')}
                style={{ minHeight: '30px', fontSize: '12px', padding: '0 8px' }}
              >
                All customers
              </button>
              <button
                type="button"
                className={filterAudience === 'single-customer' ? 'active' : ''}
                onClick={() => setFilterAudience('single-customer')}
                style={{ minHeight: '30px', fontSize: '12px', padding: '0 8px' }}
              >
                Single customer
              </button>
            </div>
          </div>

          {loading ? (
            <AdminLoadingScreen label="Loading broadcast history..." />
          ) : filteredBroadcasts.length === 0 ? (
            <div className="admin-submissions-empty" style={{ padding: '36px 16px' }}>
              <i className="bi bi-megaphone" style={{ fontSize: '32px', color: 'var(--app-muted)' }} />
              <p style={{ margin: '8px 0 0' }}>
                {filterAudience === 'all'
                  ? 'No broadcast announcements sent yet.'
                  : `No announcements match the "${filterAudience}" filter.`}
              </p>
            </div>
          ) : (
            <div className="admin-broadcast-history-list">
              {filteredBroadcasts.map((item) => {
                const isAll = item.audience === 'all-customers'
                const formattedDate = item.createdAt
                  ? new Date(item.createdAt).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'Recent'

                return (
                  <article key={item.id} className="admin-broadcast-item admin-row-fade-in">
                    <div className="admin-broadcast-item-header">
                      <div className="admin-broadcast-item-meta">
                        <span className={`admin-status ${isAll ? 'status-published' : 'status-draft'}`}>
                          <i className={isAll ? 'bi bi-people' : 'bi bi-person'} style={{ marginRight: '4px' }} />
                          {isAll
                            ? 'All customers'
                            : `Direct: ${item.targetUser?.name || item.targetUser?.email || 'Customer'}`}
                        </span>
                        <span>
                          <i className="bi bi-calendar3" style={{ marginRight: '4px' }} />
                          {formattedDate}
                        </span>
                        {item.creator?.name && (
                          <span>
                            <i className="bi bi-person-badge" style={{ marginRight: '4px' }} />
                            By {item.creator.name}
                          </span>
                        )}
                        <span title="Readers who viewed this notification">
                          <i className="bi bi-eye" style={{ marginRight: '4px' }} />
                          {item.readCount || 0} read
                        </span>
                      </div>

                      <button
                        type="button"
                        className="danger-button"
                        style={{ padding: '4px 8px', fontSize: '12px', minHeight: '26px' }}
                        onClick={() => setDeleteTarget(item)}
                        title="Remove announcement"
                      >
                        <i className="bi bi-trash" style={{ marginRight: '4px' }} />
                        Remove
                      </button>
                    </div>

                    <h4 className="admin-broadcast-item-title">{item.title}</h4>
                    <p className="admin-broadcast-item-message">{item.message}</p>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {deleteTarget && (
        <DeleteBroadcastModal
          busy={deleteBusy}
          item={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleConfirmDelete}
        />
      )}
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
  const [aiSuggestLoading, setAiSuggestLoading] = useState(false)
  const [aiSuggestError, setAiSuggestError] = useState('')

  // Gutenberg's catalog has no plot description (see importCatalogBook
  // below), so the ~72k imported books all land with an empty Description
  // and often thin Subjects. This asks the backend's OpenRouter-backed
  // /ai-fill endpoint for a suggestion built from the book's own text -
  // it only fills the form fields here, nothing is saved until the admin
  // reviews it and clicks Update book like any other edit.
  async function generateWithAi() {
    setAiSuggestLoading(true)
    setAiSuggestError('')
    try {
      if (adminBook.id) {
        const data = await apiFetch(`/api/books/${adminBook.id}/ai-fill`, { method: 'POST' })
        if (data.description) updateAdminBook('description', data.description)
        if (data.subjects?.length) updateAdminBook('subjects', data.subjects.join(', '))
        if (data.readerUrl) updateAdminBook('readerUrl', data.readerUrl)
      } else {
        const data = await apiFetch('/api/books/ai-summary', {
          method: 'POST',
          body: {
            title: adminBook.title,
            author: adminBook.author,
            category: adminBook.category,
            existingDescription: adminBook.description,
            chapters: adminBook.chapters,
          },
        })
        if (data?.summary) {
          updateAdminBook('description', data.summary)
        }
      }
    } catch (error) {
      setAiSuggestError(error.message)
    } finally {
      setAiSuggestLoading(false)
    }
  }

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
    // Some Gutenberg bookshelf names carry their own site's UI chrome
    // baked in verbatim, e.g. "Browsing: History - Ancient" (that's a real
    // shelf name on gutenberg.org, not corrupted data) - strip that prefix
    // so the category reads like a normal genre label instead.
    const guessedCategory = (entry.bookshelves?.split(';')[0] || '')
      .replace(/^browsing:\s*/i, '')
      .trim()

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

  // The server now tells us this authoritatively (entry.alreadyAdded,
  // checked against the *entire* books collection - see
  // searchBookMetadata in bookMetadataController.js). Fall back to the
  // local managedBooks check only for entries that predate that field
  // (or if it's ever missing) - managedBooks itself only holds this
  // admin's first 200 pushed books, so it's not reliable on its own for a
  // 72k+ catalog.
  function isEntryAlreadyAdded(entry) {
    if (typeof entry.alreadyAdded === 'boolean') return entry.alreadyAdded
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
                <span className="admin-field-label-row">
                  Description
                  <button
                    className="ghost-button admin-ai-fill-button"
                    disabled={aiSuggestLoading}
                    onClick={generateWithAi}
                    type="button"
                  >
                    {aiSuggestLoading ? (
                      <>
                        <span className="admin-spin-small" /> Generating...
                      </>
                    ) : (
                      <>
                        <i className="bi bi-stars" /> Generate with AI
                      </>
                    )}
                  </button>
                </span>
                <textarea
                  value={adminBook.description}
                  onChange={(event) => updateAdminBook('description', event.target.value)}
                  placeholder="Short book description shown on the detail page."
                />
                {aiSuggestError && <small className="admin-field-error">{aiSuggestError}</small>}
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
  if (!book) return NONE_COVER_URL
  return book.coverUrl || book.cover_image || book.formats?.['image/jpeg'] || book.cover || NONE_COVER_URL
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

function StoriesManagementPanel({ onToast }) {
  const [stories, setStories] = useState([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteReason, setDeleteReason] = useState('Content violates community guidelines.')
  const [deleting, setDeleting] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    let ignore = false
    setLoading(true)

    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('limit', '20')
    if (typeFilter !== 'all') params.set('type', typeFilter)
    if (search.trim()) params.set('search', search.trim())

    apiFetch(`/api/admin/stories?${params.toString()}`)
      .then((data) => {
        if (!ignore) {
          setStories(Array.isArray(data?.stories) ? data.stories : [])
          setTotal(Number(data?.total) || 0)
          setPages(Number(data?.pages) || 1)
        }
      })
      .catch((err) => {
        if (!ignore) {
          setStories([])
          onToast?.({ type: 'error', message: err.message || 'Failed to load stories.' })
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })

    return () => {
      ignore = true
    }
  }, [page, typeFilter, search, refreshTick, onToast])

  function handleSearchSubmit(e) {
    e.preventDefault()
    setPage(1)
    setSearch(searchInput)
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiFetch(`/api/admin/stories/${deleteTarget.id || deleteTarget._id}`, {
        method: 'DELETE',
        body: { reason: deleteReason.trim() || 'Content violates community guidelines.' },
      })
      onToast?.({
        type: 'success',
        message: `"${deleteTarget.title}" deleted and author notified.`,
      })
      setDeleteTarget(null)
      setDeleteReason('Content violates community guidelines.')
      setRefreshTick((t) => t + 1)
    } catch (err) {
      onToast?.({ type: 'error', message: err.message || 'Could not delete story.' })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section className="admin-workspace admin-stories-panel">
      <div className="section-heading">
        <div>
          <p className="mono-eyebrow">Moderation</p>
          <h2>Stories & Audio Management</h2>
        </div>
        <span>Review community voice stories and reflections. Inappropriate submissions can be removed with automatic notification to the author.</span>
      </div>

      <div className="admin-filter-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
        <button
          className={typeFilter === 'all' ? 'active' : ''}
          onClick={() => { setTypeFilter('all'); setPage(1); }}
          type="button"
        >
          All types
        </button>
        <button
          className={typeFilter === 'audio-story' ? 'active' : ''}
          onClick={() => { setTypeFilter('audio-story'); setPage(1); }}
          type="button"
        >
          <i className="bi bi-soundwave" /> Audio stories
        </button>
        <button
          className={typeFilter === 'story' ? 'active' : ''}
          onClick={() => { setTypeFilter('story'); setPage(1); }}
          type="button"
        >
          <i className="bi bi-file-text" /> Text stories
        </button>

        <form className="admin-catalog-search" onSubmit={handleSearchSubmit} style={{ marginLeft: 'auto', maxWidth: '340px' }}>
          <i className="bi bi-search" />
          <input
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search stories, author... (Enter)"
            type="text"
            value={searchInput}
          />
        </form>
      </div>

      {loading ? (
        <p className="inline-loading"><span className="admin-spin-small" /> Loading community stories...</p>
      ) : stories.length > 0 ? (
        <div className="admin-table admin-stories-table">
          <div className="admin-table-heading">
            <h2>Stories ({total})</h2>
          </div>
          <div className="admin-table-body">
            {stories.map((story) => {
              const sId = story.id || story._id
              const isAudio = story.type === 'audio-story'
              return (
                <div className="table-row admin-story-row" key={sId}>
                  <div className="admin-story-main-col" style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    {story.coverUrl && (
                      <img
                        alt=""
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                        }}
                        src={story.coverUrl}
                        style={{ width: '64px', height: '40px', objectFit: 'cover', borderRadius: '4px', flexShrink: 0, border: '1px solid #e2e8f0' }}
                      />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong>{story.title}</strong>
                      <p className="admin-story-excerpt">{story.content}</p>
                      {isAudio && story.audioUrl && (
                        <div className="admin-story-audio-inline">
                          <audio controls preload="none" src={story.audioUrl} style={{ height: '32px', width: '280px' }} />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="admin-story-meta-col">
                    <div className="admin-story-author">
                      <span className="admin-sidebar-avatar" style={{ width: '28px', height: '28px', fontSize: '11px' }}>
                        {story.author?.avatar ? <img alt="" src={story.author.avatar} /> : (story.authorName || 'R')[0].toUpperCase()}
                      </span>
                      <div>
                        <strong>{story.authorName || 'Anonymous'}</strong>
                        <small>{story.author?.email ? maskEmail(story.author.email) : (story.author?.displayId || 'User')}</small>
                      </div>
                    </div>
                    <div className="admin-story-stats">
                      <span><i className="bi bi-heart" /> {story.likesCount || 0}</span>
                      <span><i className="bi bi-eye" /> {story.views || 0}</span>
                      <small>{new Date(story.createdAt).toLocaleDateString()}</small>
                    </div>
                  </div>

                  <div className="admin-row-actions">
                    <button
                      className="danger-button"
                      onClick={() => setDeleteTarget(story)}
                      type="button"
                    >
                      <i className="bi bi-trash" /> Remove
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {pages > 1 && (
            <AdminPagination
              currentPage={page}
              onPageChange={setPage}
              totalPages={pages}
            />
          )}
        </div>
      ) : (
        <p className="empty-state">No stories found matching your filter criteria.</p>
      )}

      {deleteTarget && (
        <DeleteStoryModal
          busy={deleting}
          item={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleConfirmDelete}
          reason={deleteReason}
          setReason={setDeleteReason}
        />
      )}
    </section>
  )
}

function DeleteStoryModal({ busy, item, onClose, onConfirm, reason, setReason }) {
  if (!item) return null

  return (
    <div
      aria-labelledby="admin-delete-story-title"
      aria-modal="true"
      className="confirmation-dialog-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
      role="dialog"
    >
      <div className="confirmation-dialog-card" style={{ maxWidth: '480px' }}>
        <button aria-label="Close" className="confirmation-dialog-close" disabled={busy} onClick={onClose} type="button">
          <i className="bi bi-x-lg" />
        </button>
        <div className="confirmation-dialog-icon danger">
          <i className="bi bi-trash3-fill" />
        </div>
        <div className="confirmation-dialog-header">
          <span className="confirmation-dialog-eyebrow">Moderation Action</span>
          <h2 id="admin-delete-story-title">Remove Community Story</h2>
        </div>
        <div className="confirmation-dialog-body" style={{ margin: '10px 0 16px' }}>
          <p>
            Are you sure you want to permanently delete <strong>"{item.title}"</strong> by <em>{item.authorName || 'Author'}</em>?
          </p>

          <label style={{ display: 'block', margin: '14px 0 6px', fontSize: '13px', fontWeight: 600 }}>
            Removal Reason (sent to author in notification)
            <textarea
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this story was removed..."
              rows={3}
              style={{ width: '100%', marginTop: '6px', resize: 'vertical' }}
              value={reason}
            />
          </label>
        </div>

        <div className="confirmation-dialog-footer">
          <button className="ghost-button confirmation-cancel-btn" disabled={busy} onClick={onClose} type="button">
            Cancel
          </button>
          <button className="danger-button confirmation-confirm-btn" disabled={busy} onClick={onConfirm} type="button">
            <i className="bi bi-trash" />
            <span>{busy ? 'Removing & Notifying...' : 'Remove Story'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default AdminPage
