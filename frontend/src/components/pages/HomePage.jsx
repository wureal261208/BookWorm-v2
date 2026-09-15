import { useEffect, useState } from 'react'
import { getAuthor, getCategory, getCover } from '../../utils/bookUtils'
import { publicApiFetch } from '../../utils/apiClient'
import BookGrid from '../books/BookGrid'
import BookCarousel from '../books/BookCarousel'

function HomePage({ books, booksLoading = false, favorites, onDetail, onFavorite, onRead, progress = {}, setPage, topics, viewCounts, viewerCounts }) {
  const [activeHeroIndex, setActiveHeroIndex] = useState(0)
  const [isHeroPaused, setIsHeroPaused] = useState(false)

  // "Hot books" means most-read, not just whatever showed up first in the
  // default recent-sorted batch - a dedicated sort=views fetch straight
  // from the server (same as Discover's "Most read" sort) is what actually
  // reflects that across the whole catalog.
  const [hotBooks, setHotBooks] = useState([])
  const [hotBooksLoading, setHotBooksLoading] = useState(true)
  useEffect(() => {
    let ignore = false
    setHotBooksLoading(true)
    publicApiFetch('/api/books?limit=18&sort=views')
      .then((data) => {
        if (!ignore) setHotBooks(Array.isArray(data.books) ? data.books : [])
      })
      .catch(() => {
        if (!ignore) setHotBooks([])
      })
      .finally(() => {
        if (!ignore) setHotBooksLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [])

  // `books` is one shared, larger fetch (App.jsx) sliced into three
  // non-overlapping windows here, rather than three separate API calls -
  // cheap way to fill out the page with more (still 100% Mongo-backed,
  // never static/hardcoded) books without extra round trips.
  const heroBooks = (hotBooks.length ? hotBooks : books).slice(0, 6)
  const newBooks = books.slice(0, 16)
  const recommended = books.slice(16, 32)
  const continueReading = books.filter((book) => (progress[book.id] || 0) > 0 && (progress[book.id] || 0) < 100).slice(0, 4)
  const safeHeroIndex = heroBooks.length ? activeHeroIndex % heroBooks.length : 0
  const featured = heroBooks[safeHeroIndex]
  const centerSlot = heroBooks.length ? Math.floor(heroBooks.length / 2) : 0
  const carouselBooks = heroBooks.map((_, index) => heroBooks[(safeHeroIndex - centerSlot + index + heroBooks.length) % heroBooks.length])

  useEffect(() => {
    if (heroBooks.length < 2 || isHeroPaused) {
      return undefined
    }

    const timer = window.setInterval(() => {
      setActiveHeroIndex((currentIndex) => (currentIndex + 1) % heroBooks.length)
    }, 2800)

    return () => window.clearInterval(timer)
  }, [heroBooks.length, isHeroPaused])

  // The hero is fed by hotBooks first, falling back to books only until
  // hotBooks arrives - so it's only genuinely "nothing to show yet" while
  // BOTH are still loading and empty. Avoids a blank flash where the
  // whole top of the page was empty white space while either fetch was
  // still in flight.
  const isHeroLoading = !featured && (hotBooksLoading || booksLoading)

  return (
    <div className="home-page">
      {isHeroLoading ? (
        <section className="hero-carousel hero-carousel-skeleton" aria-label="Loading featured book">
          <div className="hero-copy-skeleton">
            <div className="skeleton-line skeleton-line-eyebrow" />
            <div className="skeleton-line skeleton-line-title" />
            <div className="skeleton-line skeleton-line-title" style={{ width: '70%' }} />
            <div className="skeleton-line skeleton-line-meta" />
            <div className="skeleton-pill-row">
              <div className="skeleton-pill" />
              <div className="skeleton-pill" />
            </div>
          </div>
        </section>
      ) : featured ? (
        <section className="hero-carousel">
          <div className="hero-copy" key={featured.id}>
            <p className="mono-eyebrow">Featured reading</p>
            <h1>{featured.title}</h1>
            <p>{getAuthor(featured)} · {getCategory(featured)}</p>
            <div className="hero-actions">
              <button
                className="primary-button"
                onBlur={() => setIsHeroPaused(false)}
                onClick={() => onRead(featured)}
                onFocus={() => setIsHeroPaused(true)}
                onMouseEnter={() => setIsHeroPaused(true)}
                onMouseLeave={() => setIsHeroPaused(false)}
                type="button"
              >
                <i className="bi bi-journal-text" />
                Read now
              </button>
              <button
                className="ghost-button"
                onBlur={() => setIsHeroPaused(false)}
                onClick={() => onDetail(featured)}
                onFocus={() => setIsHeroPaused(true)}
                onMouseEnter={() => setIsHeroPaused(true)}
                onMouseLeave={() => setIsHeroPaused(false)}
                type="button"
              >
                <i className="bi bi-info-circle" />
                Detail
              </button>
            </div>
          </div>
          <div className="carousel-track" aria-label="Hot books carousel">
            <div className="carousel-track-inner" key={featured.id}>
              {carouselBooks.map((book, index) => (
                <button
                  className={index === centerSlot ? 'active' : ''}
                  key={`${book.id}-${index}`}
                  onClick={() => onDetail(book)}
                  type="button"
                >
                  <img loading={index === centerSlot ? 'eager' : 'lazy'} src={getCover(book)} alt={`${book.title} cover`} />
                  <span>{book.title}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : null}

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

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="mono-eyebrow">Popular now</p>
            <h2>Hot books</h2>
          </div>
          <button className="ghost-button" onClick={() => setPage('discover')} type="button">
            View library
          </button>
        </div>
        {hotBooksLoading ? (
          <CarouselSkeleton />
        ) : (
          <BookCarousel
            books={hotBooks.length ? hotBooks : heroBooks}
            favorites={favorites}
            onDetail={onDetail}
            onFavorite={onFavorite}
            onRead={onRead}
            viewCounts={viewCounts}
            viewerCounts={viewerCounts}
          />
        )}
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="mono-eyebrow">Just added</p>
            <h2>New books</h2>
          </div>
          <button className="ghost-button" onClick={() => setPage('discover')} type="button">
            View library
          </button>
        </div>
        {booksLoading ? <CarouselSkeleton /> : (
          <BookCarousel
            books={newBooks}
            favorites={favorites}
            onDetail={onDetail}
            onFavorite={onFavorite}
            onRead={onRead}
            viewCounts={viewCounts}
            viewerCounts={viewerCounts}
          />
        )}
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="mono-eyebrow">For your shelf</p>
            <h2>Recommended</h2>
          </div>
        </div>
        {booksLoading ? (
          <div className="discover-loading-grid" aria-label="Loading recommended books">
            {Array.from({ length: 8 }).map((_, index) => (
              <div className="book-card-skeleton" key={index} />
            ))}
          </div>
        ) : (
          <BookGrid
            books={recommended}
            favorites={favorites}
            onDetail={onDetail}
            onFavorite={onFavorite}
            onRead={onRead}
            variant="read"
            viewCounts={viewCounts}
            viewerCounts={viewerCounts}
          />
        )}
      </section>

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

// A row of blank cover-shaped placeholders the same width as a real
// BookCarousel item - reused for both "Hot books" and "New books" so
// there's never a blank gap under either heading while they load.
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
