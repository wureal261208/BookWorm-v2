import { useEffect, useRef, useState } from 'react'
import biographyMemoir from '../../assets/promo-banners/biography-memoir.jpg'
import fantasy from '../../assets/promo-banners/fantasy.jpg'
import history from '../../assets/promo-banners/history.jpg'
import horror from '../../assets/promo-banners/horror.jpg'
import literary from '../../assets/promo-banners/literary.jpg'
import mysteryThriller from '../../assets/promo-banners/mystery-thriller.jpg'
import romance from '../../assets/promo-banners/romance.jpg'
import sciFi from '../../assets/promo-banners/sci-fi.jpg'

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

function PromoBanner({ onSelectGenre }) {
  // Edge clones allow a seamless animation when moving from the final
  // banner to the first (and vice versa).
  const loopedSlides = [SLIDES[SLIDES.length - 1], ...SLIDES, SLIDES[0]]
  const [slidePosition, setSlidePosition] = useState(1)
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [isAnimating, setIsAnimating] = useState(true)
  const [isPaused, setIsPaused] = useState(false)
  const [isFirstImageReady, setIsFirstImageReady] = useState(false)
  const dragStartX = useRef(null)
  const didDrag = useRef(false)

  const activeIndex = (slidePosition - 1 + SLIDES.length) % SLIDES.length

  useEffect(() => {
    if (SLIDES.length < 2 || isPaused) return undefined
    const timer = window.setInterval(() => {
      setIsAnimating(true)
      setSlidePosition((current) => current + 1)
    }, AUTO_ROTATE_MS)
    return () => window.clearInterval(timer)
  }, [isPaused])

  function goTo(index) {
    setIsAnimating(true)
    setSlidePosition(index + 1)
  }

  function moveBy(direction) {
    setIsAnimating(true)
    setSlidePosition((current) => current + direction)
  }

  function handlePointerDown(event) {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return
    dragStartX.current = event.clientX
    didDrag.current = false
    event.currentTarget.setPointerCapture(event.pointerId)
    setIsAnimating(false)
    setIsDragging(true)
    if (event.pointerType !== 'mouse') setIsPaused(true)
  }

  function handlePointerMove(event) {
    if (dragStartX.current !== null) setDragOffset(event.clientX - dragStartX.current)
  }

  function finishDrag(event) {
    if (dragStartX.current === null) return
    const distance = event.clientX - dragStartX.current
    const shouldChangeSlide = Math.abs(distance) >= event.currentTarget.clientWidth * 0.15
    dragStartX.current = null
    setDragOffset(0)
    setIsDragging(false)
    setIsAnimating(true)
    if (event.pointerType !== 'mouse') setIsPaused(false)

    if (Math.abs(distance) > 5) didDrag.current = true
    if (!shouldChangeSlide) return
    moveBy(distance < 0 ? 1 : -1)
  }

  function cancelDrag(event) {
    dragStartX.current = null
    setDragOffset(0)
    setIsDragging(false)
    setIsAnimating(true)
    if (event.pointerType !== 'mouse') setIsPaused(false)
  }

  function handleBannerClick() {
    if (didDrag.current) {
      didDrag.current = false
      return
    }
    onSelectGenre(SLIDES[activeIndex].topic)
  }

  function handleTransitionEnd(event) {
    if (event.propertyName !== 'transform') return
    if (slidePosition !== 0 && slidePosition !== SLIDES.length + 1) return
    setIsAnimating(false)
    setSlidePosition(slidePosition === 0 ? SLIDES.length : 1)
    window.requestAnimationFrame(() => setIsAnimating(true))
  }

  return (
    <section
      aria-label="Featured genres"
      className="promo-banner"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {!isFirstImageReady && <div className="promo-banner-skeleton book-card-skeleton" aria-hidden="true" />}

      <div
        className="promo-banner-track"
        onTransitionEnd={handleTransitionEnd}
        style={{
          transform: `translate3d(calc(-${slidePosition * 100}vw + ${dragOffset}px), 0, 0)`,
          transition: isAnimating ? undefined : 'none',
        }}
      >
        {loopedSlides.map((slide, index) => (
          <div aria-hidden={index !== slidePosition} className="promo-banner-slide" key={`${slide.id}-${index}`}>
            <img alt={`${slide.id} genre banner`} draggable="false" onLoad={() => setIsFirstImageReady(true)} src={slide.image} />
          </div>
        ))}
      </div>

      <div
        aria-label="Drag to browse featured genres"
        className={`promo-banner-drag-layer${isDragging ? ' is-dragging' : ''}`}
        onClick={handleBannerClick}
        onPointerCancel={cancelDrag}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        role="button"
        tabIndex="0"
      />

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
