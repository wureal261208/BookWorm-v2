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

    if (diffMins < 1) return 'Vừa xong'
    if (diffMins < 60) return `${diffMins} phút trước`
    if (diffHours < 24) return `${diffHours} giờ trước`
    if (diffDays === 1) return 'Hôm qua'
    if (diffDays < 7) return `${diffDays} ngày trước`
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
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
  if (role === 'admin') return 'Quản trị viên'
  if (role === 'staff') return 'Biên tập viên'
  return 'Thành viên'
}

function ContentComments({ contentId }) {
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')
  const [showAll, setShowAll] = useState(false)

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
      setError(err.message || 'Không thể gửi bình luận. Vui lòng thử lại.')
    } finally {
      setPosting(false)
    }
  }

  const visibleComments = showAll ? comments : comments.slice(0, PREVIEW_LIMIT)
  const isGuest = !auth.currentUser

  return (
    <section className="section-block comments-section" aria-label="Bình luận độc giả">
      <div className="section-heading">
        <div>
          <p className="mono-eyebrow">
            <i className="bi bi-chat-heart" style={{ marginRight: '6px' }} />
            Góc thảo luận &amp; cảm nhận
          </p>
          <h2>Bình luận độc giả</h2>
        </div>
        <span className="comments-count-pill">{comments.length} bình luận</span>
      </div>

      {isGuest ? (
        <div className="comment-guest-prompt">
          <i className="bi bi-person-lock" style={{ fontSize: '1.4rem', color: 'var(--app-accent)' }} />
          <div>
            <strong>Tham gia bình luận cùng bạn đọc</strong>
            <p>Vui lòng đăng nhập để gửi cảm nhận, bình luận và ghi dấu ấn cùng cộng đồng BookWorm.</p>
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
              Bình luận với tư cách <strong>{auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || 'Bạn đọc'}</strong>
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
            placeholder="Chia sẻ cảm nghĩ, góc nhìn hay đoạn tâm đắc của bạn về tác phẩm này... (Nhấn Ctrl+Enter để gửi nhanh)"
            rows={3}
            value={text}
          />
          {error && (
            <p className="admin-validation-error">
              <i className="bi bi-x-circle" /> {error}
            </p>
          )}
          <div className="comment-form-actions">
            <small className="comment-shortcut-hint">Mẹo: Nhấn Ctrl + Enter để gửi</small>
            <button className="primary-button" disabled={!text.trim() || posting} type="submit">
              {posting ? (
                <>
                  <span className="admin-spin-small" /> Đang gửi...
                </>
              ) : (
                <>
                  <i className="bi bi-send-fill" /> Gửi bình luận
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="empty-state comment-loading-state">
          <span className="admin-spin-small" /> Đang tải bình luận...
        </div>
      ) : visibleComments.length > 0 ? (
        <div className="comment-list">
          {visibleComments.map((comment) => (
            <article className="comment-item" key={comment.id}>
              <div className="comment-item-avatar">
                {getAuthorInitial(comment.author?.name)}
              </div>
              <div className="comment-item-content">
                <div className="comment-item-header">
                  <div className="comment-item-author-wrap">
                    <strong className="comment-item-author">{comment.author?.name || 'Độc giả'}</strong>
                    <span className="comment-role-badge">
                      {formatRoleBadge(comment.author?.role)}
                    </span>
                  </div>
                  <time className="comment-item-time" dateTime={comment.createdAt} title={new Date(comment.createdAt).toLocaleString('vi-VN')}>
                    {formatCommentDate(comment.createdAt)}
                  </time>
                </div>
                <p className="comment-item-text">{comment.text}</p>
              </div>
            </article>
          ))}
          {comments.length > PREVIEW_LIMIT && (
            <button className="ghost-button comment-more-button" onClick={() => setShowAll((value) => !value)} type="button">
              <i className={`bi ${showAll ? 'bi-chevron-up' : 'bi-chat-dots'}`} />
              {showAll ? 'Thu gọn bình luận' : `Xem thêm ${comments.length - PREVIEW_LIMIT} bình luận khác`}
            </button>
          )}
        </div>
      ) : (
        <div className="empty-state comment-empty-state">
          <i className="bi bi-chat-square-quote" style={{ fontSize: '1.6rem', color: 'var(--app-muted)' }} />
          <p>Chưa có bình luận nào cho tác phẩm này. Hãy là người đầu tiên chia sẻ cảm nghĩ!</p>
        </div>
      )}
    </section>
  )
}

export default ContentComments
