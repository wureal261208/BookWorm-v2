import { getAuthor, getCategory, getCover } from '../../utils/bookUtils'

function BookCard({ book, favorites = [], onDetail, onFavorite, onRead, viewCount = 0 }) {
  const totalReads = (book.download_count || 0) + viewCount

  return (
    <article className="book-card">
      <button className="book-cover-button" onClick={() => onDetail(book)} type="button">
        <img loading="lazy" src={getCover(book)} alt={`${book.title} cover`} />
      </button>
      <div>
        <span className="category">{getCategory(book)}</span>
        <h2>{book.title}</h2>
        <p>{getAuthor(book)}</p>
        <small>{totalReads.toLocaleString()} reads</small>
      </div>
      <div className="card-actions">
        <button className="primary-button" onClick={() => onRead(book)} type="button">
          <i className="bi bi-journal-text" />
          Read
        </button>
        <button className="ghost-button" onClick={() => onFavorite(book.id)} type="button">
          <i className={`bi ${favorites.includes(book.id) ? 'bi-bookmark-fill' : 'bi-bookmark'}`} />
          {favorites.includes(book.id) ? 'Saved' : 'Save'}
        </button>
      </div>
    </article>
  )
}

export default BookCard
