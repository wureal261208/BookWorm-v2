import { useEffect, useState } from 'react'
import { publicApiFetch } from '../../utils/apiClient'
import BookGrid from '../books/BookGrid'
import BookCarousel from '../books/BookCarousel'
import ExternalMediaCarousel from '../books/ExternalMediaCarousel'
import PromoBanner from '../books/PromoBanner'

// Small helper for "row of books from a real /api/books query" sections -
// same loading/fetch shape each time, just a different query string.
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

// Same idea as useBookRow, but for the unified /api/content route (see
// backend/controllers/contentController.js), which responds with
// { items, total, page, limit } rather than a { books: [...] } envelope.
function useExternalRow(path) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let ignore = false
    setLoading(true)
    publicApiFetch(path)
      .then((data) => {
        if (!ignore) setItems(Array.isArray(data?.items) ? data.items : [])
      })
      .catch(() => {
        if (!ignore) setItems([])
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [path])

  return [items, loading]
}

function HomePage({ books, booksLoading = false, favorites, onDetail, onFavorite, onRead, onSelectGenre, progress = {}, setPage, viewCounts, viewerCounts }) {
  // Not real per-user personalization - there's no recommendation engine
  // (no reading-history model, no collaborative filtering) behind this
  // site. "Recommended for you" is honestly just the next tier of
  // most-read books after Discover's own "Most read" sort - a real query,
  // not a fabricated pick.
  const [recommended, recommendedLoading] = useBookRow('limit=16&sort=views&page=2')

  const [hotEbooks, hotEbooksLoading] = useExternalRow('/api/content?type=ebook&limit=16')
  const [hotAudiobooks, hotAudiobooksLoading] = useExternalRow('/api/content?type=audiobook&limit=16')

  const newBooks = books.slice(0, 16)
  const continueReading = books.filter((book) => (progress[book.id] || 0) > 0 && (progress[book.id] || 0) < 100).slice(0, 4)

  return (
    <div className="home-page">
      {/* Real promotional artwork (see PromoBanner.jsx) - clicking a slide
          filters Browse by that genre's topic pill (also matches by
          subject, not just category - see the $or in listBooks). */}
      <section className="home-promo-layout">
        <PromoBanner onSelectGenre={onSelectGenre} />
        <aside className="random-feature-panel">
          <p className="mono-eyebrow">Need inspiration?</p>
          <h2>What should I read today?</h2>
          <p>Can&apos;t decide on your next story? Let BookWorm pick a book from the library for you.</p>
          <button className="random-feature-button" onClick={() => setPage('random')} type="button">
            <i className="bi bi-shuffle" />
            Find a random book
          </button>
        </aside>
      </section>

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

      {/* Straight from the unified Content collection (see
          backend/utils/contentIngestion.js) - these two rows link out to
          Gutenberg/LibriVox/archive.org themselves rather than BookWorm's
          own reader, since this content hasn't gone through the (not yet
          built) admin review + in-app reader/player wiring. */}
      <ExternalRowSection eyebrow="Popular on Gutenberg" items={hotEbooks} loading={hotEbooksLoading} title="Hot ebooks" />

      <ExternalRowSection eyebrow="Fresh from LibriVox" items={hotAudiobooks} loading={hotAudiobooksLoading} title="Hot audiobooks" />
    </div>
  )
}

// One "row of books" section: heading (+ optional "View library" action)
// above a horizontal carousel, with its own loading skeleton. Every
// /api/books-backed row on Home is one of these, just pointed at a
// different real query.
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

// Same header/skeleton shell as BookRowSection, but for the Content-backed
// rows - no favorites/onRead wiring, since this content hasn't gone
// through the in-app reader/player yet (see ExternalMediaCarousel.jsx).
function ExternalRowSection({ eyebrow, items, loading, title }) {
  return (
    <section className="section-block">
      <div className="section-heading">
        <div>
          <p className="mono-eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
      </div>
      {loading ? <CarouselSkeleton /> : <ExternalMediaCarousel items={items} />}
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

export default HomePage
