import { useEffect, useRef, useState } from 'react'
import { auth } from '../../features/auth-firebase/firebaseConfig'
import { apiFetch } from '../../utils/apiClient'
import { renderLiteMarkdown } from '../../utils/liteMarkdown'

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

const AUTOSAVE_DELAY_MS = 800

// Phase 1 (write + submit) + Phase 2 (edit/add chapters afterward) +
// Phase 3 (draft autosave, preview, light formatting), per Wun's call.
//
// Phase 3 specifically:
// - Draft autosave is localStorage-only for now, not synced to the
//   account/server - it's a "don't lose your work if the tab closes"
//   safety net, not a cross-device draft system. Keyed separately for a
//   new book vs. editing a specific existing one, so switching between
//   them never clobbers the other's autosave.
// - Formatting is a deliberately tiny, SAFE markdown subset (**bold**,
//   *italic* only - see utils/liteMarkdown.js) rendered at exactly one
//   point in the real reader (ReaderFrame.jsx), chosen specifically so it
//   never touches ReaderPage.jsx's existing character-count-based
//   pagination - that logic still runs on raw text completely unchanged,
//   for this book and for the ~75k already in the catalog. A full rich
//   text editor (headings, lists, etc.) would need that pagination logic
//   itself reworked to be format-aware, which is a much bigger, riskier
//   change than this phase takes on.
// - Preview renders chapters in the same typography as the real reader
//   (reusing ReaderFrame's own CSS classes) but is its own simple view,
//   not the actual ReaderPage - that page is wired to a real saved book id
//   (checkpoints, favorites, comments), none of which makes sense for text
//   that hasn't been submitted yet.
function WritePage({ account, onDetail }) {
  const isGuest = !auth.currentUser
  const [tab, setTab] = useState(() => {
    if (typeof window !== 'undefined') {
      const paramTab = new URLSearchParams(window.location.search).get('tab')
      if (paramTab === 'mine') return 'mine'
    }
    return 'write'
  })
  const [form, setForm] = useState(() => ({ ...emptyForm, author: account?.name || '' }))
  const [editingBook, setEditingBook] = useState(null) // { id, status } | null
  const [loadingEdit, setLoadingEdit] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [myBooks, setMyBooks] = useState([])
  const [loadingMine, setLoadingMine] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)
  const [draftPrompt, setDraftPrompt] = useState(null) // { form, savedAt } | null
  const [deleteConfirmBook, setDeleteConfirmBook] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [aiSummarizing, setAiSummarizing] = useState(false)
  const [aiSummaryError, setAiSummaryError] = useState('')
  const textareaRefs = useRef({})
  const autosaveTimer = useRef(null)
  const skipNextAutosave = useRef(true) // don't autosave the very first render

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const paramTab = new URLSearchParams(window.location.search).get('tab')
      if (paramTab === 'mine') setTab('mine')
    }
  }, [])

  async function handleDeleteBook() {
    if (!deleteConfirmBook) return
    const bId = deleteConfirmBook.id || deleteConfirmBook._id
    setDeleting(true)
    setError('')
    try {
      await apiFetch(`/api/books/${bId}/mine`, { method: 'DELETE' })
      setMyBooks((prev) => prev.filter((b) => (b.id || b._id) !== bId))
      try {
        localStorage.removeItem(`bookworm_write_draft_edit_${bId}`)
      } catch {}
      setSuccess(`"${deleteConfirmBook.title}" has been deleted.`)
      setDeleteConfirmBook(null)
    } catch (err) {
      setError(err.message || 'Could not delete book')
    } finally {
      setDeleting(false)
    }
  }

  async function generateAiSummary() {
    setAiSummarizing(true)
    setAiSummaryError('')
    try {
      const data = await apiFetch('/api/books/ai-summary', {
        method: 'POST',
        body: {
          title: form.title,
          author: form.author,
          category: form.category,
          existingDescription: form.description,
          chapters: form.chapters,
        },
      })
      if (data?.summary) {
        updateField('description', data.summary)
      }
    } catch (err) {
      setAiSummaryError(err.message || 'Could not generate summary')
    } finally {
      setAiSummarizing(false)
    }
  }

  const draftKey = editingBook ? `bookworm_write_draft_edit_${editingBook.id}` : 'bookworm_write_draft_new'

  // Checks for a saved draft under the CURRENT key (new-book vs this
  // specific edit) whenever that key changes - e.g. switching into edit
  // mode checks that book's own autosave, not the new-book one.
  useEffect(() => {
    skipNextAutosave.current = true
    try {
      const raw = localStorage.getItem(draftKey)
      if (raw) setDraftPrompt(JSON.parse(raw))
      else setDraftPrompt(null)
    } catch {
      setDraftPrompt(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey])

  // Debounced autosave - skips the render right after a restore/discard/
  // load-for-edit so it doesn't immediately re-save the same thing it just
  // read.
  useEffect(() => {
    if (skipNextAutosave.current) {
      skipNextAutosave.current = false
      return undefined
    }
    window.clearTimeout(autosaveTimer.current)
    autosaveTimer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify({ form, savedAt: new Date().toISOString() }))
      } catch {
        // Storage can be unavailable (private mode, quota) - losing
        // autosave silently is better than breaking the writing flow.
      }
    }, AUTOSAVE_DELAY_MS)
    return () => window.clearTimeout(autosaveTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, draftKey])

  function restoreDraft() {
    skipNextAutosave.current = true
    setForm(draftPrompt.form)
    setDraftPrompt(null)
  }

  function discardDraft() {
    try {
      localStorage.removeItem(draftKey)
    } catch {
      // ignore
    }
    setDraftPrompt(null)
  }

  function clearDraftAfterSave() {
    try {
      localStorage.removeItem(draftKey)
    } catch {
      // ignore
    }
  }

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

  // Wraps the textarea's current selection in **bold**/*italic* markers
  // (or inserts them at the cursor if nothing's selected) and restores
  // focus/selection afterward, so formatting doesn't interrupt typing flow.
  function wrapSelection(index, marker) {
    const textarea = textareaRefs.current[index]
    if (!textarea) return

    const { selectionStart, selectionEnd, value } = textarea
    const selected = value.slice(selectionStart, selectionEnd) || 'text'
    const newValue = value.slice(0, selectionStart) + marker + selected + marker + value.slice(selectionEnd)
    updateChapter(index, 'content', newValue)

    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(selectionStart + marker.length, selectionStart + marker.length + selected.length)
    })
  }

  async function startEdit(book) {
    setError('')
    setSuccess('')
    setLoadingEdit(true)
    setTab('write')
    setPreviewMode(false)
    try {
      const data = await apiFetch(`/api/books/${book.id}`)
      const fullBook = data.book
      skipNextAutosave.current = true
      setEditingBook({ id: fullBook.id, status: fullBook.status })
      setForm({
        title: fullBook.title || '',
        author: fullBook.author || '',
        description: fullBook.description || '',
        category: fullBook.category || '',
        language: fullBook.language || 'en',
        coverUrl: fullBook.coverUrl || '',
        chapters: (fullBook.chapters?.length ? fullBook.chapters : [emptyChapter()])
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((chapter) => ({ title: chapter.title || '', content: chapter.content || '' })),
      })
    } catch (err) {
      setError(err.message)
      setTab('mine')
    } finally {
      setLoadingEdit(false)
    }
  }

  function cancelEdit() {
    skipNextAutosave.current = true
    setEditingBook(null)
    setForm({ ...emptyForm, author: account?.name || '' })
    setError('')
    setSuccess('')
    setPreviewMode(false)
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

    const body = {
      title,
      author,
      description: form.description.trim(),
      category: form.category.trim(),
      language: form.language.trim() || 'en',
      coverUrl: form.coverUrl.trim(),
      chapters,
    }

    setSubmitting(true)
    try {
      if (editingBook) {
        const data = await apiFetch(`/api/books/${editingBook.id}/mine`, { method: 'PATCH', body })
        setSuccess(editingBook.status === 'published' ? 'Saved - sent back for admin review before it goes live again.' : 'Saved.')
        setEditingBook({ id: editingBook.id, status: data.book.status })
      } else {
        await apiFetch('/api/books', { method: 'POST', body })
        setSuccess('Submitted! An admin will review it before it goes live.')
        skipNextAutosave.current = true
        setForm({ ...emptyForm, author })
      }
      clearDraftAfterSave()
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
        loadingEdit ? (
          <p className="inline-loading"><span className="admin-spin-small" /> Loading book...</p>
        ) : (
          <>
            {draftPrompt && (
              <p className="write-page-editing-banner">
                <i className="bi bi-clock-history" /> You have an unsaved draft from {new Date(draftPrompt.savedAt).toLocaleString()}.
                <button onClick={restoreDraft} type="button">
                  Restore
                </button>
                <button onClick={discardDraft} type="button">
                  Discard
                </button>
              </p>
            )}

            {editingBook && (
              <p className="write-page-editing-banner">
                <i className="bi bi-pencil-square" /> Editing an existing book.
                {editingBook.status === 'published' && ' Saving will send it back for admin review before the new version goes live.'}
                <button onClick={cancelEdit} type="button">
                  Cancel
                </button>
              </p>
            )}

            <div className="community-form-row write-page-tabs">
              <button className={!previewMode ? 'active' : ''} onClick={() => setPreviewMode(false)} type="button">
                <i className="bi bi-pencil" /> Edit
              </button>
              <button className={previewMode ? 'active' : ''} onClick={() => setPreviewMode(true)} type="button">
                <i className="bi bi-eye" /> Preview
              </button>
            </div>

            {previewMode ? (
              <BookPreview form={form} />
            ) : (
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
                  <span className="admin-field-label-row">
                    Description
                    <button
                      className="ghost-button admin-ai-fill-button"
                      disabled={aiSummarizing}
                      onClick={generateAiSummary}
                      type="button"
                    >
                      {aiSummarizing ? (
                        <>
                          <span className="admin-spin-small" /> Summarizing...
                        </>
                      ) : (
                        <>
                          <i className="bi bi-stars" /> Summarize with AI
                        </>
                      )}
                    </button>
                  </span>
                  <textarea
                    onChange={(event) => updateField('description', event.target.value)}
                    placeholder="Write a synopsis or click 'Summarize with AI' after adding your chapters."
                    value={form.description}
                  />
                  {aiSummaryError && <small className="admin-validation-error">{aiSummaryError}</small>}
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
                      <div className="write-page-format-toolbar">
                        <button onClick={() => wrapSelection(index, '**')} title="Bold" type="button">
                          <i className="bi bi-type-bold" />
                        </button>
                        <button onClick={() => wrapSelection(index, '*')} title="Italic" type="button">
                          <i className="bi bi-type-italic" />
                        </button>
                      </div>
                      <textarea
                        className="write-page-chapter-content"
                        onChange={(event) => updateChapter(index, 'content', event.target.value)}
                        placeholder="Write this chapter here... select text and use the Bold/Italic buttons above to format it."
                        ref={(el) => {
                          textareaRefs.current[index] = el
                        }}
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
                  {submitting ? 'Saving...' : editingBook ? 'Save changes' : 'Submit for review'}
                </button>
              </form>
            )}
          </>
        )
      ) : loadingMine ? (
        <p className="inline-loading"><span className="admin-spin-small" /> Loading...</p>
      ) : myBooks.length ? (
        <div className="community-submissions-list">
          {myBooks.map((book) => {
            const bookId = book.id || book._id
            const isHidden = book.status === 'hidden'
            const hasRejection = Boolean(book.rejectionReason)

            return (
              <div className="community-submission-card write-page-mine-card" key={bookId}>
                <div className="table-row community-submission-row write-page-mine-row">
                  <span
                    onClick={() => book.status === 'published' && onDetail?.(book)}
                    style={book.status === 'published' ? { cursor: 'pointer' } : undefined}
                  >
                    {book.title}
                    <em className={`admin-status status-${book.status || 'draft'}`}>
                      {isHidden ? 'Rejected / Ignored' : book.status || 'draft'}
                    </em>
                  </span>
                  <small>
                    {book.status === 'published'
                      ? 'Published & visible in catalog'
                      : isHidden
                      ? 'Ignored by admin (see note below)'
                      : 'Waiting on admin review'}
                  </small>
                  <div className="admin-row-actions">
                    <button className="edit-button" onClick={() => startEdit(book)} type="button">
                      <i className="bi bi-pencil-square" /> Edit
                    </button>
                    <button
                      className="danger-button write-delete-btn"
                      onClick={() => setDeleteConfirmBook(book)}
                      type="button"
                    >
                      <i className="bi bi-trash" /> Delete
                    </button>
                  </div>
                </div>

                {(isHidden || hasRejection) && (
                  <div className="author-rejection-note">
                    <div className="rejection-note-header">
                      <i className="bi bi-exclamation-triangle-fill" />
                      <strong>Admin note:</strong>
                    </div>
                    <p>{book.rejectionReason || 'Admin ignored or rejected this book. You can edit content and re-submit anytime.'}</p>
                    <span className="rejection-note-hint">Tip: Click "Edit" above to revise your content and re-submit for admin review.</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <p className="empty-state">You haven't submitted a book yet.</p>
      )}

      {deleteConfirmBook && (
        <div
          aria-labelledby="delete-authored-title"
          aria-modal="true"
          className="reader-modal-backdrop admin-book-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleting) setDeleteConfirmBook(null)
          }}
          role="dialog"
        >
          <div className="admin-book-modal write-delete-modal" style={{ maxWidth: '440px', width: '92%' }}>
            <header className="admin-book-modal-header">
              <div>
                <p className="mono-eyebrow">Confirm Deletion</p>
                <h2 id="delete-authored-title">Delete book</h2>
              </div>
              <button
                aria-label="Close"
                className="admin-book-modal-close"
                disabled={deleting}
                onClick={() => setDeleteConfirmBook(null)}
                type="button"
              >
                <i className="bi bi-x-lg" />
              </button>
            </header>
            <div className="admin-book-modal-body" style={{ padding: '16px 20px' }}>
              <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.6', color: 'var(--app-text, #222)' }}>
                Are you sure you want to permanently delete <strong>"{deleteConfirmBook.title}"</strong>? All chapters and draft contents will be permanently removed.
              </p>
            </div>
            <footer className="admin-book-modal-footer">
              <button
                className="ghost-button"
                disabled={deleting}
                onClick={() => setDeleteConfirmBook(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="danger-button"
                disabled={deleting}
                onClick={handleDeleteBook}
                type="button"
              >
                <i className="bi bi-trash" style={{ marginRight: '6px' }} />
                {deleting ? 'Deleting...' : 'Delete book'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  )
}

// Same typography classes as the real reader (ReaderFrame.jsx) for a
// faithful preview, but its own simple view - not the actual ReaderPage,
// which is wired to a real saved book id (checkpoints, favorites,
// comments) that unsubmitted text doesn't have.
function BookPreview({ form }) {
  const chaptersWithContent = form.chapters.filter((chapter) => chapter.content.trim())

  return (
    <article className="reader-frame write-page-preview">
      <div className="reader-chapter-header">
        <div>
          <p className="mono-eyebrow">Preview</p>
          <h2>{form.title || 'Untitled'}</h2>
        </div>
      </div>
      <p className="write-page-preview-author">{form.author || 'Unknown author'}</p>

      {chaptersWithContent.length ? (
        chaptersWithContent.map((chapter, index) => (
          <div className="reader-text-page" key={index}>
            <p className="reader-page-kicker">{chapter.title || `Chapter ${index + 1}`}</p>
            {chapter.content
              .split(/\n\n+/)
              .filter((paragraph) => paragraph.trim())
              .map((paragraph, paragraphIndex) => (
                // eslint-disable-next-line react/no-danger
                <p key={paragraphIndex} dangerouslySetInnerHTML={{ __html: renderLiteMarkdown(paragraph) }} />
              ))}
          </div>
        ))
      ) : (
        <p className="empty-state">Write something in a chapter to see it previewed here.</p>
      )}
    </article>
  )
}

export default WritePage
