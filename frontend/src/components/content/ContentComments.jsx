import { useEffect, useState } from 'react'
import { auth } from '../../features/auth-firebase/firebaseConfig'
import { apiFetch, publicApiFetch } from '../../utils/apiClient'

const PREVIEW_LIMIT = 3

// Same visual shell as DetailComments.jsx (comments-section/comment-form/
// comment-list/comment-item classes) but self-contained - unlike
// DetailComments, which is a pure presentation component controlled by
// BookDetailPage's own centralized comment state, this fetches and posts
// its own data. Content's reader/player pages don't go through App.jsx's
// Book-oriented state machine at all (see ContentReaderPage.jsx), so
// wiring this the same way DetailComments works would mean threading
// content comments through that Book-shaped state for no real benefit.
function ContentComments({ contentId }) {
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    let ignore = false
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
    if (!trimmed) return

    setPosting(true)
    setError('')
    try {
      const data = await apiFetch(`/api/content/${contentId}/comments`, { method: 'POST', body: { text: trimmed } })
      setComments((current) => [data.comment, ...current])
      setText('')
    } catch (err) {
      setError(err.message)
    } finally {
      setPosting(false)
    }
  }

  const visibleComments = showAll ? comments : comments.slice(0, PREVIEW_LIMIT)
  const isGuest = !auth.currentUser

  return (
    <section className="section-block comments-section">
      <div className="section-heading">
        <div>
          <p className="mono-eyebrow">Reader voices</p>
          <h2>Comments</h2>
        </div>
        <span>{comments.length} comments</span>
      </div>

      {isGuest ? (
        <p className="empty-state">Log in to leave a comment.</p>
      ) : (
        <form
          className="comment-form"
          onSubmit={(event) => {
            event.preventDefault()
            submitComment()
          }}
        >
          <label>
            Comment
            <textarea
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  submitComment()
                }
              }}
              placeholder="Share what you think..."
              value={text}
            />
          </label>
          {error && <p className="admin-validation-error"><i className="bi bi-x-circle" /> {error}</p>}
          <button className="primary-button" disabled={!text.trim() || posting} type="submit">
            <i className="bi bi-chat-left-text" />
            {posting ? 'Posting...' : 'Post comment'}
          </button>
        </form>
      )}

      {loading ? (
        <div className="empty-state">Loading comments...</div>
      ) : visibleComments.length ? (
        <div className="comment-list">
          {visibleComments.map((comment) => (
            <article className="comment-item" key={comment.id}>
              <div>
                <strong>{comment.author?.name || 'Reader'}</strong>
                <span>{comment.author?.role === 'guest' ? 'Guest reader' : 'Member'}</span>
              </div>
              <p>{comment.text}</p>
              <time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleDateString()}</time>
            </article>
          ))}
          {comments.length > PREVIEW_LIMIT && (
            <button className="ghost-button comment-more-button" onClick={() => setShowAll((value) => !value)} type="button">
              <i className={`bi ${showAll ? 'bi-chevron-up' : 'bi-chat-dots'}`} />
              {showAll ? 'Show less' : `View ${comments.length - PREVIEW_LIMIT} more comments`}
            </button>
          )}
        </div>
      ) : (
        <div className="empty-state">No comments yet. Start the conversation.</div>
      )}
    </section>
  )
}

export default ContentComments
