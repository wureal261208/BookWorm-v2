import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { publicApiFetch } from '../../utils/apiClient'
import { findGenreSlide } from '../../utils/genreSlides'

const PAGE_SIZE = 24
const TYPE_TABS = [
  { id: '', label: 'All' },
  { id: 'ebook', label: 'Ebooks' },
  { id: 'audiobook', label: 'Audiobooks' },
]

// One single page for every category, per spec - no /books/romance,
// /books/fantasy, etc. The category itself lives in the URL as
// ?category=, and everything below just re-reads it and re-fetches
// whenever it changes (a banner click on Home, an AI Suggestion click,
// or a direct link all land here the same way).
function BooksPage() {
  const [searchParams] = useSearchParams()
  const category = searchParams.get('category') || ''
  const [type, setType] = useState('')
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')

  // A new category (or switching the type tab) always starts back at
  // page 1 and replaces the list rather than appending to it - only the
  // explicit "Load more" click appends.
  useEffect(() => {
    let ignore = false
    setLoading(true)
    setError('')
    setPage(1)

    const params = new URLSearchParams({ page: '1', limit: String(PAGE_SIZE) })
    if (category) params.set('category', category)
    if (type) params.set('type', type)

    publicApiFetch(`/api/content?${params.toString()}`)
      .then((data) => {
        if (ignore) return
        setItems(Array.isArray(data?.items) ? data.items : [])
        setTotal(data?.total || 0)
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
  }, [category, type])

  function loadMore() {
    const nextPage = page + 1
    setLoadingMore(true)

    const params = new URLSearchParams({ page: String(nextPage), limit: String(PAGE_SIZE) })
    if (category) params.set('category', category)
    if (type) params.set('type', type)

    publicApiFetch(`/api/content?${params.toString()}`)
      .then((data) => {
        setItems((current) => [...current, ...(Array.isArray(data?.items) ? data.items : [])])
        setPage(nextPage)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingMore(false))
  }

  const slide = findGenreSlide(category)
  const hasMore = items.length < total

  return (
    <div className="books-page">
      <section
        className="books-page-banner"
        style={slide ? { backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.15), rgba(0,0,0,0.65)), url(${slide.image})` } : undefined}
      >
        <p className="mono-eyebrow">Browsing</p>
        <h1>{category || 'All books'}</h1>
      </section>

      <div className="books-page-tabs" role="tablist" aria-label="Filter by type">
        {TYPE_TABS.map((tab) => (
          <button className={type === tab.id ? 'active' : ''} key={tab.id || 'all'} onClick={() => setType(tab.id)} role="tab" type="button">
            {tab.label}
          </button>
        ))}
      </div>

      {error && <p className="admin-validation-error"><i className="bi bi-x-circle" /> {error}</p>}

      {loading ? (
        <div className="books-page-grid">
          {Array.from({ length: 8 }).map((_, index) => (
            <div className="book-card-skeleton" key={index} />
          ))}
        </div>
      ) : items.length ? (
        <>
          <div className="books-page-grid">
            {items.map((item) => (
              <a className="book-card" href={item.files?.[0]?.url || '#'} key={item._id} rel="noreferrer" target="_blank">
                <div className="book-cover-button">
                  <img alt={`${item.title} cover`} loading="lazy" src={item.cover_image || ''} />
                </div>
                <div className="book-card-body">
                  <span className="category">{item.source}</span>
                  <h2>{item.title}</h2>
                  <p>{item.author}</p>
                </div>
              </a>
            ))}
          </div>

          {hasMore && (
            <div className="books-page-load-more">
              <button className="ghost-button" disabled={loadingMore} onClick={loadMore} type="button">
                {loadingMore ? 'Loading...' : 'Load more'}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="books-page-empty">
          <i className="bi bi-hourglass-split" />
          <h2>Coming soon</h2>
          <p>{category ? `No ${category} books or audiobooks yet - check back soon.` : 'Nothing here yet - check back soon.'}</p>
        </div>
      )}
    </div>
  )
}

export default BooksPage
