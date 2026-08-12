import { useMemo, useState } from 'react'
import BookGrid from '../books/BookGrid'
import { getAuthor, getCover } from '../../utils/bookUtils'

const BOOKS_PER_PAGE = 12

function DiscoverPage({
  books,
  favorites,
  onDetail,
  onFavorite,
  onRead,
  onRent,
  rentals = [],
  onSearchSubmit,
  query,
  searchableBooks = [],
  searchHistory = [],
  setTopic,
  topic,
  topics,
  viewCounts,
  viewerCounts,
}) {
  const [draftSearch, setDraftSearch] = useState(query)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [activeLibraryMode, setActiveLibraryMode] = useState('read')
  const [pagination, setPagination] = useState({ page: 1, scope: '' })
  const normalizedDraft = draftSearch.trim().toLowerCase()
  const paginationScope = `${query}|${topic}`
  const dropdownItems = useMemo(() => {
    const candidates = [
      ...searchHistory.map((term) => {
        const matchedBook = findSearchBook(term, searchableBooks)
        return {
          cover: matchedBook ? getCover(matchedBook) : '',
          label: term,
          type: matchedBook ? 'Recent book' : 'Recent',
        }
      }),
      ...searchableBooks.flatMap((book) => [
        { cover: getCover(book), label: book.title, type: 'Book' },
        { cover: getCover(book), label: getAuthor(book), type: 'Author' },
      ]),
    ]
    const seen = new Set()

    return candidates
      .filter((item) => {
        const key = item.label.trim().toLowerCase()
        if (!key || seen.has(key)) return false
        seen.add(key)
        return !normalizedDraft || key.includes(normalizedDraft)
      })
      .slice(0, 8)
  }, [normalizedDraft, searchableBooks, searchHistory])
  const totalPages = Math.max(1, Math.ceil(books.length / BOOKS_PER_PAGE))
  const scopedPage = pagination.scope === paginationScope ? pagination.page : 1
  const currentPage = Math.min(scopedPage, totalPages)
  const pagedBooks = useMemo(() => {
    const startIndex = (currentPage - 1) * BOOKS_PER_PAGE
    return books.slice(startIndex, startIndex + BOOKS_PER_PAGE)
  }, [books, currentPage])

  function submitSearch(term = draftSearch) {
    const nextTerm = term.trim()
    setDraftSearch(nextTerm)
    setIsDropdownOpen(false)
    onSearchSubmit(nextTerm)
  }

  function goToPage(page) {
    setPagination({ page, scope: paginationScope })
  }

  return (
    <div className="discover-page">
      <section className="page-title">
        <p className="mono-eyebrow">Discover / Library</p>
        <h1>Find your next book</h1>
      </section>

      <section className="tool-panel">
        <div className="mode-tabs">
          <button className={activeLibraryMode === 'read' ? 'active' : ''} onClick={() => setActiveLibraryMode('read')} type="button">
            <i className="bi bi-journal-text" />
            Read books
          </button>
          <button className={activeLibraryMode === 'rent' ? 'active' : ''} onClick={() => setActiveLibraryMode('rent')} type="button">
            <i className="bi bi-bag-plus" />
            Rent books
          </button>
        </div>
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
                placeholder="Search title or author..."
              />
            </label>
            {isDropdownOpen && (
              <div className="search-dropdown">
                {dropdownItems.length ? (
                  dropdownItems.map((item) => (
                    <button key={`${item.type}-${item.label}`} onMouseDown={() => submitSearch(item.label)} type="button">
                      {item.cover ? (
                        <img src={item.cover} alt="" />
                      ) : (
                        <i className="bi bi-clock-history" />
                      )}
                      <span>{item.label}</span>
                      <small>{item.type}</small>
                    </button>
                  ))
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
      </section>

      {books.length ? (
        <>
          <div className="results-summary">
            <span>{books.length} books found</span>
            <span>Page {currentPage} of {totalPages}</span>
          </div>
          <BookGrid
            books={pagedBooks}
            favorites={favorites}
            onDetail={onDetail}
            onFavorite={onFavorite}
            onRead={onRead}
            onRent={onRent}
            rentals={rentals}
            variant={activeLibraryMode === 'rent' ? 'rent' : 'read'}
            viewCounts={viewCounts}
            viewerCounts={viewerCounts}
          />
          {totalPages > 1 && (
            <nav className="pagination" aria-label="Book results pagination">
              <button disabled={currentPage === 1} onClick={() => goToPage(currentPage - 1)} type="button">
                <i className="bi bi-chevron-left" />
                Prev
              </button>
              {getPageNumbers(currentPage, totalPages).map((page) => (
                <button
                  className={currentPage === page ? 'active' : ''}
                  key={page}
                  onClick={() => goToPage(page)}
                  type="button"
                >
                  {page}
                </button>
              ))}
              <button disabled={currentPage === totalPages} onClick={() => goToPage(currentPage + 1)} type="button">
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

function findSearchBook(term, books) {
  const normalizedTerm = term.trim().toLowerCase()
  if (!normalizedTerm) return null

  return books.find((book) => {
    const title = book.title.toLowerCase()
    const author = getAuthor(book).toLowerCase()
    return title === normalizedTerm || author === normalizedTerm || title.includes(normalizedTerm) || author.includes(normalizedTerm)
  })
}

function getPageNumbers(currentPage, totalPages) {
  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1])
  return [...pages].filter((page) => page >= 1 && page <= totalPages).sort((first, second) => first - second)
}

export default DiscoverPage
