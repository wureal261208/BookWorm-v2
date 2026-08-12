import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { mongoApi } from './mongoApi'
import SearchAutocomplete from './SearchAutocomplete'

const NONE_COVER = 'https://icons.veryicon.com/png/o/miscellaneous/myicon-1/none-1.png'

export default function DiscoverPage() {
  const [books, setBooks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    mongoApi('/api/books?limit=24')
      .then((data) => {
        if (!cancelled) setBooks(data.books)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="mongo-discover">
      <h1>Discover (MongoDB)</h1>
      <SearchAutocomplete onPick={(book) => navigate(`/mongo-app/book/${book.id}`)} />

      {error && <p className="settings-error">{error}</p>}
      {loading ? (
        <p className="settings-copy">Loading...</p>
      ) : (
        <div className="mongo-book-grid">
          {books.map((book) => (
            <button
              className="mongo-book-card"
              key={book.id}
              onClick={() => navigate(`/mongo-app/book/${book.id}`)}
              type="button"
            >
              <img
                alt=""
                onError={(event) => {
                  event.currentTarget.src = NONE_COVER
                }}
                src={book.cover || NONE_COVER}
              />
              <strong>{book.title}</strong>
              <span>{book.author}</span>
              <em className={`admin-status ${book.usageType === 'none' ? 'status-draft' : 'status-published'}`}>
                {book.usageType}
              </em>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
