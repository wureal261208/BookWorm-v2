import { useEffect, useRef, useState } from 'react'
import { mongoApi } from './mongoApi'

const NONE_COVER = 'https://icons.veryicon.com/png/o/miscellaneous/myicon-1/none-1.png'

export default function SearchAutocomplete({ onPick, placeholder = 'Search books...' }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setOpen(false)
      return
    }

    setLoading(true)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await mongoApi(`/api/books?q=${encodeURIComponent(query.trim())}&limit=8`)
        setResults(data.books)
        setOpen(true)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => clearTimeout(debounceRef.current)
  }, [query])

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="mongo-autocomplete" ref={containerRef}>
      <div className="mongo-search-box">
        <i className="bi bi-search" />
        <input
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          value={query}
        />
        {loading && <i className="bi bi-arrow-repeat mongo-search-spinner" />}
      </div>
      {open && results.length > 0 && (
        <ul className="mongo-autocomplete-dropdown">
          {results.map((book) => (
            <li key={book.id}>
              <button
                onClick={() => {
                  setQuery(book.title)
                  setOpen(false)
                  onPick(book)
                }}
                type="button"
              >
                <img
                  alt=""
                  onError={(event) => {
                    event.currentTarget.src = NONE_COVER
                  }}
                  src={book.cover || NONE_COVER}
                />
                <div>
                  <strong>{book.title}</strong>
                  <span>{book.author}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
