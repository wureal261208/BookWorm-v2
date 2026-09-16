import { useEffect, useState } from 'react'
import { publicApiFetch } from '../../utils/apiClient'
import { FAMILIAR_GENRES } from '../../data/genres'
import BookGrid from '../books/BookGrid'

const QUANTITY_OPTIONS = [5, 10, 15]
const SORT_OPTIONS = [
  { id: 'recent', label: 'Newest' },
  { id: 'views', label: 'Most read' },
]
const MAX_GENRES = 5

// Every result on this page is a genuinely random pick from the real
// published catalog (sort=random -> a MongoDB $sample, see listBooks in
// bookController.js) - "Sort results by" only reorders the batch that
// comes back, it doesn't change which books get drawn. There's no
// weighting toward what a given visitor might like; that would need a
// real recommendation engine, which this isn't.
function RandomPage({ favorites, onDetail, onFavorite, onRead, viewCounts, viewerCounts }) {
  const [quickBook, setQuickBook] = useState(null)
  const [quickLoading, setQuickLoading] = useState(true)

  function spinQuick() {
    setQuickLoading(true)
    publicApiFetch('/api/books?limit=1&sort=random')
      .then((data) => setQuickBook(data.books?.[0] || null))
      .catch(() => setQuickBook(null))
      .finally(() => setQuickLoading(false))
  }

  useEffect(() => {
    spinQuick()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [selectedGenres, setSelectedGenres] = useState([])
  const [quantity, setQuantity] = useState(5)
  const [sort, setSort] = useState('recent')
  const [results, setResults] = useState([])
  const [resultsLoading, setResultsLoading] = useState(false)
  const [hasSpun, setHasSpun] = useState(false)

  function toggleGenre(genre) {
    setSelectedGenres((current) => {
      if (current.includes(genre)) return current.filter((entry) => entry !== genre)
      if (current.length >= MAX_GENRES) return current
      return [...current, genre]
    })
  }

  function spinAdvanced() {
    setResultsLoading(true)
    setHasSpun(true)
    const params = new URLSearchParams({ limit: String(quantity), sort: 'random' })
    if (selectedGenres.length) params.set('category', selectedGenres.join(','))

    publicApiFetch(`/api/books?${params.toString()}`)
      .then((data) => {
        const books = Array.isArray(data.books) ? data.books : []
        // The random draw itself already happened server-side - this just
        // orders the resulting batch for display, same two real criteria
        // Discover's sort uses.
        const ordered = sort === 'views'
          ? [...books].sort((first, second) => (second.views || 0) - (first.views || 0))
          : [...books].sort((first, second) => new Date(second.createdAt || 0) - new Date(first.createdAt || 0))
        setResults(ordered)
      })
      .catch(() => setResults([]))
      .finally(() => setResultsLoading(false))
  }

  return (
    <div className="random-page">
      <section className="page-title">
        <p className="mono-eyebrow">Feeling lucky?</p>
        <h1>Random books</h1>
      </section>

      <section className="tool-panel random-quick-panel">
        <div className="section-heading">
          <div>
            <p className="mono-eyebrow">Quick random</p>
            <h2>One random pick</h2>
          </div>
          <button className="primary-button" onClick={spinQuick} type="button">
            <i className="bi bi-arrow-repeat" />
            Random again
          </button>
        </div>

        {quickLoading ? (
          <div className="discover-loading-grid">
            <div className="book-card-skeleton" />
          </div>
        ) : quickBook ? (
          <BookGrid
            books={[quickBook]}
            favorites={favorites}
            onDetail={onDetail}
            onFavorite={onFavorite}
            onRead={onRead}
            variant="read"
            viewCounts={viewCounts}
            viewerCounts={viewerCounts}
          />
        ) : (
          <p className="empty-state">Could not find a book to suggest right now.</p>
        )}
      </section>

      <section className="tool-panel random-advanced-panel">
        <div className="section-heading">
          <div>
            <p className="mono-eyebrow">Advanced random</p>
            <h2>Pick your own mix</h2>
          </div>
        </div>

        <div className="random-advanced-grid">
          <div className="random-advanced-column">
            <p className="random-field-label">Sort results by</p>
            <div className="topic-row">
              {SORT_OPTIONS.map((option) => (
                <button
                  className={sort === option.id ? 'active' : ''}
                  key={option.id}
                  onClick={() => setSort(option.id)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>

            <p className="random-field-label">How many books</p>
            <div className="topic-row">
              {QUANTITY_OPTIONS.map((count) => (
                <button
                  className={quantity === count ? 'active' : ''}
                  key={count}
                  onClick={() => setQuantity(count)}
                  type="button"
                >
                  {count}
                </button>
              ))}
            </div>
          </div>

          <div className="random-advanced-column">
            <p className="random-field-label">Genres (pick up to {MAX_GENRES} - none picked means all)</p>
            <div className="random-genre-grid">
              {FAMILIAR_GENRES.map((genre) => (
                <button
                  className={selectedGenres.includes(genre) ? 'active' : ''}
                  disabled={!selectedGenres.includes(genre) && selectedGenres.length >= MAX_GENRES}
                  key={genre}
                  onClick={() => toggleGenre(genre)}
                  type="button"
                >
                  {genre}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button className="primary-button random-spin-button" onClick={spinAdvanced} type="button">
          <i className="bi bi-shuffle" />
          Randomize
        </button>

        {resultsLoading ? (
          <div className="discover-loading-grid">
            {Array.from({ length: quantity }).map((_, index) => (
              <div className="book-card-skeleton" key={index} />
            ))}
          </div>
        ) : hasSpun && results.length ? (
          <BookGrid
            books={results}
            favorites={favorites}
            onDetail={onDetail}
            onFavorite={onFavorite}
            onRead={onRead}
            variant="read"
            viewCounts={viewCounts}
            viewerCounts={viewerCounts}
          />
        ) : hasSpun ? (
          <p className="empty-state">No books matched that mix - try different genres.</p>
        ) : null}
      </section>
    </div>
  )
}

export default RandomPage
