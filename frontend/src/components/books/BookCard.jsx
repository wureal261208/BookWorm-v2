import { getAuthor, getCategory, getCover } from '../../utils/bookUtils'
import { formatRentalExpiry, getRentalLabel, getRentalStatus } from '../../utils/rentalUtils'

function BookCard({ book, favorites = [], onDetail, onFavorite, onRead, onRent, rental, variant = 'read', viewCount = 0 }) {
  const totalReads = (book.download_count || 0) + viewCount
  const isRented = rental && getRentalStatus(rental) === 'active'
  const isRentMode = variant === 'rent'

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
        {isRentMode ? (
          <button className={`primary-button ${isRented ? 'rental-active' : ''}`} onClick={() => onRent(book)} type="button">
            <i className={`bi ${isRented ? 'bi-bag-check-fill' : 'bi-bag-plus'}`} />
            {isRented ? getRentalLabel(rental) : 'Rent now'}
          </button>
        ) : (
          <button className="primary-button" onClick={() => onRead(book)} type="button">
            <i className="bi bi-journal-text" />
            Read
          </button>
        )}
        <button className="ghost-button" onClick={() => onFavorite(book.id)} type="button">
          <i className={`bi ${favorites.includes(book.id) ? 'bi-bookmark-fill' : 'bi-bookmark'}`} />
          {favorites.includes(book.id) ? 'Saved' : 'Save'}
        </button>
      </div>
      {rental && (
        <small className="rental-pill">{formatRentalExpiry(rental)} · {getRentalLabel(rental)}</small>
      )}
    </article>
  )
}

export default BookCard
