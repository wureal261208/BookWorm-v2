import { useEffect, useState } from 'react'
import { publicApiFetch } from '../../utils/apiClient'
import BookGrid from '../books/BookGrid'
import BookCarousel from '../books/BookCarousel'

// Small helper for the several "row of books from a specific real query"
// sections below (Hot books, Top picks, Recommended, ...) - same
// loading/fetch shape each time, just a different query string, so this
// keeps four near-identical useState/useEffect blocks from being
// copy-pasted four times.
function useBookRow(query) {
  const [books, setBooks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let ignore = false
    setLoading(true)
    publicApiFetch(`/api/books?${query}`)
      .then((data) => {
        if (!ignore) setBooks(Array.isArray(data.books) ? data.books : [])
      })
      .catch(() => {
        if (!ignore) setBooks([])
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  return [books, loading]
}

function HomePage({ books, booksLoading = false, favorites, onDetail, onFavorite, onRead, progress = {}, setPage, topics, viewCounts, viewerCounts }) {
  // "Hot books" means most-read, not just whatever showed up first in the
  // default recent-sorted batch - a dedicated sort=views fetch straight
  // from the server (same as Discover's "Most read" sort) is what actually
  // reflects that across the whole catalog.
  const [hotBooks, hotBooksLoading] = useBookRow('limit=18&sort=views')

  // None of these four rows are real per-user personalization - there's no
  // recommendation engine (no reading-history model, no collaborative
  // filtering) behind this site. Rather than fake that with a label like
  // "Recommended for you" hiding what's really just another arbitrary
  // slice, each row is genuinely a different real query against Mongo:
  // "Top picks" and "We think you'll enjoy" are honest random samples
  // (sort=random, a fresh $sample from the whole published catalog on
  // every page load - see listBooks in bookController.js), "Recommended"
  // is the next tier of most-read books after what Hot books already
  // shows, and the history row is a real category filter. Different
  // books, different real criteria, every time - just not personalized.
  const [topPicks, topPicksLoading] = useBookRow('limit=16&sort=random')
  const [recommended, recommendedLoading] = useBookRow('limit=16&sort=views&page=2')
  const [enjoyPicks, enjoyPicksLoading] = useBookRow('limit=16&sort=random')
  const [historyPicks, historyPicksLoading] = useBookRow('limit=16&category=History')

  const newBooks = books.slice(0, 16)
  const continueReading = books.filter((book) => (progress[book.id] || 0) > 0 && (progress[book.id] || 0) < 100).slice(0, 4)

  return (
    <div className="home-page">
      {/* Placeholder for a real promotional/editorial banner (illustrated
          artwork + a headline + a CTA button, like Wattpad's "Before you
          knew better" banner on wattpad.com/home) - not book-cover data,
          so there's nothing to fetch here. Swap PromoBannerPlaceholder for
          real slide content once you have banner images/copy ready; the
          arrow buttons are already wired up as a shell to build the real
          carousel into. */}
      <PromoBannerPlaceholder />

      {continueReading.length > 0 && (
        <section className="section-block">
          <div className="section-heading">
            <div>
              <p className="mono-eyebrow">Pick up again</p>
              <h2>Continue reading</h2>
            </div>
            <button className="ghost-button" onClick={() => setPage('profile')} type="button">
              My progress
            </button>
          </div>
          <BookGrid
            books={continueReading}
            favorites={favorites}
            onDetail={onDetail}
            onFavorite={onFavorite}
            onRead={onRead}
            variant="read"
            viewCounts={viewCounts}
            viewerCounts={viewerCounts}
          />
        </section>
      )}

      <BookRowSection
        actionLabel="View library"
        books={hotBooks}
        eyebrow="Popular now"
        favorites={favorites}
        loading={hotBooksLoading}
        onAction={() => setPage('discover')}
        onDetail={onDetail}
        onFavorite={onFavorite}
        onRead={onRead}
        title="Hot books"
        viewCounts={viewCounts}
        viewerCounts={viewerCounts}
      />

      <BookRowSection
        actionLabel="View library"
        books={booksLoading ? [] : newBooks}
        eyebrow="Just added"
        favorites={favorites}
        loading={booksLoading}
        onAction={() => setPage('discover')}
        onDetail={onDetail}
        onFavorite={onFavorite}
        onRead={onRead}
        title="New books"
        viewCounts={viewCounts}
        viewerCounts={viewerCounts}
      />

      <BookRowSection
        books={topPicks}
        eyebrow="Worth a look"
        favorites={favorites}
        loading={topPicksLoading}
        onDetail={onDetail}
        onFavorite={onFavorite}
        onRead={onRead}
        title="Top picks for you"
        viewCounts={viewCounts}
        viewerCounts={viewerCounts}
      />

      <BookRowSection
        actionLabel="View library"
        books={recommended}
        eyebrow="For your shelf"
        favorites={favorites}
        loading={recommendedLoading}
        onAction={() => setPage('discover')}
        onDetail={onDetail}
        onFavorite={onFavorite}
        onRead={onRead}
        title="Recommended for you"
        viewCounts={viewCounts}
        viewerCounts={viewerCounts}
      />

      <BookRowSection
        books={enjoyPicks}
        eyebrow="Give it a try"
        favorites={favorites}
        loading={enjoyPicksLoading}
        onDetail={onDetail}
        onFavorite={onFavorite}
        onRead={onRead}
        title="We think you'll enjoy"
        viewCounts={viewCounts}
        viewerCounts={viewerCounts}
      />

      <BookRowSection
        actionLabel="View library"
        books={historyPicks}
        eyebrow="A look back"
        favorites={favorites}
        loading={historyPicksLoading}
        onAction={() => setPage('discover', 'History')}
        onDetail={onDetail}
        onFavorite={onFavorite}
        onRead={onRead}
        title="Turn back to history"
        viewCounts={viewCounts}
        viewerCounts={viewerCounts}
      />

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="mono-eyebrow">Browse by mood</p>
            <h2>Featured categories</h2>
          </div>
        </div>
        <div className="category-grid">
          {topics.slice(1, 9).map((topic) => (
            <button key={topic} onClick={() => setPage('discover', topic)} type="button">
              <i className="bi bi-tag" />
              <span>{topic}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

// One "row of books" section: heading (+ optional "View library" action)
// above a horizontal carousel, with its own loading skeleton. Every row on
// Home is one of these, just pointed at a different real query.
function BookRowSection({ actionLabel, books, eyebrow, favorites, loading, onAction, onDetail, onFavorite, onRead, title, viewCounts, viewerCounts }) {
  return (
    <section className="section-block">
      <div className="section-heading">
        <div>
          <p className="mono-eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        {onAction && (
          <button className="ghost-button" onClick={onAction} type="button">
            {actionLabel}
          </button>
        )}
      </div>
      {loading ? (
        <CarouselSkeleton />
      ) : (
        <BookCarousel
          books={books}
          favorites={favorites}
          onDetail={onDetail}
          onFavorite={onFavorite}
          onRead={onRead}
          viewCounts={viewCounts}
          viewerCounts={viewerCounts}
        />
      )}
    </section>
  )
}

// A row of blank cover-shaped placeholders the same width as a real
// BookCarousel item - so there's never a blank gap under a heading while
// its row is still loading.
function CarouselSkeleton() {
  return (
    <div className="book-carousel">
      <div className="book-carousel-track">
        {Array.from({ length: 6 }).map((_, index) => (
          <div className="book-carousel-item" key={index}>
            <div className="book-card-skeleton" />
          </div>
        ))}
      </div>
    </div>
  )
}

// Empty shell for a future hand-made promotional banner (illustration +
// headline + CTA, like Wattpad's rotating "Before you knew better" style
// banner) - deliberately not wired to any book data. The arrow buttons are
// inert placeholders for now; once there's real slide content to rotate
// through, wire onClick handlers here the same way BookCarousel's arrows
// scroll its track.
function PromoBannerPlaceholder() {
  return (
    <section className="promo-banner-placeholder" aria-label="Promotional banner - add your own artwork here">
      <button aria-label="Previous banner" className="promo-banner-arrow promo-banner-arrow-prev" disabled type="button">
        <i className="bi bi-chevron-left" />
      </button>
      <div className="promo-banner-placeholder-content">
        <i className="bi bi-image" />
        <p>Add your promotional banner image(s) here</p>
      </div>
      <button aria-label="Next banner" className="promo-banner-arrow promo-banner-arrow-next" disabled type="button">
        <i className="bi bi-chevron-right" />
      </button>
    </section>
  )
}

export default HomePage
