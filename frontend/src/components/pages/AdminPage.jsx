import { useMemo, useState } from 'react'
import { getAuthor, getCategory, getDescription, getReaderUrl } from '../../utils/bookUtils'
import { getBookChapters, getTotalPages } from '../../utils/chapterUtils'
import { normalizeRole } from '../../data/bookData'
import { apiFetch } from '../../utils/apiClient'
import { formatDeliveryDate } from '../../utils/rentalUtils'
import { maskEmail } from '../../utils/maskEmail'

const identityFields = [
  { name: 'title', label: 'Title', placeholder: 'Book title' },
  { name: 'author', label: 'Author', placeholder: 'Author name' },
  { name: 'category', label: 'Category', placeholder: 'Fantasy fiction' },
]

const mediaFields = [
  { name: 'readerUrl', label: 'Reader URL', placeholder: 'https://...', type: 'url' },
]

const NONE_COVER_URL = 'https://icons.veryicon.com/png/o/miscellaneous/myicon-1/none-1.png'

const languageChoices = [
  { value: 'en', label: 'English', disabled: false },
  { value: 'vi', label: 'Vietnamese - Coming soon', disabled: true },
  { value: 'jp', label: 'Japanese - Coming soon', disabled: true },
]

const accessChoices = [
  { value: 'read', label: 'To Read - free to open' },
  { value: 'rent', label: 'To Rent - needs a rental' },
]

const usageTypeChoices = [
  { value: 'none', label: 'None' },
  { value: 'read', label: 'Read' },
  { value: 'rent', label: 'Rent' },
  { value: 'both', label: 'Both' },
]

const adminBookFilters = [
  { id: 'all', label: 'All books' },
  { id: 'reader-ready', label: 'Ready for Reader' },
  { id: 'missing-cover', label: 'Missing Cover' },
  { id: 'missing-chapters', label: 'Missing Chapters' },
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
  onToggleUserLock,
  onDecideRentalRequest,
  rentalRequests = [],
}) {
  const role = normalizeRole(account?.role)
  const isAdmin = role === 'admin'
  const isManager = role === 'manager'
  const isEmployee = role === 'employee'

  const myEmail = (account?.email || '').toLowerCase()
  const myStaffRecord = staff.find((item) => (item.email || '').toLowerCase() === myEmail)
  const mySection = myStaffRecord?.section === 'rent' ? 'rent' : 'read'

  const canPushBooks = isAdmin || isEmployee
  const canManageUsers = isAdmin || isManager
  const canSyncCatalog = isAdmin
  const canReviewRequests = isAdmin || isManager
  const availableBookSections = isAdmin ? ['read', 'rent'] : isEmployee ? [mySection] : []

  const availableSections = [
    canPushBooks && 'book',
    canManageUsers && 'team',
    canReviewRequests && 'requests',
    canSyncCatalog && 'sync',
  ].filter(Boolean)

  const [activeAdminSection, setActiveAdminSection] = useState(availableSections[0] || 'book')
  const [bookAccess, setBookAccess] = useState(availableBookSections[0] || 'read')
  const [userTab, setUserTab] = useState(isAdmin ? 'manager' : 'employee')
  const [bookFilter, setBookFilter] = useState('all')
  const [showPreview, setShowPreview] = useState(false)
  const [catalogQuery, setCatalogQuery] = useState('')
  const [catalogResults, setCatalogResults] = useState([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState('')
  const [managerPrefill, setManagerPrefill] = useState({ name: '', email: '' })
  const [employeePrefill, setEmployeePrefill] = useState({ name: '', email: '' })

  const sectionBooks = useMemo(
    () => managedBooks.filter((book) => (book.access === 'rent' ? 'rent' : 'read') === bookAccess),
    [managedBooks, bookAccess],
  )
  const publishedBooks = sectionBooks.filter((book) => (book.status || 'published') === 'published').length
  const detailReadyBooks = sectionBooks.filter((book) => !getBookWarnings(book).some((warning) => warning.id === 'description')).length
  const readerReadyBooks = sectionBooks.filter((book) => isReaderReady(book)).length
  const currentErrors = getFormErrors(adminBook, managedBooks)
  const currentWarnings = getFormWarnings(adminBook)
  const previewBook = useMemo(() => createPreviewBook(adminBook), [adminBook])
  const filteredManagedBooks = sectionBooks.filter((book) => {
    if (bookFilter === 'reader-ready') return isReaderReady(book)
    if (bookFilter === 'missing-cover') return !hasCover(book)
    if (bookFilter === 'missing-chapters') return !hasChapters(book)
    return true
  })

  const managerAccounts = staff.filter((item) => item.role === 'manager')
  const pendingRequests = rentalRequests.filter((item) => item.status === 'pending')
  const decidedRequests = rentalRequests.filter((item) => item.status !== 'pending').slice(0, 20)
  const employeeAccounts = staff.filter((item) => item.role === 'employee')
  const customerAccounts = users.filter((item) => normalizeRole(item.role) === 'customer')
  const lockedCustomers = customerAccounts.filter((item) => item.locked).length
  const userTabsAvailable = isAdmin ? ['manager', 'employee', 'customer'] : ['employee', 'customer']
  const userTabLabels = { manager: 'Managers', employee: 'Employees', customer: 'Customers' }

  function selectBookAccess(value) {
    setBookAccess(value)
    if (!adminBook.id) updateAdminBook('access', value)
  }

  function updateAdminBook(name, value) {
    setAdminBook({ ...adminBook, [name]: value })
  }

  function updateChapter(index, field, value) {
    const chapters = adminBook.chaptersDraft?.length ? adminBook.chaptersDraft : [createEmptyChapter(0)]
    setAdminBook({
      ...adminBook,
      chaptersDraft: chapters.map((chapter, chapterIndex) => (
        chapterIndex === index ? { ...chapter, [field]: value } : chapter
      )),
    })
  }

  function addChapter() {
    const chapters = adminBook.chaptersDraft?.length ? adminBook.chaptersDraft : []
    setAdminBook({
      ...adminBook,
      chaptersDraft: [...chapters, createEmptyChapter(chapters.length)],
    })
  }

  function removeChapter(index) {
    const chapters = adminBook.chaptersDraft?.length ? adminBook.chaptersDraft : [createEmptyChapter(0)]
    setAdminBook({
      ...adminBook,
      chaptersDraft: chapters.length === 1 ? [createEmptyChapter(0)] : chapters.filter((_, chapterIndex) => chapterIndex !== index),
    })
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

  // Every staff mutation now goes through the backend (which checks the
  // caller's real role from MongoDB, not the client-readable Firestore
  // copy) and the backend mirrors the result back into Firestore itself.
  // We deliberately do NOT touch local `staff` state here - the realtime
  // onSnapshot listener will pick up the backend's write, and the
  // Firestore rule for bookwormData/global now rejects any client write
  // that changes the `staff` field directly.
  function createStaffAccount(staffRole) {
    return async function submit(event) {
      event.preventDefault()
      const form = new FormData(event.currentTarget)
      const name = (form.get('name') || '').trim()
      const email = (form.get('email') || '').trim().toLowerCase()
      if (!name || !email) return

      const section = staffRole === 'employee' ? (form.get('section') === 'rent' ? 'rent' : 'read') : null
      setStaffActionError('')
      setNewStaffCredential(null)
      setStaffActionBusy(email)
      try {
        const data = await apiFetch('/api/users/upsert-by-email', { method: 'PATCH', body: { name, email, role: staffRole, section } })
        if (data.temporaryPassword) {
          setNewStaffCredential({ email, password: data.temporaryPassword })
        }
        event.currentTarget.reset()
      } catch (error) {
        setStaffActionError(error.message)
      } finally {
        setStaffActionBusy('')
      }
    }
  }

  async function updateEmployeeSection(email, section) {
    const member = staff.find((item) => item.email === email)
    if (!member) return
    setStaffActionError('')
    setStaffActionBusy(email)
    try {
      await apiFetch('/api/users/upsert-by-email', { method: 'PATCH', body: { name: member.name, email, role: 'employee', section } })
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
    } catch (error) {
      setStaffActionError(error.message)
    } finally {
      setStaffActionBusy('')
    }
  }

  function handleBookSubmit(event) {
    if (currentErrors.length) {
      event.preventDefault()
      return
    }

    addManagedBook(event)
  }

  async function searchCatalog(event) {
    event.preventDefault()
    if (!catalogQuery.trim()) return

    setCatalogLoading(true)
    setCatalogError('')
    try {
      const data = await apiFetch(`/api/books/catalog-search?q=${encodeURIComponent(catalogQuery.trim())}`)
      setCatalogResults(data.books || [])
    } catch (error) {
      setCatalogError(error.message)
    } finally {
      setCatalogLoading(false)
    }
  }

  function importCatalogBook(book) {
    setAdminBook({
      ...adminBook,
      title: book.title || adminBook.title,
      author: book.author || adminBook.author,
      category: book.category || adminBook.category,
      subjects: book.subjects?.length ? book.subjects.join(', ') : adminBook.subjects,
      description: book.description || adminBook.description,
      cover: book.cover || adminBook.cover,
      readerUrl: book.readerUrl || adminBook.readerUrl,
      language: 'en',
      access: bookAccess,
    })
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
            {availableSections.includes('requests') && (
              <button className={activeAdminSection === 'requests' ? 'active' : ''} onClick={() => setActiveAdminSection('requests')} type="button">
                <i className="bi bi-bell" />
                Rental Requests
                {pendingRequests.length > 0 && <span className="tab-count-badge">{pendingRequests.length}</span>}
              </button>
            )}
            {availableSections.includes('sync') && (
              <button className={activeAdminSection === 'sync' ? 'active' : ''} onClick={() => setActiveAdminSection('sync')} type="button">
                <i className="bi bi-arrow-repeat" />
                Catalog Sync
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

          <section className="admin-workspace">
            <div className="section-heading">
              <div>
                <p className="mono-eyebrow">Push Book</p>
                <h2>{adminBook.id ? 'Edit book' : 'Push new book'}</h2>
              </div>
              <span>{bookAccess === 'read' ? 'To Read - open to every reader, no rental needed' : 'To Rent - readers unlock this with a rental'}</span>
            </div>
            {managedBooksError && (
              <p className="admin-validation-error"><i className="bi bi-x-circle" /> {managedBooksError}</p>
            )}

            <div className="admin-choice-grid admin-choice-grid-2" role="tablist" aria-label="Push Book shelf">
              {availableBookSections.length === 2 ? accessChoices.map((choice) => (
                <button
                  className={bookAccess === choice.value ? 'active' : ''}
                  key={choice.value}
                  onClick={() => selectBookAccess(choice.value)}
                  type="button"
                >
                  {choice.label}
                </button>
              )) : accessChoices.map((choice) => (
                <button
                  className={bookAccess === choice.value ? 'active' : ''}
                  disabled={!availableBookSections.includes(choice.value)}
                  key={choice.value}
                  type="button"
                >
                  {choice.label}
                </button>
              ))}
            </div>
            {isEmployee && (
              <p className="form-note">
                You only manage the <strong>{mySection === 'read' ? 'To Read' : 'To Rent'}</strong> shelf. Ask a manager or admin to move you to the other one.
              </p>
            )}

            <div className="admin-import-panel">
              <div className="section-heading">
                <div>
                  <p className="mono-eyebrow">MongoDB catalog - 75k+ books</p>
                  <h2>Import instead of typing</h2>
                </div>
                <span>Search your synced Gutenberg catalog and prefill the form below in one click.</span>
              </div>
              <form className="admin-form compact-form" onSubmit={searchCatalog}>
                <label className="wide-field">
                  Search by title
                  <input
                    onChange={(event) => setCatalogQuery(event.target.value)}
                    placeholder="Pride and Prejudice"
                    value={catalogQuery}
                  />
                </label>
                <button className="primary-button" disabled={catalogLoading} type="submit">
                  <i className="bi bi-search" />
                  {catalogLoading ? 'Searching...' : 'Search catalog'}
                </button>
              </form>
              {catalogError && <p className="settings-error">{catalogError}</p>}
              {catalogResults.length > 0 && (
                <section className="admin-table staff-table">
                  {catalogResults.map((book) => (
                    <div className="table-row" key={book._id}>
                      <span>{book.title}</span>
                      <small>{book.author} - Gutenberg #{book.gutenbergId || 'n/a'}</small>
                      <div className="admin-row-actions">
                        <button className="ghost-button" onClick={() => importCatalogBook(book)} type="button">
                          Use this book
                        </button>
                      </div>
                    </div>
                  ))}
                </section>
              )}
            </div>

            <div className="admin-validation-panel" aria-live="polite">
              <strong>{currentErrors.length ? 'Cannot push yet' : currentWarnings.length ? 'Ready with notes' : 'Ready checklist'}</strong>
              {currentErrors.length ? (
                currentErrors.map((error) => (
                  <span className="admin-validation-error" key={error.id}>
                    <i className="bi bi-x-circle" />
                    {error.message}
                  </span>
                ))
              ) : currentWarnings.length ? (
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

            <form className="admin-form admin-book-form" onSubmit={handleBookSubmit}>
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
                    onError={(event) => {
                      event.currentTarget.src = NONE_COVER_URL
                    }}
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
                <label className="wide-field">
                  Reader text
                  <textarea
                    value={adminBook.readerText}
                    onChange={(event) => updateAdminBook('readerText', event.target.value)}
                    placeholder="Optional full plain book text. Chapter content below is preferred."
                  />
                </label>
              </fieldset>

              <fieldset className="admin-chapter-fieldset">
                <legend>Chapters</legend>
                <div className="admin-chapter-list">
                  {(adminBook.chaptersDraft?.length ? adminBook.chaptersDraft : [createEmptyChapter(0)]).map((chapter, index) => (
                    <article className="admin-chapter-editor" key={`${index}-${chapter.title}`}>
                      <div className="admin-chapter-heading">
                        <strong>Chapter {index + 1}</strong>
                        <button className="ghost-button" onClick={() => removeChapter(index)} type="button">Remove</button>
                      </div>
                      <label>
                        Title
                        <input
                          value={chapter.title}
                          onChange={(event) => updateChapter(index, 'title', event.target.value)}
                          placeholder={`Chapter ${index + 1}`}
                        />
                      </label>
                      <label>
                        Pages
                        <input
                          min="1"
                          type="number"
                          value={chapter.pages}
                          onChange={(event) => updateChapter(index, 'pages', event.target.value)}
                        />
                      </label>
                      <label className="wide-field">
                        Content
                        <textarea
                          value={chapter.content}
                          onChange={(event) => updateChapter(index, 'content', event.target.value)}
                          placeholder="Paste this chapter content..."
                        />
                      </label>
                    </article>
                  ))}
                </div>
                <button className="ghost-button admin-add-chapter" onClick={addChapter} type="button">
                  <i className="bi bi-plus-circle" />
                  Add chapter
                </button>
              </fieldset>

              <div className="admin-form-actions">
                <button className="ghost-button" onClick={() => setShowPreview(true)} type="button">
                  <i className="bi bi-eye" />
                  Preview as Detail
                </button>
                {adminBook.id && (
                  <button className="ghost-button" onClick={resetAdminBook} type="button">
                    Cancel edit
                  </button>
                )}
                <button className="primary-button" disabled={currentErrors.length > 0} type="submit">
                  <i className="bi bi-cloud-upload" />
                  {adminBook.id ? 'Update book' : `Push to ${bookAccess === 'read' ? 'To Read' : 'To Rent'}`}
                </button>
              </div>
            </form>

            <div className="admin-filter-bar" aria-label="Filter admin books">
              {adminBookFilters.map((filter) => (
                <button className={bookFilter === filter.id ? 'active' : ''} key={filter.id} onClick={() => setBookFilter(filter.id)} type="button">
                  {filter.label}
                </button>
              ))}
            </div>

            <div className="admin-two-col">
              <section className="admin-table">
                <h2>{bookAccess === 'read' ? 'To Read shelf' : 'To Rent shelf'}</h2>
                {filteredManagedBooks.length ? (
                  filteredManagedBooks.map((book) => {
                    const totalPages = getTotalPages(book)
                    const chapters = getBookChapters(book, totalPages)
                    const warnings = getBookWarnings(book)

                    return (
                      <div className="table-row admin-book-row" key={book.id}>
                        <img
                          src={getAdminCover(book)}
                          alt=""
                          onError={(event) => {
                            event.currentTarget.src = NONE_COVER_URL
                          }}
                        />
                        <span>
                          {book.title}
                          <em className={`admin-status status-${book.status || 'published'}`}>{book.status || 'published'}</em>
                        </span>
                        <small>{getAuthor(book)} - {getCategory(book)} - {chapters.length} chapters</small>
                        <div className="admin-row-actions">
                          {warnings.length > 0 && <strong>{warnings.length} warnings</strong>}
                          <button className="ghost-button" onClick={() => editManagedBook(book)} type="button">Edit</button>
                          <button className="ghost-button" onClick={() => removeManagedBook(book.id)} type="button">Remove</button>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <p>No books match this filter on this shelf.</p>
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
                  <span>Detail needs description, pages, chapters, language, and subjects.</span>
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
                        <span>{member.name}</span>
                        <small>{maskEmail(member.email)}</small>
                        <div className="admin-row-actions">
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
                    Creating an employee generates a one-time password shown to you once, valid for their first login. Pick one Push Book shelf - employees only manage that shelf.
                  </p>
                  <label>Name<input defaultValue={employeePrefill.name} name="name" placeholder="Employee name" required /></label>
                  <label>Email<input defaultValue={employeePrefill.email} name="email" placeholder="employee@bookworm.com" required type="email" /></label>
                  <label>
                    Shelf
                    <select defaultValue="read" name="section">
                      <option value="read">To Read</option>
                      <option value="rent">To Rent</option>
                    </select>
                  </label>
                  <button className="primary-button" disabled={staffActionBusy !== ''} type="submit">Create employee</button>
                </form>

                <section className="admin-table staff-table">
                  <h2>Employee accounts</h2>
                  {employeeAccounts.length ? (
                    employeeAccounts.map((member) => (
                      <div className="table-row" key={member.email}>
                        <span>{member.name}</span>
                        <small>{maskEmail(member.email)}</small>
                        <div className="admin-row-actions">
                          <select
                            disabled={staffActionBusy === member.email}
                            onChange={(event) => updateEmployeeSection(member.email, event.target.value)}
                            value={member.section === 'rent' ? 'rent' : 'read'}
                          >
                            <option value="read">To Read</option>
                            <option value="rent">To Rent</option>
                          </select>
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
                <p className="form-note">Customers create their own account from Login. Lock an account to flag it for review.</p>
                {customerAccounts.length ? (
                  customerAccounts.map((user) => (
                    <div className="table-row" key={user.email}>
                      <span>{user.name}</span>
                      <small>{maskEmail(user.email)}</small>
                      <div className="admin-row-actions">
                        <em className={`admin-status ${user.locked ? 'status-hidden' : 'status-published'}`}>
                          {user.locked ? 'locked' : 'active'}
                        </em>
                        <button className="ghost-button" onClick={() => onToggleUserLock(user.email)} type="button">
                          {user.locked ? 'Unlock' : 'Lock'}
                        </button>
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

      {activeAdminSection === 'requests' && canReviewRequests ? (
        <RentalRequestsPanel decidedRequests={decidedRequests} onDecide={onDecideRentalRequest} pendingRequests={pendingRequests} />
      ) : null}

      {activeAdminSection === 'sync' && canSyncCatalog ? <CatalogSyncPanel /> : null}

      {showPreview && <AdminDetailPreview book={previewBook} onClose={() => setShowPreview(false)} />}
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
        Search for someone who already has an account (synced via Catalog Sync) instead of typing a brand new person.
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

function RentalRequestsPanel({ decidedRequests, onDecide, pendingRequests }) {
  const [draftByRequest, setDraftByRequest] = useState({})

  function updateDraft(requestId, field, value) {
    setDraftByRequest((current) => ({
      ...current,
      [requestId]: { ...current[requestId], [field]: value },
    }))
  }

  function approve(request) {
    const draft = draftByRequest[request.id] || {}
    if (!draft.deliveryAt) return
    onDecide?.(request.id, { status: 'approved', deliveryAt: new Date(draft.deliveryAt).toISOString(), responseNote: draft.note || '' })
  }

  function decline(request) {
    const draft = draftByRequest[request.id] || {}
    onDecide?.(request.id, { status: 'declined', responseNote: draft.note || '' })
  }

  return (
    <section className="admin-workspace">
      <div className="section-heading">
        <div>
          <p className="mono-eyebrow">Rentals</p>
          <h2>Rental requests</h2>
        </div>
        <span>Approve a request with a delivery date and time, or decline it - the customer gets notified either way.</span>
      </div>

      <section className="admin-table staff-table">
        <h2>Pending ({pendingRequests.length})</h2>
        {pendingRequests.length ? (
          pendingRequests.map((request) => (
            <div className="table-row request-review-row" key={request.id}>
              <span>
                {request.bookTitle}
                <em className="admin-status status-draft">pending</em>
              </span>
              <small>
                {request.customerName} ({request.customerEmail}) - requested {new Date(request.requestedAt).toLocaleString()}
                <br />
                <i className="bi bi-person" /> {request.recipientName || '-'} - <i className="bi bi-telephone" /> {request.phone || '-'}
                <br />
                <i className="bi bi-geo-alt" /> {request.address || '-'} - <i className="bi bi-cash-coin" /> Cash on delivery
                {request.note && <> - "{request.note}"</>}
              </small>
              <div className="admin-row-actions request-decision-actions">
                <input
                  aria-label="Delivery date and time"
                  onChange={(event) => updateDraft(request.id, 'deliveryAt', event.target.value)}
                  type="datetime-local"
                  value={draftByRequest[request.id]?.deliveryAt || ''}
                />
                <button className="primary-button" disabled={!draftByRequest[request.id]?.deliveryAt} onClick={() => approve(request)} type="button">
                  Approve
                </button>
                <button className="ghost-button" onClick={() => decline(request)} type="button">
                  Decline
                </button>
              </div>
            </div>
          ))
        ) : (
          <p>No pending requests right now.</p>
        )}
      </section>

      {decidedRequests.length > 0 && (
        <section className="admin-table staff-table">
          <h2>Recent decisions</h2>
          {decidedRequests.map((request) => (
            <div className="table-row" key={request.id}>
              <span>{request.bookTitle}</span>
              <small>
                {request.customerEmail}
                {request.status === 'approved' && request.deliveryAt && <> - {formatDeliveryDate(request.deliveryAt)}</>}
              </small>
              <div className="admin-row-actions">
                <em className={`admin-status ${request.status === 'approved' ? 'status-published' : 'status-hidden'}`}>{request.status}</em>
              </div>
            </div>
          ))}
        </section>
      )}
    </section>
  )
}

function CatalogSyncPanel() {
  const [status, setStatus] = useState(null)
  const [statusError, setStatusError] = useState('')
  const [checking, setChecking] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [migrationResult, setMigrationResult] = useState(null)

  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [tagBusyId, setTagBusyId] = useState('')

  async function checkStatus() {
    setChecking(true)
    setStatusError('')
    try {
      const data = await apiFetch('/api/migrate/status')
      setStatus(data)
    } catch (error) {
      setStatusError(error.message)
    } finally {
      setChecking(false)
    }
  }

  async function runMigration() {
    setMigrating(true)
    setMigrationResult(null)
    setStatusError('')
    try {
      const data = await apiFetch('/api/migrate/run', { method: 'POST' })
      setMigrationResult(data.summary)
      checkStatus()
    } catch (error) {
      setStatusError(error.message)
    } finally {
      setMigrating(false)
    }
  }

  async function searchCatalog(event) {
    event.preventDefault()
    setSearching(true)
    setSearchError('')
    try {
      const data = await apiFetch(`/api/books?q=${encodeURIComponent(query)}`)
      setSearchResults(data.books || [])
    } catch (error) {
      setSearchError(error.message)
    } finally {
      setSearching(false)
    }
  }

  async function tagBook(id, usageType) {
    setTagBusyId(id)
    try {
      await apiFetch(`/api/books/${id}/usage-type`, { method: 'PATCH', body: { usageType } })
      setSearchResults((current) => current.map((book) => (book._id === id ? { ...book, usageType } : book)))
    } catch (error) {
      setSearchError(error.message)
    } finally {
      setTagBusyId('')
    }
  }

  return (
    <section className="admin-workspace">
      <div className="section-heading">
        <div>
          <p className="mono-eyebrow">MongoDB</p>
          <h2>Catalog sync</h2>
        </div>
        <span>Move BookWorm's Firebase data into MongoDB, and tag imported books with a usage type.</span>
      </div>

      <div className="admin-validation-panel" aria-live="polite">
        <strong>Connection status</strong>
        {status ? (
          <>
            <span>
              <i className={`bi ${status.mongoConnected ? 'bi-check-circle' : 'bi-x-circle'}`} />
              MongoDB: {status.mongoConnected ? 'connected' : 'not connected'}
            </span>
            <span>
              <i className="bi bi-info-circle" />
              {status.counts.users} users, {status.counts.books} books in Mongo right now.
            </span>
            <span>
              <i className="bi bi-signpost" />
              {status.recommendation === 'run-migration' && 'Mongo is empty - run the migration to pull data from Firebase.'}
              {status.recommendation === 'use-mongo-directly' && 'Mongo already has data - safe to use it directly.'}
              {status.recommendation === 'mongo-unavailable' && 'Mongo is not reachable right now - check MONGODB_URI on the server.'}
            </span>
          </>
        ) : (
          <span>Press "Check connection" to see whether the app should keep using Firebase or switch to MongoDB.</span>
        )}
        {statusError && (
          <span className="admin-validation-error">
            <i className="bi bi-x-circle" />
            {statusError}
          </span>
        )}
      </div>

      <div className="admin-form-actions">
        <button className="ghost-button" disabled={checking} onClick={checkStatus} type="button">
          <i className="bi bi-arrow-repeat" />
          {checking ? 'Checking...' : 'Check connection'}
        </button>
        <button className="primary-button" disabled={migrating} onClick={runMigration} type="button">
          <i className="bi bi-cloud-arrow-up" />
          {migrating ? 'Migrating...' : 'Migrate Firebase -> MongoDB'}
        </button>
      </div>

      {migrationResult && (
        <div className="admin-validation-panel" aria-live="polite">
          <strong>Migration finished</strong>
          <span><i className="bi bi-check-circle" />{migrationResult.usersUpserted} users upserted.</span>
          <span><i className="bi bi-check-circle" />{migrationResult.booksUpserted} books upserted.</span>
          {migrationResult.errors?.length > 0 && (
            <span className="admin-validation-warning">
              <i className="bi bi-exclamation-circle" />
              {migrationResult.errors.length} rows skipped - open the browser console/network tab for details.
            </span>
          )}
        </div>
      )}

      <div className="section-heading">
        <div>
          <p className="mono-eyebrow">MongoDB books</p>
          <h2>Tag a book's usage type</h2>
        </div>
        <span>Search the "books" collection and set read / rent / both / none.</span>
      </div>

      <form className="admin-form compact-form" onSubmit={searchCatalog}>
        <label className="wide-field">
          Search by title
          <input onChange={(event) => setQuery(event.target.value)} placeholder="The Declaration of Independence" value={query} />
        </label>
        <button className="primary-button" disabled={searching} type="submit">
          <i className="bi bi-search" />
          {searching ? 'Searching...' : 'Search'}
        </button>
      </form>
      {searchError && <p className="settings-error">{searchError}</p>}

      <section className="admin-table staff-table">
        {searchResults.length ? (
          searchResults.map((book) => (
            <div className="table-row" key={book._id}>
              <span>{book.title || book.Title || 'Untitled'}</span>
              <small>{book.author || book.Authors || 'Unknown author'}</small>
              <div className="admin-row-actions">
                <select
                  disabled={tagBusyId === book._id}
                  onChange={(event) => tagBook(book._id, event.target.value)}
                  value={book.usageType || 'none'}
                >
                  {usageTypeChoices.map((choice) => (
                    <option key={choice.value} value={choice.value}>{choice.label}</option>
                  ))}
                </select>
              </div>
            </div>
          ))
        ) : (
          <p>No results yet - search above to tag books.</p>
        )}
      </section>
    </section>
  )
}

function AdminDetailPreview({ book, onClose }) {
  const totalPages = getTotalPages(book)
  const chapters = getBookChapters(book, totalPages)

  return (
    <div className="reader-modal-backdrop admin-preview-backdrop" role="dialog" aria-modal="true" aria-labelledby="admin-preview-title">
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
            <span>{chapters.length} chapters</span>
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
  const chapters = normalizePreviewChapters(adminBook.chaptersDraft)

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
    pageCount: chapters.reduce((total, chapter) => total + chapter.pages, 0) || 120,
    chapterCount: chapters.length || 1,
    chapterList: chapters,
    formats: {
      ...(adminBook.cover.trim() ? { 'image/jpeg': adminBook.cover.trim() } : {}),
      ...(adminBook.readerUrl.trim() ? { 'text/html': adminBook.readerUrl.trim() } : {}),
    },
  }
}

function getAdminCover(book) {
  return book.formats?.['image/jpeg'] || book.cover || NONE_COVER_URL
}

function normalizePreviewChapters(chapters = []) {
  let startPage = 1
  return (chapters.length ? chapters : [createEmptyChapter(0)]).map((chapter, index) => {
    const pages = Number(chapter.pages) > 0 ? Math.floor(Number(chapter.pages)) : 1
    const nextChapter = {
      number: index + 1,
      title: chapter.title?.trim() || `Chapter ${index + 1}`,
      startPage,
      pages,
      content: chapter.content || '',
    }
    startPage += pages
    return nextChapter
  })
}

function getFormWarnings(book) {
  const errors = new Set(getFormErrors(book).map((error) => error.id))

  return [
    !book.subjects?.split(',').some((subject) => hasText(subject)) && {
      id: 'subjects',
      message: 'Add subjects to make Discover filtering better.',
    },
    !book.chaptersDraft?.some((chapter) => hasText(chapter.content)) && hasText(book.readerUrl) && {
      id: 'chapter-content',
      message: 'Reader can open the URL, but pasted chapter content gives the best in-app reading page.',
    },
  ].filter(Boolean).filter((warning) => !errors.has(warning.id))
}

function getFormErrors(book, managedBooks = []) {
  const duplicateTitle = managedBooks.some((managedBook) => (
    managedBook.id !== book.id && managedBook.title?.trim().toLowerCase() === book.title.trim().toLowerCase()
  ))

  return [
    !hasText(book.title) && { id: 'title', message: 'Add a title.' },
    duplicateTitle && { id: 'duplicate-title', message: 'A managed book already uses this title.' },
    !hasText(book.author) && { id: 'author', message: 'Add an author.' },
    !hasText(book.category) && { id: 'category', message: 'Choose a category or shelf.' },
    !hasText(book.cover) && { id: 'cover', message: 'Add a cover URL or upload a cover image.' },
    !isValidImageSource(book.cover) && { id: 'cover-url', message: 'Cover must be an http(s) image URL or an uploaded image.' },
    !hasText(book.description) && { id: 'description', message: 'Add a description for the detail page.' },
    !hasReaderSource(book) && { id: 'reader', message: 'Add a reader URL, full reader text, or chapter content.' },
    hasText(book.readerUrl) && !isValidHttpUrl(book.readerUrl) && { id: 'reader-url', message: 'Reader URL must start with http:// or https://.' },
    !hasValidChapterDraft(book) && { id: 'chapters', message: 'Add at least one chapter with a title and page count above 0.' },
  ].filter(Boolean)
}

function getBookWarnings(book) {
  return [
    !hasCover(book) && { id: 'cover' },
    !hasText(book.description) && { id: 'description' },
    !isReaderReady(book) && { id: 'reader' },
    !hasChapters(book) && { id: 'chapters' },
  ].filter(Boolean)
}

function createEmptyChapter(index) {
  return { title: `Chapter ${index + 1}`, pages: '10', content: '' }
}

function hasText(value) {
  return String(value || '').trim().length > 0
}

function hasCover(book) {
  return Boolean(book.formats?.['image/jpeg'] || book.cover)
}

function hasChapters(book) {
  return Boolean(book.chapterCount || book.chapterList?.length || book.chapters?.length)
}

function isReaderReady(book) {
  return Boolean(getReaderUrl(book) || book.readerText || book.chapterList?.some((chapter) => chapter.content))
}

function hasReaderSource(book) {
  return Boolean(hasText(book.readerUrl) || hasText(book.readerText) || book.chaptersDraft?.some((chapter) => hasText(chapter.content)))
}

function hasValidChapterDraft(book) {
  return Boolean(book.chaptersDraft?.some((chapter) => hasText(chapter.title) && Number(chapter.pages) > 0))
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
