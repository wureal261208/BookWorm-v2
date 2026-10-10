import { useState } from 'react'
import { getAuthor, getCategory, getCover, getDescription, NO_COVER_IMAGE } from '../../utils/bookUtils'
import { publicApiFetch } from '../../utils/apiClient'

function DetailHero({
  account,
  book,
  checkpoint,
  favorites = [],
  shelf = [],
  hasChapters = true,
  language,
  onAuth,
  onListen,
  onRead,
  onSaveBook,
  onUpdateShelfStatus,
  onRemoveShelfBook,
  onToggleSavePrompt,
  readingTime,
  showSavePrompt,
  totalChapters,
  totalPages,
  totalReads,
  ratingData,
  onRateBook,
}) {
  const [aiSummary, setAiSummary] = useState('')
  const [isSummarizing, setIsSummarizing] = useState(false)
  const [summaryError, setSummaryError] = useState('')
  const [showShelfMenu, setShowShelfMenu] = useState(false)
  const [hoverStar, setHoverStar] = useState(0)

  const bookId = book._id || book.id
  const currentShelfItem = shelf?.find((s) => String(s.bookId) === String(bookId))
  const currentShelfStatus = currentShelfItem?.status || (favorites.includes(bookId) ? 'want_to_read' : null)
  const isSaved = Boolean(currentShelfStatus)

  const avgRating = ratingData?.average || book.rating?.average || 0
  const reviewCount = ratingData?.count ?? book.rating?.count ?? 0
  const userScore = ratingData?.userScore || null

  function handleSelectShelfStatus(status) {
    if (account?.role === 'guest') {
      onToggleSavePrompt(true)
      setShowShelfMenu(false)
      return
    }
    if (status === 'remove') {
      onRemoveShelfBook?.(bookId)
    } else {
      onUpdateShelfStatus?.(bookId, status)
    }
    setShowShelfMenu(false)
  }

  const isAudiobook = book.type === 'audiobook' || book.source === 'LibriVox'
  const hasTextOption = Boolean(
    onRead && (
      !isAudiobook ||
      book.files?.some((f) => f.format === 'html' || f.format === 'txt') ||
      book.readerUrl ||
      book.chapters?.length > 0
    )
  )
  const hasAudioOption = Boolean(
    onListen && (
      isAudiobook ||
      book.pairedContent ||
      book.hasAudio ||
      book.type === 'audio' ||
      book.audiobookId ||
      book.formats?.audio
    )
  )

  async function handleGenerateAiSummary() {
    setIsSummarizing(true)
    setSummaryError('')
    try {
      const data = await publicApiFetch('/api/books/ai-summary', {
        method: 'POST',
        body: {
          id: book._id || book.id,
          title: book.title,
          author: getAuthor(book),
          category: getCategory(book),
          existingDescription: book.description,
        },
      })
      if (data?.summary) {
        setAiSummary(data.summary)
      }
    } catch (err) {
      setSummaryError(err.message || 'Could not generate summary')
    } finally {
      setIsSummarizing(false)
    }
  }

  return (
    <div className="detail-layout">
      <div className="detail-cover-wrapper">
        <img
          alt={`${book.title} cover`}
          className="detail-hero-cover"
          loading="lazy"
          onError={(e) => {
            if (e.currentTarget.src !== NO_COVER_IMAGE) {
              e.currentTarget.src = NO_COVER_IMAGE
            }
          }}
          src={getCover(book)}
        />
      </div>
      <div className="detail-copy">
        <p className="mono-eyebrow">{getCategory(book)}</p>
        <h1 className="detail-title">{book.title}</h1>
        <p className="detail-author">{getAuthor(book)}</p>

        <div className="detail-rating-row">
          <span className="detail-rating-pill" aria-label={`Rated ${avgRating > 0 ? avgRating.toFixed(1) : 'New'} out of 5 stars`}>
            <i className="bi bi-star-fill" style={{ color: '#f59e0b' }} /> {avgRating > 0 ? avgRating.toFixed(1) : 'New'}
          </span>
          <span className="detail-rating-count">({reviewCount} {reviewCount === 1 ? 'rating' : 'ratings'})</span>
          <span className="detail-meta-dot">•</span>
          <span className="detail-reads-count">
            <i className="bi bi-eye" /> {(totalReads || 0).toLocaleString()} reads
          </span>
        </div>

        {/* Interactive 5-star Rating Bar */}
        <div className="detail-rating-interactive">
          <span className="rating-interactive-label">
            {userScore ? (
              <span><i className="bi bi-check-circle-fill" style={{ color: 'var(--app-accent)', marginRight: '4px' }} />Your rating: <strong>{userScore} <i className="bi bi-star-fill" style={{ color: '#f59e0b', fontSize: '0.9em' }} /></strong></span>
            ) : (
              <span>Rate this book:</span>
            )}
          </span>
          <div className="star-rating-buttons" role="radiogroup" aria-label="1 to 5 star rating">
            {[1, 2, 3, 4, 5].map((star) => {
              const isFilled = star <= (hoverStar || userScore || 0)
              return (
                <button
                  key={star}
                  aria-label={`${star} star`}
                  className={`star-rate-btn ${isFilled ? 'filled' : ''}`}
                  onClick={() => {
                    if (account?.role === 'guest') {
                      onToggleSavePrompt(true)
                      return
                    }
                    onRateBook?.(star)
                  }}
                  onMouseEnter={() => setHoverStar(star)}
                  onMouseLeave={() => setHoverStar(0)}
                  title={`Rate ${star} ${star === 1 ? 'star' : 'stars'}`}
                  type="button"
                >
                  <i className={`bi ${isFilled ? 'bi-star-fill' : 'bi-star'}`} />
                </button>
              )
            })}
          </div>
        </div>

        <div className="detail-meta-grid">
          <article>
            <i className="bi bi-file-earmark-text" />
            <strong>{totalPages}</strong>
            <span>Pages</span>
          </article>
          {hasChapters && (
            <article>
              <i className="bi bi-list-ol" />
              <strong>{totalChapters}</strong>
              <span>Chapters</span>
            </article>
          )}
          <article>
            <i className="bi bi-translate" />
            <strong>{language}</strong>
            <span>Language</span>
          </article>
          <article>
            <i className="bi bi-clock-history" />
            <strong>{readingTime}m</strong>
            <span>Est. read</span>
          </article>
        </div>

        {/* Description & AI Summary Section */}
        <div className="detail-description-section">
          <div className="detail-desc-header">
            <h3 className="detail-desc-title">About this book</h3>
            <button
              className="ghost-button detail-ai-summary-btn"
              disabled={isSummarizing}
              onClick={handleGenerateAiSummary}
              title="Generate a 2-4 sentence AI summary for this title"
              type="button"
            >
              <i className={`bi ${isSummarizing ? 'bi-arrow-repeat spin' : 'bi-stars'}`} />
              <span>{isSummarizing ? 'Summarizing...' : aiSummary ? 'Regenerate Summary' : 'AI Summary'}</span>
            </button>
          </div>

          {aiSummary ? (
            <div className="detail-ai-summary-box">
              <div className="detail-ai-summary-badge">
                <i className="bi bi-stars" /> AI Summary
              </div>
              <p className="detail-ai-summary-text">{aiSummary}</p>
            </div>
          ) : (
            <p className="book-description">
              {getDescription(book) || 'No description recorded for this title. Tap "AI Summary" above to generate one.'}
            </p>
          )}
          {summaryError && (
            <p className="admin-validation-error" style={{ marginTop: '8px' }}>
              <i className="bi bi-exclamation-circle" /> {summaryError}
            </p>
          )}
        </div>

        {checkpoint && (
          <button
            className="checkpoint-chip checkpoint-resume-btn"
            onClick={() => onRead(book)}
            title={`Resume reading from ${checkpoint.chapter ? `Chapter ${checkpoint.chapter}, ` : ''}page ${checkpoint.page}`}
            type="button"
          >
            <i className="bi bi-bookmark-check-fill" />
            <span>
              Continue {checkpoint.chapter ? `Chapter ${checkpoint.chapter}` : ''} (Page {checkpoint.page})
            </span>
            <i className="bi bi-arrow-right resume-arrow" />
          </button>
        )}

        <div className="hero-actions">
          {hasTextOption && (
            <button className="primary-button" onClick={() => onRead(book)} type="button">
              <i className="bi bi-journal-text" />
              Read now
            </button>
          )}
          {hasAudioOption && (
            <button
              className={`${isAudiobook ? 'primary-button' : 'secondary-button'} detail-listen-btn`}
              onClick={() => onListen(book)}
              type="button"
            >
              <i className="bi bi-headphones" />
              Listen audio
            </button>
          )}
          <div className="detail-shelf-dropdown-wrap">
            <button
              className={`ghost-button detail-shelf-trigger ${isSaved ? 'is-saved' : ''}`}
              onClick={() => setShowShelfMenu((v) => !v)}
              aria-expanded={showShelfMenu}
              type="button"
            >
              <i
                className={`bi ${
                  currentShelfStatus === 'reading'
                    ? 'bi-book-half'
                    : currentShelfStatus === 'finished'
                    ? 'bi-check-circle-fill'
                    : currentShelfStatus === 'want_to_read'
                    ? 'bi-bookmark-fill'
                    : 'bi-bookmark-plus'
                }`}
              />
              <span>
                {currentShelfStatus === 'reading'
                  ? 'Reading'
                  : currentShelfStatus === 'finished'
                  ? 'Finished'
                  : currentShelfStatus === 'want_to_read'
                  ? 'Want to read'
                  : 'Add to shelf'}
              </span>
              <i className="bi bi-chevron-down shelf-caret" />
            </button>

            {showShelfMenu && (
              <div className="detail-shelf-menu" role="menu">
                <button
                  className={`shelf-menu-item ${currentShelfStatus === 'reading' ? 'active' : ''}`}
                  onClick={() => handleSelectShelfStatus('reading')}
                  type="button"
                  role="menuitem"
                >
                  <i className="bi bi-book-half" />
                  <div>
                    <strong>Reading</strong>
                    <small>Track reading progress</small>
                  </div>
                </button>
                <button
                  className={`shelf-menu-item ${currentShelfStatus === 'want_to_read' ? 'active' : ''}`}
                  onClick={() => handleSelectShelfStatus('want_to_read')}
                  type="button"
                  role="menuitem"
                >
                  <i className="bi bi-bookmark-plus" />
                  <div>
                    <strong>Want to read</strong>
                    <small>Save to read later</small>
                  </div>
                </button>
                <button
                  className={`shelf-menu-item ${currentShelfStatus === 'finished' ? 'active' : ''}`}
                  onClick={() => handleSelectShelfStatus('finished')}
                  type="button"
                  role="menuitem"
                >
                  <i className="bi bi-check-circle-fill" />
                  <div>
                    <strong>Finished</strong>
                    <small>Mark as completed</small>
                  </div>
                </button>
                {currentShelfStatus && (
                  <button
                    className="shelf-menu-item remove-item"
                    onClick={() => handleSelectShelfStatus('remove')}
                    type="button"
                    role="menuitem"
                  >
                    <i className="bi bi-trash3" />
                    <div>
                      <strong>Remove from shelf</strong>
                      <small>Remove from your library</small>
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className={`save-book-prompt ${showSavePrompt ? 'show' : ''}`} aria-live="polite">
          <i className="bi bi-person-plus" />
          <div>
            <strong>Create an account to save books</strong>
            <p>Register or login to keep this title on your shelf and sync it later.</p>
          </div>
          <button className="primary-button" onClick={onAuth} type="button">Register</button>
          <button aria-label="Close save prompt" onClick={() => onToggleSavePrompt(false)} type="button">
            <i className="bi bi-x-lg" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default DetailHero
