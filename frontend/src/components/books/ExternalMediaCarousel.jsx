import { useRef } from 'react'

function getFileUrl(files, formats) {
  const match = (files || []).find((file) => formats.includes(file.format))
  return match ? match.url : ''
}

// "Hot ebooks"/"Hot audiobooks" on Home show Content documents synced from
// Gutendex/LibriVox (see backend/utils/contentIngestion.js) that haven't
// been reviewed/added to BookWorm's own in-app reader yet - so unlike
// BookCard, this links straight out to the source (Gutenberg/LibriVox/
// archive.org) instead of wiring up Save/Read against a book id that
// doesn't have chapters or reader text here. Reuses BookCard's own class
// names so it matches the rest of Home's rows without a separate stylesheet.
function ExternalMediaCard({ item }) {
  const isEbook = item.type === 'ebook'
  const title = item.title || 'Untitled'
  const author = item.author || 'Unknown author'
  const cover = item.cover_image || ''
  const meta = isEbook
    ? `${(item.downloadCount || 0).toLocaleString()} downloads on Gutenberg`
    : 'LibriVox audiobook'
  const externalUrl = isEbook
    ? getFileUrl(item.files, ['html', 'epub']) || `https://www.gutenberg.org/ebooks/${item.externalId}`
    : getFileUrl(item.files, ['zip', 'rss']) || `https://librivox.org/`

  return (
    <article className="book-card">
      <a
        className="book-cover-button"
        href={externalUrl}
        rel="noreferrer"
        target="_blank"
        style={{ display: 'block' }}
      >
        {cover ? (
          <img alt={`${title} cover`} loading="lazy" src={cover} />
        ) : (
          <span className="book-cover-overlay" style={{ position: 'static', opacity: 1 }}>
            <i className={`bi ${isEbook ? 'bi-book' : 'bi-headphones'}`} style={{ fontSize: '2rem' }} />
          </span>
        )}
      </a>
      <div className="book-card-body">
        <span className="category">{item.source}</span>
        <h2>{title}</h2>
        <p>{author}</p>
      </div>
      <div className="book-card-meta">
        <i className={`bi ${isEbook ? 'bi-download' : 'bi-clock'}`} />
        <small>{meta}</small>
      </div>
      <div className="card-actions">
        <a className="primary-button" href={externalUrl} rel="noreferrer" target="_blank">
          <i className={`bi ${isEbook ? 'bi-box-arrow-up-right' : 'bi-play-circle'}`} />
          {isEbook ? 'Read on Gutenberg' : 'Listen on LibriVox'}
        </a>
      </div>
    </article>
  )
}

// Same scroll-by-page track/arrows behavior as BookCarousel, just rendering
// ExternalMediaCard instead - kept separate rather than making BookCarousel
// take a render prop, since BookCarousel's favorites/onFavorite/onRead
// plumbing doesn't apply to items that aren't in BookWorm's own reader yet.
function ExternalMediaCarousel({ items }) {
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
          <div className="book-carousel-item" key={item._id}>
            <ExternalMediaCard item={item} />
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
