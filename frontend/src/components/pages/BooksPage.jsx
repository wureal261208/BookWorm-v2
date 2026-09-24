import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { publicApiFetch } from '../../utils/apiClient'
import { findGenreSlide } from '../../utils/genreSlides'
import ExternalMediaCarousel from '../books/ExternalMediaCarousel'

const CAROUSEL_LIMIT = 24

// One single page for every category, per spec - no /books/romance,
// /books/fantasy, etc. `category`, `type` and `q` (search) all live in the
// URL rather than in-page tab state - the Ebooks/Audiobooks navbar links,
// the promo banner, AI Suggestions clicks, and the header search box all
// just set the query string differently and land here the same way.
function BooksPage() {
  const [searchParams] = useSearchParams()
  const category = searchParams.get('category') || ''
  const type = searchParams.get('type') || ''
  const query = searchParams.get('q') || ''

  const slide = findGenreSlide(category)
  // A specific type in the URL (from the Ebooks/Audiobooks navbar links)
  // means show just that one section as a full-width carousel. With no
  // type - a category click, a search, or an AI Suggestion - show both
  // sections side by side, each its own "giống trang main" carousel row
  // (see ExternalMediaCarousel.jsx, shared with Home's Hot ebooks/
  // audiobooks rows for a consistent look).
  const showEbooks = type !== 'audiobook'
  const showAudiobooks = type !== 'ebook'

  let heading = 'All books'
  if (query) heading = `Search results for "${query}"`
  else if (category) heading = category
  else if (type === 'ebook') heading = 'Ebooks'
  else if (type === 'audiobook') heading = 'Audiobooks'

  return (
    <div className="books-page">
      {/* The big background banner only makes sense when there's an actual
          genre behind it (a promo-banner/AI-suggestion click) - a plain
          heading covers search and the Ebooks/Audiobooks navbar links,
          which don't have a matching piece of artwork. */}
      {category ? (
        <section
          className="books-page-banner"
          style={slide ? { backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.15), rgba(0,0,0,0.65)), url(${slide.image})` } : undefined}
        >
          <p className="mono-eyebrow">Browsing</p>
          <h1>{heading}</h1>
        </section>
      ) : (
        <h1 className="books-page-heading">{heading}</h1>
      )}

      {showEbooks && <BooksPageSection category={category} query={query} type="ebook" />}
      {showAudiobooks && <BooksPageSection category={category} query={query} type="audiobook" />}
    </div>
  )
}

// One type's worth of results as its own titled carousel row, with its own
// independent loading/empty state - an empty Audiobooks section (say, a
// category nothing's been tagged with yet) never blocks the Ebooks section
// above it from showing, and vice versa.
function BooksPageSection({ category, query, type }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let ignore = false
    setLoading(true)
    setError('')

    const params = new URLSearchParams({ type, limit: String(CAROUSEL_LIMIT) })
    if (category) params.set('category', category)
    if (query) params.set('search', query)

    publicApiFetch(`/api/content?${params.toString()}`)
      .then((data) => {
        if (!ignore) setItems(Array.isArray(data?.items) ? data.items : [])
      })
      .catch((err) => {
        if (!ignore) setError(err.message)
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })

    return () => {
      ignore = true
    }
  }, [category, query, type])

  return (
    <section className="section-block">
      <div className="section-heading">
        <div>
          <p className="mono-eyebrow">{type === 'ebook' ? 'Reading' : 'Listening'}</p>
          <h2>{type === 'ebook' ? 'Ebooks' : 'Audiobooks'}</h2>
        </div>
      </div>

      {error && <p className="admin-validation-error"><i className="bi bi-x-circle" /> {error}</p>}

      {loading ? (
        <div className="book-carousel">
          <div className="book-carousel-track">
            {Array.from({ length: 6 }).map((_, index) => (
              <div className="book-carousel-item" key={index}>
                <div className="book-card-skeleton" />
              </div>
            ))}
          </div>
        </div>
      ) : items.length ? (
        <ExternalMediaCarousel items={items} />
      ) : (
        <div className="books-page-empty">
          <i className="bi bi-hourglass-split" />
          <h2>Coming soon</h2>
          <p>No {type === 'ebook' ? 'ebooks' : 'audiobooks'} here yet{category ? ` for ${category}` : ''} - check back soon.</p>
        </div>
      )}
    </section>
  )
}

export default BooksPage
