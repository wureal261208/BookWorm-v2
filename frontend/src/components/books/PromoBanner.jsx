import { useEffect, useState } from 'react'
import biographyMemoir from '../../assets/promo-banners/biography-memoir.jpg'
import fantasy from '../../assets/promo-banners/fantasy.jpg'
import history from '../../assets/promo-banners/history.jpg'
import horror from '../../assets/promo-banners/horror.jpg'
import literary from '../../assets/promo-banners/literary.jpg'
import mysteryThriller from '../../assets/promo-banners/mystery-thriller.jpg'
import romance from '../../assets/promo-banners/romance.jpg'
import sciFi from '../../assets/promo-banners/sci-fi.jpg'

// One slide per genre banner. `category` is what actually gets passed to
// Browse's category filter (a case-insensitive substring match - see
// listBooks in bookController.js), which is why it doesn't always match
// the image's own label word-for-word: the banner artwork says "Sci-fi",
// but real category text in Mongo (Gutenberg's own wording) says "Science
// Fiction", so the click-through target has to be the string that
// actually matches real data, not the banner's display text.
const SLIDES = [
  { id: 'romance', image: romance, category: 'Romance' },
  { id: 'fantasy', image: fantasy, category: 'Fantasy' },
  { id: 'sci-fi', image: sciFi, category: 'Science Fiction' },
  { id: 'mystery-thriller', image: mysteryThriller, category: 'Mystery' },
  { id: 'horror', image: horror, category: 'Horror' },
  { id: 'history', image: history, category: 'History' },
  { id: 'literary', image: literary, category: 'Literary' },
  { id: 'biography-memoir', image: biographyMemoir, category: 'Biography' },
]

const AUTO_ROTATE_MS = 6000

// Promotional banner carousel (the "hero banner carousel" style element
// from wattpad.com/home) - unlike the rest of Home, these slides are
// static artwork, not book data from Mongo. Clicking a slide still does
// something real, though: it opens Browse pre-filtered to that genre's
// category, using the exact same category-matching Browse's own dropdown
// uses.
function PromoBanner({ onSelectCategory }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)

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
      <button aria-label="Previous banner" className="promo-banner-arrow promo-banner-arrow-prev" onClick={() => goTo(activeIndex - 1)} type="button">
        <i className="bi bi-chevron-left" />
      </button>

      <button className="promo-banner-slide" onClick={() => onSelectCategory(activeSlide.category)} type="button">
        <img alt={`${activeSlide.id} genre banner`} key={activeSlide.id} src={activeSlide.image} />
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
