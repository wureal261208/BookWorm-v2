import { getAuthor, getCategory, getCover, getDescription } from '../../utils/bookUtils'

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
  const numericId = typeof book.id === 'number'
    ? book.id
    : (book.id ? String(book.id).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) : 42)
  const ratingScore = (4.6 + ((numericId % 4) * 0.1)).toFixed(1)
  const reviewCount = Math.max(18, ((numericId * 13) % 240) + 38)
  const isSaved = favorites.includes(book.id)
  const hasAudioOption = Boolean(onListen && (book.pairedContent || book.hasAudio || book.type === 'audio' || book.audiobookId || book.formats?.audio))

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
            <i className="bi bi-eye" /> {totalReads.toLocaleString()} reads
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

        <p className="book-description">{getDescription(book)}</p>

        {checkpoint && (
          <div className="checkpoint-chip">
            <i className="bi bi-bookmark-check" />
            Continue from page {checkpoint.page}
          </div>
        )}

        <div className="hero-actions">
          <button className="primary-button" onClick={() => onRead(book)} type="button">
            <i className="bi bi-journal-text" />
            Read now
          </button>
          {hasAudioOption && (
            <button className="secondary-button detail-listen-btn" onClick={() => onListen(book)} type="button">
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
