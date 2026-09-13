import { useRef } from 'react'
import BookCard from './BookCard'

// A horizontally-scrolling row of BookCards with prev/next arrows - the
// "sach moi" / "sach hot" carousel rows from the waka.vn-style layout.
// Native scroll-snap does the actual sliding so it stays smooth and
// touch-friendly without any extra JS animation.
function BookCarousel({ books, favorites, onDetail, onFavorite, onRead, viewCounts, viewerCounts }) {
  const trackRef = useRef(null)

  function scrollByPage(direction) {
    const track = trackRef.current
    if (!track) return
    track.scrollBy({ left: direction * track.clientWidth * 0.86, behavior: 'smooth' })
  }

  if (!books.length) return null

  return (
    <div className="book-carousel">
      <button
        aria-label="Scroll to previous books"
        className="book-carousel-arrow book-carousel-arrow-prev"
        onClick={() => scrollByPage(-1)}
        type="button"
      >
        <i className="bi bi-chevron-left" />
      </button>

      <div className="book-carousel-track" ref={trackRef}>
        {books.map((book) => (
          <div className="book-carousel-item" key={book.id}>
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

      <button
        aria-label="Scroll to more books"
        className="book-carousel-arrow book-carousel-arrow-next"
        onClick={() => scrollByPage(1)}
        type="button"
      >
        <i className="bi bi-chevron-right" />
      </button>
    </div>
  )
}

export default BookCarousel
