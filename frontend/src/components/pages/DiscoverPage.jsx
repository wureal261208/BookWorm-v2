import { useEffect, useState } from 'react'
import BookGrid from '../books/BookGrid'
import { getCover } from '../../utils/bookUtils'
import { publicApiFetch } from '../../utils/apiClient'

const BOOKS_PER_PAGE = 20
const sortOptions = [
  { id: 'recent', label: 'Newest', icon: 'bi-sparkle' },
  { id: 'views', label: 'Most read', icon: 'bi-fire' },
]

// Discover has to browse a ~72,000-book catalog, so it can never just page
// through a fixed array handed down from App.jsx (that only ever holds a
// small recent sample). Every filter change below - search, topic, sort,
// or page - re-queries the server directly, the same pattern Book
// Management's own catalog fetch uses in AdminPage.jsx.
function DiscoverPage({
  favorites,
  onDetail,
  onFavorite,
  onRead,
  onSearchSubmit,
  query,
  searchHistory = [],
  setTopic,
  topic,
  topics,
  viewCounts,
  viewerCounts,
}) {
  const [draftSearch, setDraftSearch] = useState(query)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [sort, setSort] = useState('recent')
  const [page, setPage] = useState(1)

  const [resultBooks, setResultBooks] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [suggestions, setSuggestions] = useState([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)

  useEffect(() => {
    setDraftSearch(query)
  }, [query])

  // Reset back to page 1 whenever the filters actually change, instead of
  // staying on e.g. page 6 of a brand-new, much shorter result set.
  useEffect(() => {
    setPage(1)
  }, [query, topic, sort])

  useEffect(() => {
    let ignore = false
    setLoading(true)
    setLoadError('')

    const params = new URLSearchParams({ page: String(page), limit: String(BOOKS_PER_PAGE), sort })
    if (topic && topic !== 'all') params.set('category', topic)
    if (query.trim()) params.set('q', query.trim())

    publicApiFetch(`/api/books?${params.toString()}`)
      .then((data) => {
        if (ignore) return
        setResultBooks(Array.isArray(data.books) ? data.books : [])
        setTotal(data.total || 0)
      })
      .catch((error) => {
        if (!ignore) setLoadError(error.message || 'Could not load books right now.')
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })

    return () => {
      ignore = true
    }
  }, [page, query, sort, topic])

  // Lightweight "did you mean" suggestions while typing, from the server -
  // debounced and capped small (6 results) so it never re-runs the main,
  // heavier paginated fetch above on every keystroke.
  useEffect(() => {
    const trimmed = draftSearch.trim()
    if (trimmed.length < 2) {
      setSuggestions([])
      setSuggestionsLoading(false)
      return undefined
    }

    let ignore = false
    setSuggestionsLoading(true)
    const timeout = setTimeout(() => {
      publicApiFetch(`/api/books?limit=6&q=${encodeURIComponent(trimmed)}`)
        .then((data) => {
          if (!ignore) setSuggestions(Array.isArray(data.books) ? data.books : [])
        })
        .catch(() => {
          if (!ignore) setSuggestions([])
        })
        .finally(() => {
          if (!ignore) setSuggestionsLoading(false)
        })
    }, 300)

    return () => {
      ignore = true
      clearTimeout(timeout)
    }
  }, [draftSearch])

  const totalPages = Math.max(1, Math.ceil(total / BOOKS_PER_PAGE))
  const normalizedDraft = draftSearch.trim().toLowerCase()
  const historyItems = searchHistory
    .filter((term) => !normalizedDraft || term.toLowerCase().includes(normalizedDraft))
    .filter((term) => !suggestions.some((book) => book.title.toLowerCase() === term.toLowerCase()))
    .slice(0, 4)

  function submitSearch(term = draftSearch) {
    const nextTerm = term.trim()
    setDraftSearch(nextTerm)
    setIsDropdownOpen(false)
    onSearchSubmit(nextTerm)
  }

  return (
    <div className="discover-page">
      <section className="page-title">
        <p className="mono-eyebrow">Discover / Library</p>
        <h1>Find your next book</h1>
      </section>

      <section className="tool-panel">
        <form className="discover-search" onSubmit={(event) => {
          event.preventDefault()
          submitSearch()
        }}>
          <div className="search-combobox">
            <label className="search-box">
              <i className="bi bi-search" />
              <input
                value={draftSearch}
                onBlur={() => window.setTimeout(() => setIsDropdownOpen(false), 140)}
                onChange={(event) => {
                  setDraftSearch(event.target.value)
                  setIsDropdownOpen(true)
                }}
                onFocus={() => setIsDropdownOpen(true)}
                placeholder="Search title or author across the whole catalog..."
              />
            </label>
            {isDropdownOpen && (
              <div className="search-dropdown">
                {suggestionsLoading ? (
                  <p><span className="admin-spin-small" /> Searching...</p>
                ) : suggestions.length || historyItems.length ? (
                  <>
                    {historyItems.map((term) => (
                      <button key={`history-${term}`} onMouseDown={() => submitSearch(term)} type="button">
                        <i className="bi bi-clock-history" />
                        <span>{term}</span>
                        <small>Recent</small>
                      </button>
                    ))}
                    {suggestions.map((book) => (
                      <button key={book.id || book._id} onMouseDown={() => submitSearch(book.title)} type="button">
                        <img alt="" src={getCover(book)} />
                        <span>{book.title}</span>
                        <small>Book</small>
                      </button>
                    ))}
                  </>
                ) : (
                  <p>No matching search.</p>
                )}
              </div>
            )}
          </div>
          <button className="primary-button" type="submit">
            <i className="bi bi-search" />
            Search
          </button>
          {query && (
            <button className="ghost-button" onClick={() => submitSearch('')} type="button">
              <i className="bi bi-x-circle" />
              Clear
            </button>
          )}
        </form>

        <div className="topic-row">
          {topics.map((item) => (
            <button className={topic === item ? 'active' : ''} onClick={() => setTopic(item)} key={item} type="button">
              {item}
            </button>
          ))}
        </div>

        <div className="topic-row discover-sort-row">
          {sortOptions.map((option) => (
            <button
              className={sort === option.id ? 'active' : ''}
              key={option.id}
              onClick={() => setSort(option.id)}
              type="button"
            >
              <i className={`bi ${option.icon}`} />
              {option.label}
            </button>
          ))}
        </div>
      </section>

      {loading ? (
        <div className="discover-loading-grid" aria-label="Loading books">
          {Array.from({ length: 8 }).map((_, index) => (
            <div className="book-card-skeleton" key={index} />
          ))}
        </div>
      ) : loadError ? (
        <div className="empty-state">
          <i className="bi bi-exclamation-triangle" />
          {loadError}
        </div>
      ) : resultBooks.length ? (
        <>
          <div className="results-summary">
            <span>{total.toLocaleString()} books found</span>
            <span>Page {page} of {totalPages}</span>
          </div>
          <BookGrid
            books={resultBooks}
            favorites={favorites}
            onDetail={onDetail}
            onFavorite={onFavorite}
            onRead={onRead}
            variant="read"
            viewCounts={viewCounts}
            viewerCounts={viewerCounts}
          />
          {totalPages > 1 && (
            <nav className="pagination" aria-label="Book results pagination">
              <button disabled={page === 1} onClick={() => setPage((value) => value - 1)} type="button">
                <i className="bi bi-chevron-left" />
                Prev
              </button>
              {getPageNumbers(page, totalPages).map((item, index) =>
                item === 'ellipsis' ? (
                  <span className="pagination-ellipsis" key={`ellipsis-${index}`}>...</span>
                ) : (
                  <button
                    className={page === item ? 'active' : ''}
                    key={item}
                    onClick={() => setPage(item)}
                    type="button"
                  >
                    {item}
                  </button>
                ),
              )}
              <button disabled={page === totalPages} onClick={() => setPage((value) => value + 1)} type="button">
                Next
                <i className="bi bi-chevron-right" />
              </button>
            </nav>
          )}
        </>
      ) : (
        <div className="empty-state">No books match your search.</div>
      )}
    </div>
  )
}

export function getPageNumbers(current, total) {
  // Small catalogs of results (few enough pages to show in full) just list
  // every page - the ellipsis-collapsing window below is only worth it once
  // there are more pages than reasonably fit in the pagination bar.
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1)
  }

  const items = []
  const pages = new Set([1, total, current - 1, current, current + 1].filter((page) => page >= 1 && page <= total))
  const sorted = [...pages].sort((first, second) => first - second)

  let previous = 0
  for (const page of sorted) {
    if (previous && page - previous > 1) items.push('ellipsis')
    items.push(page)
    previous = page
  }
  return items
}

export default DiscoverPage
