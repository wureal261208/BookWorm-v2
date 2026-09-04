import { useEffect, useMemo, useState } from 'react'
import { getAuthor, getCategory, getDescription, getReaderUrl } from '../../utils/bookUtils'
import { getTotalPages } from '../../utils/chapterUtils'
import { normalizeRole } from '../../data/bookData'
import { apiFetch } from '../../utils/apiClient'
import { maskEmail } from '../../utils/maskEmail'

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
  { id: 'incomplete', label: 'Missing info' },
]

function AdminPage({
  account,
  addManagedBook,
  adminBook,
  books,
  editManagedBook,
  managedBooks,
  managedBooksError,
  removeManagedBook,
  resetAdminBook,
  setAdminBook,
  staff,
  users,
  onBanUser,
  onUnbanUser,
  onRefreshStaff,
}) {
  const role = normalizeRole(account?.role)
  const isAdmin = role === 'admin'
  const isManager = role === 'manager'
  const isEmployee = role === 'employee'

  const canPushBooks = isAdmin || isEmployee
  const canManageUsers = isAdmin || isManager

  const availableSections = [
    canPushBooks && 'book',
    canManageUsers && 'team',
  ].filter(Boolean)

  const [activeAdminSection, setActiveAdminSection] = useState(availableSections[0] || 'book')
  const [userTab, setUserTab] = useState(isAdmin ? 'manager' : 'employee')
  const [bookFilter, setBookFilter] = useState('all')
  const [showPreview, setShowPreview] = useState(false)
  const [showBookModal, setShowBookModal] = useState(false)
  const [banTarget, setBanTarget] = useState(null)
  const [banBusyId, setBanBusyId] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteBusyId, setDeleteBusyId] = useState('')
  const [managerPrefill, setManagerPrefill] = useState({ name: '', email: '' })
  const [employeePrefill, setEmployeePrefill] = useState({ name: '', email: '' })

  const sectionBooks = useMemo(
    () => [...managedBooks].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)),
    [managedBooks],
  )
  const publishedBooks = sectionBooks.filter((book) => (book.status || 'draft') === 'published').length
  const detailReadyBooks = sectionBooks.filter((book) => !getBookWarnings(book).some((warning) => warning.id === 'description')).length
  const readerReadyBooks = sectionBooks.filter((book) => isReaderReady(book)).length
  const currentErrors = getFormErrors(adminBook, managedBooks)
  const currentWarnings = getFormWarnings(adminBook)
  const previewBook = useMemo(() => createPreviewBook(adminBook), [adminBook])
  const filteredManagedBooks = sectionBooks.filter((book) => {
    if (bookFilter === 'draft') return book.status === 'draft'
    if (bookFilter === 'published') return (book.status || 'draft') === 'published'
    if (bookFilter === 'incomplete') return getBookWarnings(book).length > 0
    return true
  })

  const managerAccounts = staff.filter((item) => item.role === 'manager' && !item.isResigned)
  const employeeAccounts = staff.filter((item) => item.role === 'employee' && !item.isResigned)
  const customerAccounts = users.filter((item) => normalizeRole(item.role) === 'customer')
  const lockedCustomers = customerAccounts.filter((item) => item.isRestricted).length
  const userTabsAvailable = isAdmin ? ['manager', 'employee', 'customer'] : ['employee', 'customer']
  const userTabLabels = { manager: 'Managers', employee: 'Employees', customer: 'Customers' }

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

  const [staffActionError, setStaffActionError] = useState('')
  const [staffActionBusy, setStaffActionBusy] = useState('')
  const [newStaffCredential, setNewStaffCredential] = useState(null)

  // Every staff mutation goes through the backend (which checks the
  // caller's real role from MongoDB) and returns the updated record.
  // onRefreshStaff() re-fetches GET /api/users afterwards so the table
  // reflects the change - there's no realtime listener anymore.
  function createStaffAccount(staffRole) {
    return async function submit(event) {
      event.preventDefault()
      const form = new FormData(event.currentTarget)
      const name = (form.get('name') || '').trim()
      const email = (form.get('email') || '').trim().toLowerCase()
      if (!name || !email) return

      setStaffActionError('')
      setNewStaffCredential(null)
      setStaffActionBusy(email)
      try {
        const data = await apiFetch('/api/users/upsert-by-email', { method: 'PATCH', body: { name, email, role: staffRole } })
        if (data.temporaryPassword) {
          setNewStaffCredential({ email, password: data.temporaryPassword })
        }
        await onRefreshStaff()
        event.currentTarget.reset()
      } catch (error) {
        setStaffActionError(error.message)
      } finally {
        setStaffActionBusy('')
      }
    }
  }

  async function resignStaffAccount(member) {
    if (!member?.id) {
      setStaffActionError('This account was created before the account-management update - ask an admin to resign it from MongoDB directly.')
      return
    }
    setStaffActionError('')
    setStaffActionBusy(member.email)
    try {
      await apiFetch(`/api/users/${member.id}/resign`, { method: 'PATCH' })
      await onRefreshStaff()
    } catch (error) {
      setStaffActionError(error.message)
    } finally {
      setStaffActionBusy('')
    }
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
    if (saved) setShowBookModal(false)
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

  return (
    <div className="admin-page">
      <section className="page-title admin-title">
        <div>
          <p className="mono-eyebrow">Management</p>
          <h1>BookWorm management</h1>
        </div>
        <div className="admin-title-side">
          <p>
            Manage the books, reader content, access rules, and team accounts that directly affect the main BookWorm site.
          </p>
        </div>
      </section>

      <div className="admin-sticky-switcher">
        {availableSections.length > 1 ? (
          <div
            className="admin-section-tabs"
            role="tablist"
            aria-label="Management sections"
            style={{ gridTemplateColumns: `repeat(${availableSections.length}, 1fr)` }}
          >
            {availableSections.includes('book') && (
              <button className={activeAdminSection === 'book' ? 'active' : ''} onClick={() => setActiveAdminSection('book')} type="button">
                <i className="bi bi-journal-plus" />
                Push Book
              </button>
            )}
            {availableSections.includes('team') && (
              <button className={activeAdminSection === 'team' ? 'active' : ''} onClick={() => setActiveAdminSection('team')} type="button">
                <i className="bi bi-people" />
                Users
              </button>
            )}
          </div>
        ) : (
          <div className="admin-section-tabs" style={{ gridTemplateColumns: '1fr' }}>
            <button className="active" disabled type="button">
              <i className={canPushBooks ? 'bi bi-journal-plus' : 'bi bi-people'} />
              {canPushBooks ? 'Push Book' : 'Users'}
            </button>
          </div>
        )}
      </div>

      {activeAdminSection === 'book' && canPushBooks ? (
        <>
          <div className="metrics admin-metrics">
            <article><strong>{books.length}</strong><span>Books on main</span></article>
            <article><strong>{publishedBooks}</strong><span>Published in this shelf</span></article>
            <article><strong>{detailReadyBooks}</strong><span>Detail ready</span></article>
            <article><strong>{readerReadyBooks}</strong><span>Reader ready</span></article>
          </div>

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
                <button className={bookFilter === filter.id ? 'active' : ''} key={filter.id} onClick={() => setBookFilter(filter.id)} type="button">
                  {filter.label}
                </button>
              ))}
            </div>

            <div className="admin-two-col">
              <section className="admin-table">
                <h2>Books</h2>
                {filteredManagedBooks.length ? (
                  filteredManagedBooks.map((book) => {
                    // Some rows can come back from Mongo without the `id`
                    // virtual populated (e.g. a document touched outside the
                    // API) - `_id` is the raw Mongo id and is always present,
                    // so fall back to it everywhere an id is needed. Without
                    // this, rows with no id at all would collide on the same
                    // React key and visually overlap.
                    const bookId = book.id || book._id
                    const missingId = !bookId

                    return (
                      <div className="table-row admin-book-row" key={bookId || book.title}>
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
                  })
                ) : (
                  <p>No books match this filter.</p>
                )}
              </section>

              <section className="admin-table admin-guidelines">
                <h2>Main site checklist</h2>
                <div className="admin-check-row">
                  <i className="bi bi-house" />
                  <span>Home needs title, cover, category, and author.</span>
                </div>
                <div className="admin-check-row">
                  <i className="bi bi-journal-text" />
                  <span>Detail needs description, language, and subjects. Chapters are optional.</span>
                </div>
                <div className="admin-check-row">
                  <i className="bi bi-book" />
                  <span>Reader needs reader URL, full reader text, or chapter content.</span>
                </div>
              </section>
            </div>
          </section>
        </>
      ) : null}

      {activeAdminSection === 'team' && canManageUsers ? (
        <>
          <div className="metrics admin-metrics">
            <article><strong>{managerAccounts.length}</strong><span>Managers</span></article>
            <article><strong>{employeeAccounts.length}</strong><span>Employees</span></article>
            <article><strong>{customerAccounts.length}</strong><span>Customers</span></article>
            <article><strong>{lockedCustomers}</strong><span>Locked customers</span></article>
          </div>

          <section className="admin-workspace">
            <div className="section-heading">
              <div>
                <p className="mono-eyebrow">Team access</p>
                <h2>Users</h2>
              </div>
              <span>{isAdmin ? 'Manage managers, employees, and customers' : 'Manage employees and customers'}</span>
            </div>

            <div className="admin-filter-bar" aria-label="User type">
              {userTabsAvailable.map((tab) => (
                <button className={userTab === tab ? 'active' : ''} key={tab} onClick={() => setUserTab(tab)} type="button">
                  {userTabLabels[tab]}
                </button>
              ))}
            </div>

            {staffActionError && (
              <p className="admin-validation-error"><i className="bi bi-x-circle" /> {staffActionError}</p>
            )}
            {newStaffCredential && (
              <div className="admin-validation-panel" aria-live="polite">
                <strong>Account created</strong>
                <span>
                  <i className="bi bi-key" />
                  {newStaffCredential.email} - one-time password: <code>{newStaffCredential.password}</code>
                </span>
                <span>Share this with them directly. It is only shown once and won&apos;t be stored anywhere.</span>
                <button className="ghost-button" onClick={() => setNewStaffCredential(null)} type="button">Dismiss</button>
              </div>
            )}

            {userTab === 'manager' && isAdmin && (
              <>
                <ExistingAccountPicker onPick={(user) => setManagerPrefill({ name: user.name, email: user.email })} />
                <form className="admin-form compact-form" key={managerPrefill.email} onSubmit={createStaffAccount('manager')}>
                  <p className="form-note">
                    Creating a manager generates a one-time password shown to you once, valid for their first login. Managers assign employees to a Push Book shelf and manage customer access.
                  </p>
                  <label>Name<input defaultValue={managerPrefill.name} name="name" placeholder="Manager name" required /></label>
                  <label>Email<input defaultValue={managerPrefill.email} name="email" placeholder="manager@bookworm.com" required type="email" /></label>
                  <button className="primary-button" disabled={staffActionBusy !== ''} type="submit">Create manager</button>
                </form>

                <section className="admin-table staff-table">
                  <h2>Manager accounts</h2>
                  {managerAccounts.length ? (
                    managerAccounts.map((member) => (
                      <div className="table-row" key={member.email}>
                        <span>
                          {member.name}
                          {member.displayId && <em className="admin-display-id">{member.displayId}</em>}
                        </span>
                        <small>{maskEmail(member.email)}</small>
                        <div className="admin-row-actions">
                          {isAdmin && (
                            <button
                              className="ghost-button"
                              disabled={staffActionBusy === member.email}
                              onClick={() => resignStaffAccount(member)}
                              type="button"
                            >
                              {staffActionBusy === member.email ? 'Working...' : 'Resign'}
                            </button>
                          )}
                          <button
                            className="ghost-button"
                            disabled={staffActionBusy === member.email}
                            onClick={() => removeStaffAccount(member)}
                            type="button"
                          >
                            {staffActionBusy === member.email ? 'Removing...' : 'Remove'}
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p>No manager accounts yet.</p>
                  )}
                </section>
              </>
            )}

            {userTab === 'employee' && (
              <>
                <ExistingAccountPicker onPick={(user) => setEmployeePrefill({ name: user.name, email: user.email })} />
                <form className="admin-form compact-form" key={employeePrefill.email} onSubmit={createStaffAccount('employee')}>
                  <p className="form-note">
                    Creating an employee generates a one-time password shown to you once, valid for their first login.
                  </p>
                  <label>Name<input defaultValue={employeePrefill.name} name="name" placeholder="Employee name" required /></label>
                  <label>Email<input defaultValue={employeePrefill.email} name="email" placeholder="employee@bookworm.com" required type="email" /></label>
                  <button className="primary-button" disabled={staffActionBusy !== ''} type="submit">Create employee</button>
                </form>

                <section className="admin-table staff-table">
                  <h2>Employee accounts</h2>
                  {employeeAccounts.length ? (
                    employeeAccounts.map((member) => (
                      <div className="table-row" key={member.email}>
                        <span>
                          {member.name}
                          {member.displayId && <em className="admin-display-id">{member.displayId}</em>}
                        </span>
                        <small>{maskEmail(member.email)}</small>
                        <div className="admin-row-actions">
                          <button
                            className="ghost-button"
                            disabled={staffActionBusy === member.email}
                            onClick={() => resignStaffAccount(member)}
                            type="button"
                          >
                            {staffActionBusy === member.email ? 'Working...' : 'Resign'}
                          </button>
                          <button
                            className="ghost-button"
                            disabled={staffActionBusy === member.email}
                            onClick={() => removeStaffAccount(member)}
                            type="button"
                          >
                            {staffActionBusy === member.email ? 'Removing...' : 'Remove'}
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p>No employee accounts yet.</p>
                  )}
                </section>
              </>
            )}

            {userTab === 'customer' && (
              <section className="admin-table staff-table">
                <h2>Customer accounts</h2>
                <p className="form-note">Customers create their own account from Login. Ban an account to block their login, with a reason and a length of time.</p>
                {customerAccounts.length ? (
                  customerAccounts.map((user) => (
                    <div className="table-row" key={user.email}>
                      <span>
                        {user.name}
                        {user.displayId && <em className="admin-display-id">{user.displayId}</em>}
                      </span>
                      <small>{maskEmail(user.email)}</small>
                      <div className="admin-row-actions">
                        <em
                          className={`admin-status ${user.isRestricted ? 'status-hidden' : 'status-published'}`}
                          title={
                            user.isRestricted
                              ? `${user.banExpiresAt ? `Until ${new Date(user.banExpiresAt).toLocaleDateString()}` : 'Permanent'} - ${user.banReason || 'No reason given'}`
                              : undefined
                          }
                        >
                          {user.isRestricted ? 'Banned' : 'Active'}
                        </em>
                        {user.isRestricted ? (
                          <button
                            className="unban-button"
                            disabled={banBusyId === user.id}
                            onClick={() => handleUnban(user)}
                            type="button"
                          >
                            {banBusyId === user.id ? 'Unbanning...' : 'Unban'}
                          </button>
                        ) : (
                          <button className="danger-button" onClick={() => setBanTarget(user)} type="button">
                            Ban
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p>No customers recorded yet.</p>
                )}
              </section>
            )}
          </section>
        </>
      ) : null}

      {showBookModal && (
        <BookFormModal
          adminBook={adminBook}
          currentErrors={currentErrors}
          currentWarnings={currentWarnings}
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
                  {catalogResults.map((entry) => (
                    <li key={entry.etextNumber}>
                      <button className="admin-search-result" onClick={() => importCatalogBook(entry)} type="button">
                        <img
                          alt=""
                          onError={(event) => handleGutenbergCoverError(event, entry.etextNumber)}
                          src={entry.etextNumber ? `https://www.gutenberg.org/cache/epub/${entry.etextNumber}/pg${entry.etextNumber}.cover.medium.jpg` : NONE_COVER_URL}
                        />
                        <span>
                          <strong>{entry.title || 'Untitled'}</strong>
                          <small>{entry.authors || 'Unknown author'} - Gutenberg #{entry.etextNumber}</small>
                        </span>
                        <i className="bi bi-arrow-right-circle" />
                      </button>
                    </li>
                  ))}
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
