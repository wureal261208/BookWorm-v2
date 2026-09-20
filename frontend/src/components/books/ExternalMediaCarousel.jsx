import { useRef } from 'react'
import { getAuthor, getCover } from '../../utils/bookUtils'

// Pulls an Internet Archive cover thumbnail out of a LibriVox item's own
// archive.org details-page URL (LibriVox itself doesn't serve cover art on
// this feed) - e.g. ".../details/count_monte_cristo_0911_librivox" becomes
// archive.org's own cover-image endpoint for that same identifier.
function getIarchiveCover(urlIarchive) {
  const match = (urlIarchive || '').match(/archive\.org\/details\/([^/?#]+)/)
  return match ? `https://archive.org/services/img/${match[1]}` : ''
}

function getAudiobookAuthor(item) {
  const names = (item.authors || [])
    .map((author) => `${author.firstName || ''} ${author.lastName || ''}`.trim())
    .filter(Boolean)
  return names.join(', ') || 'Unknown author'
}

// "Hot ebooks"/"Hot audiobooks" on Home show real Gutendex/LibriVox catalog
// items that haven't been pushed into BookWorm's own Book collection (no
// chapters, no in-app reader text) - so unlike BookCard, this links straight
// out to the source instead of wiring up Save/Read against a book id that
// doesn't exist here. Reuses BookCard's own class names so it matches the
// rest of Home's rows without a separate stylesheet.
function ExternalMediaCard({ item, kind }) {
  const isEbook = kind === 'ebook'
  const title = item.title || 'Untitled'
  const author = isEbook ? getAuthor(item) : getAudiobookAuthor(item)
  const cover = isEbook ? getCover(item) : getIarchiveCover(item.urlIarchive)
  const meta = isEbook
    ? `${(item.download_count || 0).toLocaleString()} downloads on Gutenberg`
    : item.totalTime
      ? `${item.totalTime} runtime`
      : 'LibriVox audiobook'
  const externalUrl = isEbook
    ? item.formats?.['text/html'] || `https://www.gutenberg.org/ebooks/${item.id}`
    : item.urlLibrivox || item.urlIarchive

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
        <span className="category">{isEbook ? 'Gutenberg' : 'LibriVox'}</span>
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
// plumbing doesn't apply to items that aren't in the Book collection.
function ExternalMediaCarousel({ items, kind }) {
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
          <div className="book-carousel-item" key={item.id}>
            <ExternalMediaCard item={item} kind={kind} />
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
