import { useEffect, useState } from 'react'
import { auth } from '../../features/auth-firebase/firebaseConfig'
import { apiFetch } from '../../utils/apiClient'

const emptyChapter = () => ({ title: '', content: '' })

const emptyForm = {
  title: '',
  author: '',
  description: '',
  category: '',
  language: 'en',
  coverUrl: '',
  chapters: [emptyChapter()],
}

// Phase 1, per Wun's call: a straightforward form + chapter list calling
// the POST /api/books endpoint that already exists and already lets a
// customer submit (see backend/controllers/bookController.js - it was
// already open to the 'customer' role, just had no frontend). Lands as
// status:'draft', reviewed through the existing Book Management panel -
// no new admin UI needed.
//
// Scoped out of this phase on purpose (see the project-plan conversation):
// editing/adding chapters to a book after it's been submitted (the
// existing PATCH /api/books/:id is staff-only), a rich text editor (plain
// textareas for now), and draft preview inside the real reader before
// submitting. All real, named trade-offs, not oversights.
function WritePage({ account, onDetail }) {
  const isGuest = !auth.currentUser
  const [tab, setTab] = useState('write')
  const [form, setForm] = useState(() => ({ ...emptyForm, author: account?.name || '' }))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [myBooks, setMyBooks] = useState([])
  const [loadingMine, setLoadingMine] = useState(false)

  function loadMine() {
    setLoadingMine(true)
    apiFetch('/api/books/mine')
      .then((data) => setMyBooks(Array.isArray(data.books) ? data.books : []))
      .catch((err) => setError(err.message))
      .finally(() => setLoadingMine(false))
  }

  useEffect(() => {
    if (tab === 'mine' && !isGuest) loadMine()
  }, [tab, isGuest])

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function updateChapter(index, field, value) {
    setForm((current) => ({
      ...current,
      chapters: current.chapters.map((chapter, chapterIndex) => (chapterIndex === index ? { ...chapter, [field]: value } : chapter)),
    }))
  }

  function addChapter() {
    setForm((current) => ({ ...current, chapters: [...current.chapters, emptyChapter()] }))
  }

  function removeChapter(index) {
    setForm((current) => ({ ...current, chapters: current.chapters.filter((_, chapterIndex) => chapterIndex !== index) }))
  }

  function moveChapter(index, direction) {
    setForm((current) => {
      const target = index + direction
      if (target < 0 || target >= current.chapters.length) return current
      const chapters = [...current.chapters]
      ;[chapters[index], chapters[target]] = [chapters[target], chapters[index]]
      return { ...current, chapters }
    })
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    setSuccess('')

    const title = form.title.trim()
    const author = form.author.trim()
    const chapters = form.chapters
      .map((chapter, index) => ({ order: index + 1, title: chapter.title.trim() || `Chapter ${index + 1}`, content: chapter.content.trim() }))
      .filter((chapter) => chapter.content)

    if (!title || !author) {
      setError('Title and author are required.')
      return
    }
    if (!chapters.length) {
      setError('At least one chapter needs some content.')
      return
    }

    setSubmitting(true)
    try {
      await apiFetch('/api/books', {
        method: 'POST',
        body: {
          title,
          author,
          description: form.description.trim(),
          category: form.category.trim(),
          language: form.language.trim() || 'en',
          coverUrl: form.coverUrl.trim(),
          chapters,
        },
      })
      setSuccess('Submitted! An admin will review it before it goes live.')
      setForm({ ...emptyForm, author })
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (isGuest) {
    return (
      <div className="write-page">
        <div className="section-heading">
          <div>
            <p className="mono-eyebrow">Write</p>
            <h2>Write your own book</h2>
          </div>
        </div>
        <p className="empty-state">Log in to start writing.</p>
      </div>
    )
  }

  return (
    <div className="write-page">
      <div className="section-heading">
        <div>
          <p className="mono-eyebrow">Write</p>
          <h2>Write your own book</h2>
        </div>
      </div>

      <div className="community-form-row write-page-tabs">
        <button className={tab === 'write' ? 'active' : ''} onClick={() => setTab('write')} type="button">
          Write
        </button>
        <button className={tab === 'mine' ? 'active' : ''} onClick={() => setTab('mine')} type="button">
          My books
        </button>
      </div>

      {tab === 'write' ? (
        <form className="community-form" onSubmit={submit}>
          <div className="community-form-row">
            <label>
              Title
              <input onChange={(event) => updateField('title', event.target.value)} type="text" value={form.title} />
            </label>
            <label>
              Author name
              <input onChange={(event) => updateField('author', event.target.value)} type="text" value={form.author} />
            </label>
          </div>
          <label>
            Description
            <textarea onChange={(event) => updateField('description', event.target.value)} value={form.description} />
          </label>
          <div className="community-form-row">
            <label>
              Category
              <input onChange={(event) => updateField('category', event.target.value)} type="text" value={form.category} />
            </label>
            <label>
              Language
              <input onChange={(event) => updateField('language', event.target.value)} type="text" value={form.language} />
            </label>
          </div>
          <label>
            Cover image link (optional)
            <input onChange={(event) => updateField('coverUrl', event.target.value)} type="url" value={form.coverUrl} />
          </label>

          <h3>Chapters</h3>
          <div className="write-page-chapters">
            {form.chapters.map((chapter, index) => (
              <div className="write-page-chapter" key={index}>
                <div className="write-page-chapter-header">
                  <strong>Chapter {index + 1}</strong>
                  <div className="write-page-chapter-actions">
                    <button disabled={index === 0} onClick={() => moveChapter(index, -1)} type="button">
                      <i className="bi bi-arrow-up" />
                    </button>
                    <button disabled={index === form.chapters.length - 1} onClick={() => moveChapter(index, 1)} type="button">
                      <i className="bi bi-arrow-down" />
                    </button>
                    <button disabled={form.chapters.length === 1} onClick={() => removeChapter(index)} type="button">
                      <i className="bi bi-trash" />
                    </button>
                  </div>
                </div>
                <input
                  onChange={(event) => updateChapter(index, 'title', event.target.value)}
                  placeholder={`Chapter ${index + 1} title (optional)`}
                  type="text"
                  value={chapter.title}
                />
                <textarea
                  className="write-page-chapter-content"
                  onChange={(event) => updateChapter(index, 'content', event.target.value)}
                  placeholder="Write this chapter here..."
                  value={chapter.content}
                />
              </div>
            ))}
          </div>
          <button className="ghost-button" onClick={addChapter} type="button">
            <i className="bi bi-plus-lg" /> Add chapter
          </button>

          {error && <p className="admin-validation-error"><i className="bi bi-x-circle" /> {error}</p>}
          {success && <p className="community-success"><i className="bi bi-check-circle" /> {success}</p>}

          <button className="primary-button" disabled={submitting} type="submit">
            {submitting ? 'Submitting...' : 'Submit for review'}
          </button>
        </form>
      ) : loadingMine ? (
        <p className="inline-loading"><span className="admin-spin-small" /> Loading...</p>
      ) : myBooks.length ? (
        <div className="community-submissions-list">
          {myBooks.map((book) => (
            <button
              className="table-row community-submission-row write-page-mine-row"
              disabled={book.status !== 'published'}
              key={book.id}
              onClick={() => book.status === 'published' && onDetail?.(book)}
              type="button"
            >
              <span>
                {book.title}
                <em className={`admin-status status-${book.status}`}>{book.status}</em>
              </span>
              <small>{book.status === 'published' ? 'Tap to view' : 'Waiting on admin review'}</small>
            </button>
          ))}
        </div>
      ) : (
        <p className="empty-state">You haven't submitted a book yet.</p>
      )}
    </div>
  )
}

export default WritePage
