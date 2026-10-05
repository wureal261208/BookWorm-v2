import { useRef } from 'react'
import { useNavigation } from '../../context/NavigationContext'

// "Hot ebooks"/"Hot audiobooks" on Home show Content documents synced from
// Gutendex/LibriVox (see backend/utils/contentIngestion.js). Clicking one
// opens BookWorm's BookDetailPage (mainPage -> detailPage -> read/audioPage)
// per the design specification.
function ExternalMediaCard({ item, onDetail }) {
  const { navigateTo } = useNavigation()
  const isEbook = item.type === 'ebook'
  const title = item.title || 'Untitled'
  const author = item.author || 'Unknown author'
  const cover = item.cover_image || ''
  const meta = isEbook ? `${(item.downloadCount || 0).toLocaleString()} downloads on Gutenberg` : 'LibriVox audiobook'

  function openDetail() {
    if (onDetail) {
      onDetail(item)
    } else {
      navigateTo('detail', { query: `id=${item._id || item.id}` })
    }
  }

  return (
    <article className="book-card">
      <button className="book-cover-button" onClick={openDetail} style={{ display: 'block', width: '100%', border: 0, padding: 0 }} type="button">
        {cover ? (
          <img alt={`${title} cover`} loading="lazy" src={cover} />
        ) : (
          <span className="book-cover-overlay" style={{ position: 'static', opacity: 1 }}>
            <i className={`bi ${isEbook ? 'bi-book' : 'bi-headphones'}`} style={{ fontSize: '2rem' }} />
          </span>
        )}
      </button>
      <div className="book-card-body">
        <span className="category">{item.source}</span>
        <h2 onClick={openDetail} style={{ cursor: 'pointer' }}>{title}</h2>
        <p>{author}</p>
      </div>
      <div className="book-card-meta">
        <i className={`bi ${isEbook ? 'bi-download' : 'bi-clock'}`} />
        <small>{meta}</small>
      </div>
      <div className="card-actions">
        <button className="primary-button" onClick={openDetail} type="button">
          <i className="bi bi-info-circle" />
          Details
        </button>
      </div>
    </article>
  )
}

// Same scroll-by-page track/arrows behavior as BookCarousel, rendering
// ExternalMediaCard with onDetail routing.
function ExternalMediaCarousel({ items, onDetail }) {
  const trackRef = useRef(null)

  function scrollByPage(direction) {
    const track = trackRef.current
    if (!track) return
    track.scrollBy({ left: direction * track.clientWidth * 0.86, behavior: 'smooth' })
  }

  if (!items.length) return null

  const showArrows = items.length > 1

  return (
    <div className="book-carousel">
      {showArrows && (
        <button
          aria-label="Scroll to previous items"
          className="book-carousel-arrow book-carousel-arrow-prev"
          onClick={() => scrollByPage(-1)}
          type="button"
        >
          <i className="bi bi-chevron-left" />
        </button>
      )}

      <div className="book-carousel-track" ref={trackRef}>
        {items.map((item) => (
          <div className="book-carousel-item" key={item._id || item.id}>
            <ExternalMediaCard item={item} onDetail={onDetail} />
          </div>
        ))}
      </div>

      {showArrows && (
        <button
          aria-label="Scroll to more items"
          className="book-carousel-arrow book-carousel-arrow-next"
          onClick={() => scrollByPage(1)}
          type="button"
        >
          <i className="bi bi-chevron-right" />
        </button>
      )}
    </div>
  )
}

export default ExternalMediaCarousel
