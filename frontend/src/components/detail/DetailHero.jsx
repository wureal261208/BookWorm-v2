import { useState } from 'react'
import { getAuthor, getCategory, getCover, getDescription } from '../../utils/bookUtils'
import { publicApiFetch } from '../../utils/apiClient'

function DetailHero({
  book,
  checkpoint,
  favorites,
  hasChapters = true,
  language,
  onAuth,
  onListen,
  onRead,
  onSaveBook,
  onToggleSavePrompt,
  readingTime,
  showSavePrompt,
  totalChapters,
  totalPages,
  totalReads,
}) {
  const [aiSummary, setAiSummary] = useState('')
  const [isSummarizing, setIsSummarizing] = useState(false)
  const [summaryError, setSummaryError] = useState('')

  const bId = book.id || book._id || '42'
  const numericId = typeof bId === 'number'
    ? bId
    : String(bId).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const ratingScore = (4.6 + ((numericId % 4) * 0.1)).toFixed(1)
  const reviewCount = Math.max(18, ((numericId * 13) % 240) + 38)
  const isSaved = favorites.includes(book.id || book._id)

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
          src={getCover(book)}
        />
      </div>
      <div className="detail-copy">
        <p className="mono-eyebrow">{getCategory(book)}</p>
        <h1 className="detail-title">{book.title}</h1>
        <p className="detail-author">{getAuthor(book)}</p>

        <div className="detail-rating-row">
          <span className="detail-rating-pill" aria-label={`Rated ${ratingScore} out of 5 stars`}>
            <i className="bi bi-star-fill" /> {ratingScore}
          </span>
          <span className="detail-rating-count">({reviewCount} reviews)</span>
          <span className="detail-meta-dot">•</span>
          <span className="detail-reads-count">
            <i className="bi bi-eye" /> {(totalReads || 0).toLocaleString()} reads
          </span>
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
          <button className={`ghost-button ${isSaved ? 'is-saved' : ''}`} onClick={onSaveBook} type="button">
            <i className={`bi ${isSaved ? 'bi-bookmark-fill' : 'bi-bookmark'}`} />
            {isSaved ? 'Saved' : 'Save book'}
          </button>
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
