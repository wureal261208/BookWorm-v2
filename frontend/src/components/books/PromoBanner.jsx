import { useEffect, useState } from 'react'
import biographyMemoir from '../../assets/promo-banners/biography-memoir.jpg'
import fantasy from '../../assets/promo-banners/fantasy.jpg'
import history from '../../assets/promo-banners/history.jpg'
import horror from '../../assets/promo-banners/horror.jpg'
import literary from '../../assets/promo-banners/literary.jpg'
import mysteryThriller from '../../assets/promo-banners/mystery-thriller.jpg'
import romance from '../../assets/promo-banners/romance.jpg'
import sciFi from '../../assets/promo-banners/sci-fi.jpg'

// One slide per genre banner. `topic` is what actually gets filtered on
// click - the same category-or-subject partial match Browse's own genre
// pills/dropdown use (see the $or in listBooks in bookController.js), so
// clicking a slide behaves exactly like clicking that genre's pill would.
// That's also why "Sci-fi" here says "Science Fiction": that's the
// wording that actually shows up in real category/subjects text
// (Gutenberg's own wording), not the banner artwork's own display text.
const SLIDES = [
  { id: 'romance', image: romance, topic: 'Romance' },
  { id: 'fantasy', image: fantasy, topic: 'Fantasy' },
  { id: 'sci-fi', image: sciFi, topic: 'Science Fiction' },
  { id: 'mystery-thriller', image: mysteryThriller, topic: 'Mystery' },
  { id: 'horror', image: horror, topic: 'Horror' },
  { id: 'history', image: history, topic: 'History' },
  { id: 'literary', image: literary, topic: 'Literary' },
  { id: 'biography-memoir', image: biographyMemoir, topic: 'Biography' },
]

const AUTO_ROTATE_MS = 6000

// Promotional banner carousel (the "hero banner carousel" style element
// from wattpad.com/home) - unlike the rest of Home, these slides are
// static artwork, not book data from Mongo. Clicking a slide still does
// something real, though: it filters Browse by that genre, same as
// clicking one of Browse's own topic pills.
function PromoBanner({ onSelectGenre }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  // Local bundled images still have to be fetched/decoded by the browser
  // like any other <img> - this just avoids the first slide popping in
  // abruptly once that resolves. It's not tied to any network request, so
  // it naturally clears well before the book rows below (those wait on
  // real API calls) - no artificial delay needed to make that true.
  const [isFirstImageReady, setIsFirstImageReady] = useState(false)

  useEffect(() => {
    if (SLIDES.length < 2 || isPaused) return undefined
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % SLIDES.length)
    }, AUTO_ROTATE_MS)
    return () => window.clearInterval(timer)
  }, [isPaused])

  function goTo(nextIndex) {
    setActiveIndex((nextIndex + SLIDES.length) % SLIDES.length)
  }

  const activeSlide = SLIDES[activeIndex]

  return (
    <section
      aria-label="Featured genres"
      className="promo-banner"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {!isFirstImageReady && <div className="promo-banner-skeleton book-card-skeleton" aria-hidden="true" />}

      <button aria-label="Previous banner" className="promo-banner-arrow promo-banner-arrow-prev" onClick={() => goTo(activeIndex - 1)} type="button">
        <i className="bi bi-chevron-left" />
      </button>

      <button className="promo-banner-slide" onClick={() => onSelectGenre(activeSlide.topic)} type="button">
        <img
          alt={`${activeSlide.id} genre banner`}
          key={activeSlide.id}
          onLoad={() => setIsFirstImageReady(true)}
          src={activeSlide.image}
          style={isFirstImageReady ? undefined : { visibility: 'hidden' }}
        />
      </button>

      <button aria-label="Next banner" className="promo-banner-arrow promo-banner-arrow-next" onClick={() => goTo(activeIndex + 1)} type="button">
        <i className="bi bi-chevron-right" />
      </button>

      <div className="promo-banner-dots" role="tablist" aria-label="Choose a banner">
        {SLIDES.map((slide, index) => (
          <button
            aria-label={`Show ${slide.id} banner`}
            aria-selected={index === activeIndex}
            className={index === activeIndex ? 'active' : ''}
            key={slide.id}
            onClick={() => goTo(index)}
            role="tab"
            type="button"
          />
        ))}
      </div>
    </section>
  )
}

export default PromoBanner
