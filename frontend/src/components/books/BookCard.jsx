import { getAuthor, getCategory, getCover, getDescription } from '../../utils/bookUtils'

function BookCard({ book, favorites = [], onDetail, onFavorite, onRead, progressPercent, viewCount = 0 }) {
  const totalReads = (book.download_count || 0) + viewCount
  const hasProgress = typeof progressPercent === 'number' && progressPercent > 0

  return (
    <article className="book-card">
      <button className="book-cover-button" onClick={() => onDetail(book)} type="button">
        <img loading="lazy" src={getCover(book)} alt={`${book.title} cover`} />
        <span className="book-cover-overlay">
          <strong>{book.title}</strong>
          <em>{getAuthor(book)}</em>
          <p>{getDescription(book)}</p>
        </span>
      </button>
      <div className="book-card-body">
        <span className="category">{getCategory(book)}</span>
        <h2>{book.title}</h2>
        <p>{getAuthor(book)}</p>
      </div>
      <div className="book-card-meta">
        {hasProgress ? (
          <>
            <i className="bi bi-bookmark-check" style={{ color: 'var(--app-accent)' }} />
            <small style={{ color: 'var(--app-accent)', fontWeight: 600 }}>{Math.round(progressPercent)}% completed</small>
          </>
        ) : (
          <>
            <i className="bi bi-eye" />
            <small>{totalReads.toLocaleString()} reads</small>
          </>
        )}
      </div>
      <div className="card-actions">
        <button className="primary-button" onClick={() => onRead(book)} type="button">
          <i className="bi bi-journal-text" />
          {hasProgress ? 'Continue' : 'Read'}
        </button>
        <button className="ghost-button" onClick={() => onFavorite(book._id || book.id)} type="button">
          <i className={`bi ${favorites.includes(book._id || book.id) ? 'bi-bookmark-fill' : 'bi-bookmark'}`} />
          {favorites.includes(book._id || book.id) ? 'Saved' : 'Save'}
        </button>
      </div>
    </article>
  )
}

export default BookCard
