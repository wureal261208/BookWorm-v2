import { useEffect, useRef, useState } from 'react'
import BookCard from './BookCard'

const AUTO_SLIDE_MS = 5500

function BookCarousel({ books = [], favorites, onDetail, onFavorite, onRead, viewCounts, viewerCounts }) {
  const trackRef = useRef(null)
  const [isPaused, setIsPaused] = useState(false)
  const [activePageIndex, setActivePageIndex] = useState(0)
  const [pageCount, setPageCount] = useState(1)

  // Measure and compute total pages & active page
  const updatePagination = () => {
    const track = trackRef.current
    if (!track) return
    const maxScroll = track.scrollWidth - track.clientWidth
    if (maxScroll <= 15) {
      setPageCount(1)
      setActivePageIndex(0)
      return
    }
    const computedPages = Math.max(2, Math.min(6, Math.round(track.scrollWidth / track.clientWidth)))
    setPageCount(computedPages)
    const progress = track.scrollLeft / maxScroll
    const currentIdx = Math.min(computedPages - 1, Math.max(0, Math.round(progress * (computedPages - 1))))
    setActivePageIndex(currentIdx)
  }

  useEffect(() => {
    const track = trackRef.current
    if (!track) return undefined

    updatePagination()

    const handleScroll = () => {
      const maxScroll = track.scrollWidth - track.clientWidth
      if (maxScroll <= 15) return
      const progress = track.scrollLeft / maxScroll
      const currentIdx = Math.min(pageCount - 1, Math.max(0, Math.round(progress * (pageCount - 1))))
      setActivePageIndex(currentIdx)
    }

    track.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', updatePagination)

    return () => {
      track.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', updatePagination)
    }
  }, [books.length, pageCount])

  // Banner-like auto-advance animation (pauses on hover or touch)
  useEffect(() => {
    if (books.length <= 2 || isPaused) return undefined

    const timer = setInterval(() => {
      const track = trackRef.current
      if (!track) return
      const maxScroll = track.scrollWidth - track.clientWidth
      if (maxScroll <= 15) return

      if (track.scrollLeft >= maxScroll - 20) {
        track.scrollTo({ left: 0, behavior: 'smooth' })
      } else {
        track.scrollBy({ left: track.clientWidth * 0.85, behavior: 'smooth' })
      }
    }, AUTO_SLIDE_MS)

    return () => clearInterval(timer)
  }, [isPaused, books.length])

  function scrollByPage(direction) {
    const track = trackRef.current
    if (!track) return
    const maxScroll = track.scrollWidth - track.clientWidth
    if (direction > 0 && track.scrollLeft >= maxScroll - 20) {
      track.scrollTo({ left: 0, behavior: 'smooth' })
    } else if (direction < 0 && track.scrollLeft <= 20) {
      track.scrollTo({ left: maxScroll, behavior: 'smooth' })
    } else {
      track.scrollBy({ left: direction * track.clientWidth * 0.85, behavior: 'smooth' })
    }
  }

  function goToPage(pageIdx) {
    const track = trackRef.current
    if (!track || pageCount <= 1) return
    const maxScroll = track.scrollWidth - track.clientWidth
    const targetScroll = (pageIdx / (pageCount - 1)) * maxScroll
    track.scrollTo({ left: targetScroll, behavior: 'smooth' })
    setActivePageIndex(pageIdx)
  }

  if (!books.length) return null

  const showArrows = books.length > 2

  return (
    <div
      className="book-carousel"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => setIsPaused(false)}
    >
      {showArrows && (
        <button
          aria-label="Scroll to previous books"
          className="book-carousel-arrow book-carousel-arrow-prev"
          onClick={() => scrollByPage(-1)}
          type="button"
        >
          <i className="bi bi-chevron-left" />
        </button>
      )}

      <div className="book-carousel-track" ref={trackRef}>
        {books.map((book) => (
          <div className="book-carousel-item" key={book._id || book.id}>
            <BookCard
              book={book}
              favorites={favorites}
              onDetail={onDetail}
              onFavorite={onFavorite}
              onRead={onRead}
              viewCount={viewCounts?.[book.id] || 0}
            />
          </div>
        ))}
      </div>

      {showArrows && (
        <button
          aria-label="Scroll to more books"
          className="book-carousel-arrow book-carousel-arrow-next"
          onClick={() => scrollByPage(1)}
          type="button"
        >
          <i className="bi bi-chevron-right" />
        </button>
      )}

      {pageCount > 1 && (
        <div className="book-carousel-dots" role="tablist" aria-label="Book pages">
          {Array.from({ length: pageCount }).map((_, idx) => (
            <button
              aria-label={`Show books page ${idx + 1}`}
              aria-selected={idx === activePageIndex}
              className={idx === activePageIndex ? 'active' : ''}
              key={idx}
              onClick={() => goToPage(idx)}
              role="tab"
              type="button"
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default BookCarousel
