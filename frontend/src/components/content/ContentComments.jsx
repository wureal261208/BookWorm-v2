import { useEffect, useState } from 'react'
import { auth } from '../../features/auth-firebase/firebaseConfig'
import { apiFetch, publicApiFetch } from '../../utils/apiClient'

const PREVIEW_LIMIT = 4

function formatCommentDate(dateString) {
  if (!dateString) return ''
  try {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch (_) {
    return String(dateString).slice(0, 10)
  }
}

function getAuthorInitial(name) {
  if (!name || typeof name !== 'string') return 'B'
  const trimmed = name.trim()
  return (trimmed[0] || 'B').toUpperCase()
}

function formatRoleBadge(role) {
  if (role === 'admin') return 'Admin'
  if (role === 'staff') return 'Staff'
  return 'Member'
}

function ContentComments({ contentId }) {
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')
  const [showAll, setShowAll] = useState(false)

  // Edit comment state
  const [editingCommentId, setEditingCommentId] = useState(null)
  const [editText, setEditText] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState('')
  const [currentUserId, setCurrentUserId] = useState(null)

  useEffect(() => {
    if (auth.currentUser) {
      publicApiFetch('/api/auth/me')
        .then((res) => {
          if (res?.data?.user?.id) setCurrentUserId(String(res.data.user.id))
        })
        .catch(() => {})
    } else {
      setCurrentUserId(null)
    }
  }, [auth.currentUser])

  useEffect(() => {
    if (!contentId) {
      setLoading(false)
      return
    }
    let ignore = false
    setLoading(true)
    publicApiFetch(`/api/content/${contentId}/comments`)
      .then((data) => {
        if (!ignore) setComments(Array.isArray(data?.comments) ? data.comments : [])
      })
      .catch(() => {
        if (!ignore) setComments([])
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [contentId])

  async function submitComment() {
    const trimmed = text.trim()
    if (!trimmed || !contentId) return

    setPosting(true)
    setError('')
    try {
      const data = await apiFetch(`/api/content/${contentId}/comments`, { method: 'POST', body: { text: trimmed } })
      if (data?.comment) {
        setComments((current) => [data.comment, ...current])
      }
      setText('')
    } catch (err) {
      setError(err.message || 'Could not post comment. Please try again.')
    } finally {
      setPosting(false)
    }
  }

  function startEditing(comment) {
    setEditingCommentId(comment.id)
    setEditText(comment.text)
    setEditError('')
  }

  function cancelEditing() {
    setEditingCommentId(null)
    setEditText('')
    setEditError('')
  }

  async function handleSaveEdit(commentId) {
    const trimmed = editText.trim()
    if (!trimmed || !contentId || !commentId) return

    setSavingEdit(true)
    setEditError('')
    try {
      const data = await apiFetch(`/api/content/${contentId}/comments/${commentId}`, {
        method: 'PATCH',
        body: { text: trimmed },
      })
      if (data?.comment) {
        setComments((current) => current.map((c) => (c.id === commentId ? { ...c, text: data.comment.text, updatedAt: data.comment.updatedAt } : c)))
        cancelEditing()
      }
    } catch (err) {
      setEditError(err.message || 'Could not update comment.')
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleDeleteComment(commentId) {
    if (!window.confirm('Delete this comment permanently?')) return
    try {
      await apiFetch(`/api/content/${contentId}/comments/${commentId}`, { method: 'DELETE' })
      setComments((current) => current.filter((c) => c.id !== commentId))
    } catch (err) {
      alert(err.message || 'Could not delete comment.')
    }
  }

  const visibleComments = showAll ? comments : comments.slice(0, PREVIEW_LIMIT)
  const isGuest = !auth.currentUser

  return (
    <section className="section-block comments-section" aria-label="Reader comments">
      <div className="section-heading">
        <div>
          <p className="mono-eyebrow">
            <i className="bi bi-chat-heart" style={{ marginRight: '6px' }} />
            Community discussion
          </p>
          <h2>Reader comments</h2>
        </div>
        <span className="comments-count-pill">{comments.length} {comments.length === 1 ? 'comment' : 'comments'}</span>
      </div>

      {isGuest ? (
        <div className="comment-guest-prompt">
          <i className="bi bi-person-lock" style={{ fontSize: '1.4rem', color: 'var(--app-accent)' }} />
          <div>
            <strong>Join the discussion</strong>
            <p>Please sign in to share thoughts, reviews, and notes with the BookWorm community.</p>
          </div>
        </div>
      ) : (
        <form
          className="comment-form"
          onSubmit={(event) => {
            event.preventDefault()
            submitComment()
          }}
        >
          <div className="comment-form-header">
            <span className="comment-avatar-bubble">
              {getAuthorInitial(auth.currentUser?.displayName || auth.currentUser?.email)}
            </span>
            <label htmlFor="content-comment-input">
              Commenting as <strong>{auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || 'Reader'}</strong>
            </label>
          </div>
          <textarea
            id="content-comment-input"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault()
                submitComment()
              }
            }}
            placeholder="Share your thoughts, perspectives, or favorite quotes about this title... (Ctrl+Enter to post)"
            rows={3}
            value={text}
          />
          {error && (
            <p className="admin-validation-error">
              <i className="bi bi-x-circle" /> {error}
            </p>
          )}
          <div className="comment-form-actions">
            <small className="comment-shortcut-hint">Tip: Press Ctrl + Enter to submit</small>
            <button className="primary-button" disabled={!text.trim() || posting} type="submit">
              {posting ? (
                <>
                  <span className="admin-spin-small" /> Posting...
                </>
              ) : (
                <>
                  <i className="bi bi-send-fill" /> Post comment
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="empty-state comment-loading-state">
          <span className="admin-spin-small" /> Loading comments...
        </div>
      ) : visibleComments.length > 0 ? (
        <div className="comment-list">
          {visibleComments.map((comment) => {
            const isEditing = editingCommentId === comment.id
            const isAuthor = Boolean(
              currentUserId && (
                String(comment.author?.id) === currentUserId ||
                comment.author?.name === (auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0])
              )
            )

            return (
              <article className="comment-item" key={comment.id}>
                <div className="comment-item-avatar">
                  {getAuthorInitial(comment.author?.name)}
                </div>
                <div className="comment-item-content">
                  <div className="comment-item-header">
                    <div className="comment-item-author-wrap">
                      <strong className="comment-item-author">{comment.author?.name || 'Reader'}</strong>
                      <span className="comment-role-badge">
                        {formatRoleBadge(comment.author?.role)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <time className="comment-item-time" dateTime={comment.createdAt} title={new Date(comment.createdAt).toLocaleString('en-US')}>
                        {formatCommentDate(comment.createdAt)}
                        {comment.updatedAt && comment.updatedAt !== comment.createdAt && ' (edited)'}
                      </time>
                      {isAuthor && !isEditing && (
                        <div className="comment-item-actions">
                          <button
                            className="ghost-button comment-action-icon-btn"
                            onClick={() => startEditing(comment)}
                            title="Edit comment"
                            type="button"
                          >
                            <i className="bi bi-pencil" />
                          </button>
                          <button
                            className="ghost-button comment-action-icon-btn comment-delete-btn"
                            onClick={() => handleDeleteComment(comment.id)}
                            title="Delete comment"
                            type="button"
                          >
                            <i className="bi bi-trash3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="comment-edit-box">
                      <textarea
                        autoFocus
                        className="comment-edit-textarea"
                        onChange={(e) => setEditText(e.target.value)}
                        rows={3}
                        value={editText}
                      />
                      {editError && (
                        <p className="admin-validation-error">
                          <i className="bi bi-x-circle" /> {editError}
                        </p>
                      )}
                      <div className="comment-edit-actions">
                        <button
                          className="ghost-button"
                          disabled={savingEdit}
                          onClick={cancelEditing}
                          type="button"
                        >
                          Cancel
                        </button>
                        <button
                          className="primary-button"
                          disabled={!editText.trim() || savingEdit}
                          onClick={() => handleSaveEdit(comment.id)}
                          type="button"
                        >
                          {savingEdit ? 'Saving...' : 'Save changes'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="comment-item-text">{comment.text}</p>
                  )}
                </div>
              </article>
            )
          })}
          {comments.length > PREVIEW_LIMIT && (
            <button className="ghost-button comment-more-button" onClick={() => setShowAll((value) => !value)} type="button">
              <i className={`bi ${showAll ? 'bi-chevron-up' : 'bi-chat-dots'}`} />
              {showAll ? 'Collapse comments' : `Show ${comments.length - PREVIEW_LIMIT} more comments`}
            </button>
          )}
        </div>
      ) : (
        <div className="empty-state comment-empty-state">
          <i className="bi bi-chat-square-quote" style={{ fontSize: '1.6rem', color: 'var(--app-muted)' }} />
          <p>No comments yet for this title. Be the first to share your thoughts!</p>
        </div>
      )}
    </section>
  )
}

export default ContentComments
