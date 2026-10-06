import { getAuthor, getCategory, getCover, getDescription } from '../../utils/bookUtils'

function BookCard({ book, favorites = [], onDetail, onFavorite, onRead, progressPercent, viewCount = 0 }) {
  const isAudiobook = book.category === 'Audiobook' || (book.title && book.title.toLowerCase().includes('(audiobook)')) || book.type === 'audiobook'
  const baseReads = typeof book.views === 'number' ? book.views : (book.downloadCount || book.download_count || 0)
  const totalReads = Math.max(baseReads, Number(viewCount) || 0)
  const hasProgress = typeof progressPercent === 'number' && progressPercent > 0
  const authorName = getAuthor(book)
  const categoryName = getCategory(book)

  return (
    <article className="book-card">
      <button className="book-cover-button" onClick={() => onDetail(book)} type="button">
        <img loading="lazy" src={getCover(book)} alt={`${book.title} cover`} />
        <span className="book-cover-overlay">
          <strong>{book.title}</strong>
          <em>{authorName}</em>
          <p>{getDescription(book)}</p>
        </span>
      </button>
      <div className="book-card-body">
        <span className="category">{categoryName}</span>
        <h2 onClick={() => onDetail(book)} style={{ cursor: 'pointer' }} title={book.title}>{book.title}</h2>
        <p title={authorName}>{authorName}</p>
      </div>
      <div className="book-card-meta">
        {hasProgress ? (
          <>
            <i className="bi bi-bookmark-check" style={{ color: 'var(--app-accent)' }} />
            <small style={{ color: 'var(--app-accent)', fontWeight: 600 }}>{Math.round(progressPercent)}% completed</small>
          </>
        ) : (
          <>
            <i className={`bi ${isAudiobook ? 'bi-headphones' : 'bi-eye'}`} />
            <small>{isAudiobook ? (totalReads > 0 ? `${totalReads.toLocaleString()} listens` : 'Audiobook') : `${totalReads.toLocaleString()} reads`}</small>
          </>
        )}
      </div>
      <div className="card-actions">
        <button className="primary-button" onClick={() => onRead(book)} type="button">
          <i className={`bi ${isAudiobook ? 'bi-headphones' : 'bi-journal-text'}`} />
          {isAudiobook ? 'Listen' : hasProgress ? 'Continue' : 'Read'}
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
