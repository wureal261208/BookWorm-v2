import { getAuthor, getCategory, getCover, getDescription } from '../../utils/bookUtils'

function DetailHero({
  book,
  checkpoint,
  favorites,
  language,
  onAuth,
  onRead,
  onRent,
  rental,
  onSaveBook,
  onToggleSavePrompt,
  rating,
  readingTime,
  showSavePrompt,
  totalChapters,
  totalPages,
  totalReads,
}) {
  return (
    <div className="detail-layout">
      <img loading="lazy" src={getCover(book)} alt={`${book.title} cover`} />
      <div className="detail-copy">
        <p className="mono-eyebrow">{getCategory(book)}</p>
        <h1>{book.title}</h1>
        <p className="detail-author">{getAuthor(book)}</p>
        <div className="rating-row" aria-label={`${rating} out of 5 stars`}>
          <span>{rating}</span>
          {[1, 2, 3, 4, 5].map((star) => (
            <i className={`bi ${star <= Math.round(rating) ? 'bi-star-fill' : 'bi-star'}`} key={star} />
          ))}
          <small>{totalReads.toLocaleString()} reads</small>
        </div>
        <div className="detail-meta-grid">
          <article>
            <i className="bi bi-file-earmark-text" />
            <strong>{totalPages}</strong>
            <span>Pages</span>
          </article>
          <article>
            <i className="bi bi-list-ol" />
            <strong>{totalChapters}</strong>
            <span>Chapters</span>
          </article>
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
          <button className={`ghost-button ${rental ? 'rental-active' : ''}`} onClick={() => onRent(book)} type="button">
            <i className={`bi ${rental ? 'bi-bag-check-fill' : 'bi-bag-plus'}`} />
            {rental ? 'Rented' : 'Rent this book'}
          </button>
          <button className="ghost-button" onClick={onSaveBook} type="button">
            <i className={`bi ${favorites.includes(book.id) ? 'bi-bookmark-fill' : 'bi-bookmark'}`} />
            {favorites.includes(book.id) ? 'Saved' : 'Save book'}
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
