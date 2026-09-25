import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { publicApiFetch } from '../../utils/apiClient'
import { useNavigation } from '../../context/NavigationContext'
import { GENRE_SLIDES } from '../../utils/genreSlides'

const RECENT_SEARCHES_KEY = 'bookworm_recent_searches'
const MAX_RECENT_SEARCHES = 6

// Purely local to this browser - not synced to the account, so there's
// nothing here that needs the same "protect the user's account" care as
// the chat history endpoints. Just a UX nicety, not user data worth
// persisting server-side.
function readRecentSearches() {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function rememberRecentSearch(term) {
  const trimmed = term.trim()
  if (!trimmed) return
  const next = [trimmed, ...readRecentSearches().filter((existing) => existing.toLowerCase() !== trimmed.toLowerCase())].slice(
    0,
    MAX_RECENT_SEARCHES,
  )
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next))
  } catch {
    // Storage can be unavailable (private mode, quota) - recent searches
    // just won't persist this session, not worth surfacing an error for.
  }
}

// Wattpad-style search: a sticky Books/Authors tab rail on the left, an
// empty state (recent searches + a category grid) when there's no query
// yet, and tab-appropriate results once there is one. "Authors" searches
// Content.author, not real user accounts - this site has no public user
// profiles to browse, so there was nothing else honest to put there (see
// backend/controllers/contentController.js's searchAuthors for the same
// note).
function SearchPage() {
  const { navigateTo } = useNavigation()
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') || ''
  const [tab, setTab] = useState('books')
  const [recentSearches, setRecentSearches] = useState(readRecentSearches)

  useEffect(() => {
    if (query) {
      rememberRecentSearch(query)
      setRecentSearches(readRecentSearches())
    }
  }, [query])

  return (
    <div className="search-page">
      <aside className="search-page-tabs">
        <button className={tab === 'books' ? 'active' : ''} onClick={() => setTab('books')} type="button">
          <i className="bi bi-book" /> Books
        </button>
        <button className={tab === 'authors' ? 'active' : ''} onClick={() => setTab('authors')} type="button">
          <i className="bi bi-person" /> Authors
        </button>
      </aside>

      <div className="search-page-content">
        {!query ? (
          <SearchEmptyState navigateTo={navigateTo} recentSearches={recentSearches} />
        ) : tab === 'books' ? (
          <BooksResults navigateTo={navigateTo} query={query} />
        ) : (
          <AuthorsResults navigateTo={navigateTo} query={query} />
        )}
      </div>
    </div>
  )
}

function SearchEmptyState({ navigateTo, recentSearches }) {
  return (
    <div className="search-empty-state">
      {recentSearches.length > 0 && (
        <section>
          <h3>Recent Searches</h3>
          <div className="search-recent-list">
            {recentSearches.map((term) => (
              <button key={term} onClick={() => navigateTo('search', { query: `q=${encodeURIComponent(term)}` })} type="button">
                <i className="bi bi-clock-history" /> {term}
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3>Browse Categories</h3>
        <div className="search-category-grid">
          {GENRE_SLIDES.map((slide) => (
            <button
              key={slide.id}
              onClick={() => navigateTo('books', { query: `category=${encodeURIComponent(slide.topic)}` })}
              style={{ backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.1), rgba(0,0,0,0.55)), url(${slide.image})` }}
              type="button"
            >
              {slide.topic}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

function BooksResults({ navigateTo, query }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let ignore = false
    setLoading(true)
    setError('')
    publicApiFetch(`/api/content?search=${encodeURIComponent(query)}&limit=30`)
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
  }, [query])

  if (loading) return <p>Searching...</p>
  if (error) return <p className="admin-validation-error"><i className="bi bi-x-circle" /> {error}</p>
  if (!items.length) return <p className="empty-state">No results found.</p>

  return (
    <div className="search-results-list">
      {items.map((item) => (
        <button
          className="search-result-row"
          key={item._id}
          onClick={() => navigateTo(item.type === 'ebook' ? 'read' : 'listen', { query: `id=${item._id}` })}
          type="button"
        >
          <img alt="" src={item.cover_image || ''} />
          <span className="search-result-text">
            <span className={`ai-chat-tag ai-chat-tag-${item.type}`}>{item.type === 'ebook' ? 'Ebook' : 'Audiobook'}</span>
            <strong>{item.title}</strong>
            <small>{item.author}</small>
          </span>
        </button>
      ))}
    </div>
  )
}

function AuthorsResults({ navigateTo, query }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let ignore = false
    setLoading(true)
    setError('')
    publicApiFetch(`/api/content/authors?q=${encodeURIComponent(query)}&limit=30`)
      .then((data) => {
        if (!ignore) setItems(Array.isArray(data) ? data : [])
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
  }, [query])

  if (loading) return <p>Searching...</p>
  if (error) return <p className="admin-validation-error"><i className="bi bi-x-circle" /> {error}</p>
  // "None user found" per Wun's call - this tab searches book authors, not
  // real accounts, but keeps the plain "nothing here" wording simple.
  if (!items.length) return <p className="empty-state">None user found.</p>

  return (
    <div className="search-results-list">
      {items.map((entry) => (
        <button
          className="search-result-row search-author-row"
          key={entry.author}
          onClick={() => navigateTo('search', { query: `q=${encodeURIComponent(entry.author)}` })}
          type="button"
        >
          <span className="search-author-avatar">
            <i className="bi bi-person-fill" />
          </span>
          <span className="search-result-text">
            <strong>{entry.author}</strong>
            <small>{entry.count} title{entry.count === 1 ? '' : 's'}</small>
          </span>
        </button>
      ))}
    </div>
  )
}

export default SearchPage
