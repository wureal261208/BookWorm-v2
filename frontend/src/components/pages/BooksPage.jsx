import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { publicApiFetch } from '../../utils/apiClient'
import { findGenreSlide } from '../../utils/genreSlides'
import { getCover, NO_COVER_IMAGE } from '../../utils/bookUtils'
import { useNavigation } from '../../context/NavigationContext'
import ExternalMediaCarousel from '../books/ExternalMediaCarousel'

const INITIAL_LIMIT = 24
const POPULAR_GENRES = [
  'All',
  'Fiction',
  'Literature',
  'Mystery',
  'Romance',
  'Science Fiction',
  'Adventure',
  'History',
  'Philosophy',
  'Children',
  'Poetry',
]

function BooksPage() {
  const [searchParams] = useSearchParams()
  const urlCategory = searchParams.get('category') || ''
  const type = searchParams.get('type') || ''

  const [selectedGenre, setSelectedGenre] = useState(urlCategory || 'All')
  const [viewMode, setViewMode] = useState('grid') // 'grid' | 'carousel'
  const [sortBy, setSortBy] = useState('popular') // 'popular' | 'alpha' | 'newest'

  // Sync category if changed via external navigation
  useEffect(() => {
    setSelectedGenre(urlCategory || 'All')
  }, [urlCategory])

  const activeCategory = selectedGenre === 'All' ? '' : selectedGenre
  const slide = findGenreSlide(activeCategory)
  const showEbooks = type !== 'audiobook'
  const showAudiobooks = type !== 'ebook'

  let heading = 'All Books & Media'
  if (activeCategory) heading = activeCategory
  else if (type === 'ebook') heading = 'Ebooks Catalog'
  else if (type === 'audiobook') heading = 'Audiobooks Catalog'

  return (
    <div className="books-page">
      {/* Banner / Header */}
      {activeCategory ? (
        <section
          className="books-page-banner"
          style={slide ? { backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.2), rgba(0,0,0,0.72)), url(${slide.image})` } : undefined}
        >
          <p className="mono-eyebrow">Category Shelf</p>
          <h1>{heading}</h1>
        </section>
      ) : (
        <header className="books-page-hero">
          <div className="books-hero-eyebrow">
            <i className={`bi ${type === 'audiobook' ? 'bi-headphones' : type === 'ebook' ? 'bi-book-fill' : 'bi-collection-play'}`} />
            <span>Digital Library</span>
          </div>
          <h1 className="books-page-heading">{heading}</h1>
          <p className="books-page-subheading">
            Browse through thousands of classics and public domain literary works. Read in your browser or listen with full narration.
          </p>
        </header>
      )}

      {/* Genre Filter Bar */}
      <nav className="books-genre-nav" aria-label="Browse genres">
        <span className="books-genre-label"><i className="bi bi-tag" /> Genres:</span>
        <div className="books-genre-chips">
          {POPULAR_GENRES.map((genre) => (
            <button
              className={`books-genre-chip ${selectedGenre === genre ? 'active' : ''}`}
              key={genre}
              onClick={() => setSelectedGenre(genre)}
              type="button"
            >
              {genre}
            </button>
          ))}
        </div>
      </nav>

      {/* View Mode & Sorting Controls */}
      <div className="books-controls-bar">
        <div className="books-view-toggles" role="group" aria-label="Catalog layout mode">
          <button
            aria-label="Grid layout"
            className={`books-control-toggle ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')}
            title="Grid view"
            type="button"
          >
            <i className="bi bi-grid-3x3-gap-fill" />
            <span>Grid Catalog</span>
          </button>
          <button
            aria-label="Carousel layout"
            className={`books-control-toggle ${viewMode === 'carousel' ? 'active' : ''}`}
            onClick={() => setViewMode('carousel')}
            title="Carousel view"
            type="button"
          >
            <i className="bi bi-view-list" />
            <span>Carousel Spotlight</span>
          </button>
        </div>

        <div className="books-sort-selector">
          <label htmlFor="books-sort-select"><i className="bi bi-sort-down" /> Sort by:</label>
          <select
            id="books-sort-select"
            onChange={(e) => setSortBy(e.target.value)}
            value={sortBy}
          >
            <option value="popular">Most Popular</option>
            <option value="alpha">Title (A - Z)</option>
            <option value="newest">Recently Added</option>
          </select>
        </div>
      </div>

      {/* Catalog Sections */}
      {showEbooks && (
        <BooksCatalogSection
          category={activeCategory}
          sortBy={sortBy}
          type="ebook"
          viewMode={viewMode}
        />
      )}
      {showAudiobooks && (
        <BooksCatalogSection
          category={activeCategory}
          sortBy={sortBy}
          type="audiobook"
          viewMode={viewMode}
        />
      )}
    </div>
  )
}

function BooksCatalogSection({ category, sortBy, type, viewMode }) {
  const { navigateTo } = useNavigation()
  const isEbook = type === 'ebook'

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const fetchItems = useCallback((pageNum = 1, append = false) => {
    if (pageNum === 1) setLoading(true)
    else setLoadingMore(true)
    setError('')

    const params = new URLSearchParams({
      type,
      limit: String(INITIAL_LIMIT),
      page: String(pageNum),
    })
    if (category) params.set('category', category)

    publicApiFetch(`/api/content?${params.toString()}`)
      .then((data) => {
        let fetched = Array.isArray(data?.items) ? data.items : []

        // Client-side sort refinement
        if (sortBy === 'alpha') {
          fetched = [...fetched].sort((a, b) => (a.title || '').localeCompare(b.title || ''))
        } else if (sortBy === 'popular') {
          fetched = [...fetched].sort((a, b) => (b.views || b.downloadCount || 0) - (a.views || a.downloadCount || 0))
        }

        if (append) {
          setItems((prev) => [...prev, ...fetched])
        } else {
          setItems(fetched)
        }

        setPage(pageNum)
        const total = data?.total || 0
        setHasMore((pageNum * INITIAL_LIMIT) < total)
      })
      .catch((err) => {
        setError(err.message)
        if (!append) setItems([])
      })
      .finally(() => {
        setLoading(false)
        setLoadingMore(false)
      })
  }, [category, sortBy, type])

  useEffect(() => {
    fetchItems(1, false)
  }, [fetchItems])

  const openDetail = (item) => {
    navigateTo('detail', { query: `id=${item._id || item.id}` })
  }

  const handleAction = (item) => {
    navigateTo(isEbook ? 'read' : 'listen', { query: `id=${item._id || item.id}` })
  }

  return (
    <section className="section-block books-catalog-section">
      <div className="section-heading">
        <div>
          <p className="mono-eyebrow">{isEbook ? 'Reading Room' : 'Audio Theater'}</p>
          <h2>
            <i className={`bi ${isEbook ? 'bi-book' : 'bi-headphones'}`} style={{ marginRight: '8px', color: 'var(--app-accent)' }} />
            {isEbook ? 'Ebooks' : 'Audiobooks'}
          </h2>
        </div>
        {items.length > 0 && (
          <span className="books-section-counter">
            Showing {items.length} works
          </span>
        )}
      </div>

      {error && (
        <p className="admin-validation-error">
          <i className="bi bi-x-circle" /> {error}
        </p>
      )}

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
      ) : items.length > 0 ? (
        viewMode === 'carousel' ? (
          <ExternalMediaCarousel items={items} />
        ) : (
          <>
            <div className="books-catalog-grid">
              {items.map((item) => {
                const cover = getCover(item)
                const title = item.title || 'Untitled'
                const author = item.author || 'Unknown Author'
                const totalReads = (item.views || 0) + (item.downloadCount || 0)
                const meta = isEbook
                  ? `${totalReads.toLocaleString()} reads`
                  : (item.views ? `${item.views.toLocaleString()} listens` : 'LibriVox audio')

                return (
                  <article className="book-card books-grid-card" key={item._id || item.id}>
                    <button
                      className="book-cover-button"
                      onClick={() => openDetail(item)}
                      style={{ display: 'block', width: '100%', border: 0, padding: 0 }}
                      type="button"
                    >
                      <img
                        alt={`${title} cover`}
                        loading="lazy"
                        onError={(e) => {
                          if (e.currentTarget.src !== NO_COVER_IMAGE) {
                            e.currentTarget.src = NO_COVER_IMAGE
                          }
                        }}
                        src={cover}
                      />
                    </button>
                    <div className="book-card-body">
                      <span className="category">{item.source || (isEbook ? 'Gutenberg' : 'LibriVox')}</span>
                      <h2 onClick={() => openDetail(item)} style={{ cursor: 'pointer' }} title={title}>
                        {title}
                      </h2>
                      <p title={author}>{author}</p>
                    </div>
                    <div className="book-card-meta">
                      <i className={`bi ${isEbook ? 'bi-eye' : 'bi-headphones'}`} />
                      <small>{meta}</small>
                    </div>
                    <div className="card-actions">
                      <button
                        className="primary-button card-main-action-btn"
                        onClick={() => handleAction(item)}
                        type="button"
                      >
                        <i className={`bi ${isEbook ? 'bi-journal-text' : 'bi-headphones'}`} />
                        <span>{isEbook ? 'Read' : 'Listen'}</span>
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>

            {hasMore && (
              <div className="books-load-more-row">
                <button
                  className="primary-button books-load-more-btn"
                  disabled={loadingMore}
                  onClick={() => fetchItems(page + 1, true)}
                  type="button"
                >
                  {loadingMore ? (
                    <>
                      <i className="bi bi-arrow-repeat spin" /> Loading more books...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-chevron-down" /> Load More Books
                    </>
                  )}
                </button>
              </div>
            )}
          </>
        )
      ) : (
        <div className="books-page-empty">
          <i className="bi bi-hourglass-split" />
          <h2>Coming soon</h2>
          <p>
            No {isEbook ? 'ebooks' : 'audiobooks'} here yet{category ? ` for ${category}` : ''} - check back soon.
          </p>
        </div>
      )}
    </section>
  )
}

export default BooksPage
