import { useEffect, useState } from 'react'
import { getAuthor, getCategory, getCover } from '../../utils/bookUtils'
import BookGrid from '../books/BookGrid'

function HomePage({ books, favorites, onDetail, onFavorite, onRead, progress = {}, setPage, topics, viewCounts, viewerCounts }) {
  const [activeHeroIndex, setActiveHeroIndex] = useState(0)
  const [isHeroPaused, setIsHeroPaused] = useState(false)
  const hotBooks = books.slice(0, 6)
  const recommended = books.slice(6, 14)
  const continueReading = books.filter((book) => (progress[book.id] || 0) > 0 && (progress[book.id] || 0) < 100).slice(0, 4)
  const safeHeroIndex = hotBooks.length ? activeHeroIndex % hotBooks.length : 0
  const featured = hotBooks[safeHeroIndex]
  const centerSlot = hotBooks.length ? Math.floor(hotBooks.length / 2) : 0
  const carouselBooks = hotBooks.map((_, index) => hotBooks[(safeHeroIndex - centerSlot + index + hotBooks.length) % hotBooks.length])

  useEffect(() => {
    if (hotBooks.length < 2 || isHeroPaused) {
      return undefined
    }

    const timer = window.setInterval(() => {
      setActiveHeroIndex((currentIndex) => (currentIndex + 1) % hotBooks.length)
    }, 2800)

    return () => window.clearInterval(timer)
  }, [hotBooks.length, isHeroPaused])

  return (
    <div className="home-page">
      {featured && (
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
      )}

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
        <BookGrid
          books={hotBooks}
          favorites={favorites}
          onDetail={onDetail}
          onFavorite={onFavorite}
          onRead={onRead}
          variant="read"
          viewCounts={viewCounts}
          viewerCounts={viewerCounts}
        />
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="mono-eyebrow">For your shelf</p>
            <h2>Recommended</h2>
          </div>
        </div>
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

export default HomePage
