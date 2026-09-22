import { useEffect, useState } from 'react'
import { publicApiFetch } from '../../utils/apiClient'
import { useNavigation } from '../../context/NavigationContext'

// Honest about what this is: there's no per-user reading/listening-history
// model behind this yet (Content has no view/play tracking at all, unlike
// the old Book model), so these are the site's overall top categories, not
// a personalized pick - the same "real data, not fake personalization"
// standard the rest of the app holds itself to (see HomePage.jsx's own
// comments on "Recommended for you"). Replacing this endpoint's query with
// a per-user filter is the natural next step once Content gets its own
// view/play tracking.
function AiSuggestionsPage() {
  const { navigateTo } = useNavigation()
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let ignore = false
    publicApiFetch('/api/content/top-categories?limit=12')
      .then((data) => {
        if (!ignore) setCategories(Array.isArray(data) ? data : [])
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
  }, [])

  return (
    <div className="ai-suggestions-page">
      <div className="section-heading">
        <div>
          <p className="mono-eyebrow">Trending on BookWorm</p>
          <h2>AI Suggestions</h2>
        </div>
        <span>Today's most popular categories across ebooks and audiobooks.</span>
      </div>

      {error && <p className="admin-validation-error"><i className="bi bi-x-circle" /> {error}</p>}

      {loading ? (
        <div className="ai-suggestions-grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <div className="book-card-skeleton" key={index} />
          ))}
        </div>
      ) : categories.length ? (
        <div className="ai-suggestions-grid">
          {categories.map((entry) => (
            <button
              className="ai-suggestion-card"
              key={entry.category}
              onClick={() => navigateTo('books', { query: `category=${encodeURIComponent(entry.category)}` })}
              type="button"
            >
              <i className="bi bi-stars" />
              <strong>{entry.category}</strong>
              <span>{entry.count} titles</span>
            </button>
          ))}
        </div>
      ) : (
        <p>Nothing to suggest yet - check back once more content has synced.</p>
      )}
    </div>
  )
}

export default AiSuggestionsPage
