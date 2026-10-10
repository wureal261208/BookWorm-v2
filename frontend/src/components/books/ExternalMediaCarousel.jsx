import { useEffect, useRef, useState } from 'react'
import { useNavigation } from '../../context/NavigationContext'

import { getCover, NO_COVER_IMAGE } from '../../utils/bookUtils'

// "Hot ebooks"/"Hot audiobooks" on Home show Content documents synced from
// Gutendex/LibriVox (see backend/utils/contentIngestion.js). Clicking one
// opens BookWorm's BookDetailPage (mainPage -> detailPage -> read/audioPage)
// per the design specification.
function ExternalMediaCard({ item, onDetail }) {
  const { navigateTo } = useNavigation()
  const isEbook = item.type === 'ebook'
  const title = item.title || 'Untitled'
  const author = item.author || 'Unknown author'
  const cover = getCover(item)
  const totalReads = (item.views || 0) + (item.downloadCount || 0)
  const meta = isEbook
    ? `${totalReads.toLocaleString()} reads`
    : (item.views ? `${item.views.toLocaleString()} listens` : 'LibriVox audio')

  function openDetail() {
    if (onDetail) {
      onDetail(item)
    } else {
      navigateTo('detail', { query: `id=${item._id || item.id}` })
    }
  }

  function handleAction() {
    navigateTo(isEbook ? 'read' : 'listen', { query: `id=${item._id || item.id}` })
  }

  return (
    <article className="book-card">
      <button className="book-cover-button" onClick={openDetail} style={{ display: 'block', width: '100%', border: 0, padding: 0 }} type="button">
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
        <span className="book-cover-overlay">
          <strong>{title}</strong>
          <em>{author}</em>
          <p>{item.description || ''}</p>
        </span>
      </button>
      <div className="book-card-body">
        <span className="category">{item.source || (isEbook ? 'Gutenberg' : 'LibriVox')}</span>
        <h2 onClick={openDetail} style={{ cursor: 'pointer' }} title={title}>{title}</h2>
        <p title={author}>{author}</p>
      </div>
      <div className="book-card-meta">
        <i className={`bi ${isEbook ? 'bi-eye' : 'bi-headphones'}`} />
        <small>{meta}</small>
      </div>
      <div className="card-actions">
        <button className="primary-button card-main-action-btn" onClick={handleAction} type="button">
          <i className={`bi ${isEbook ? 'bi-journal-text' : 'bi-headphones'}`} />
          <span>{isEbook ? 'Read' : 'Listen'}</span>
        </button>
        <button className="ghost-button card-save-btn" onClick={openDetail} title="Book details" type="button">
          <i className="bi bi-info-circle" />
          <span className="card-btn-text">Detail</span>
        </button>
      </div>
    </article>
  )
}

const AUTO_SLIDE_MS = 5500

function ExternalMediaCarousel({ items = [], onDetail }) {
  const trackRef = useRef(null)
  const [isPaused, setIsPaused] = useState(false)
  const [activePageIndex, setActivePageIndex] = useState(0)
  const [pageCount, setPageCount] = useState(1)

  useEffect(() => {
    const track = trackRef.current
    if (!track) return undefined

    const updatePagination = () => {
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

    updatePagination()

    const handleScroll = () => {
      const maxScroll = track.scrollWidth - track.clientWidth
      if (maxScroll <= 15) return
      const computedPages = Math.max(2, Math.min(6, Math.round(track.scrollWidth / track.clientWidth)))
      const progress = track.scrollLeft / maxScroll
      const currentIdx = Math.min(computedPages - 1, Math.max(0, Math.round(progress * (computedPages - 1))))
      setActivePageIndex(currentIdx)
    }

    track.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', updatePagination)

    return () => {
      track.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', updatePagination)
    }
  }, [items.length])

  // Banner-like auto-advance animation (pauses on hover or touch)
  useEffect(() => {
    if (items.length <= 1 || isPaused) return undefined

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
  }, [isPaused, items.length])

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

  if (!items.length) return null

  const showArrows = items.length > 1

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
          aria-label="Scroll to previous items"
          className="book-carousel-arrow book-carousel-arrow-prev"
          onClick={() => scrollByPage(-1)}
          type="button"
        >
          <i className="bi bi-chevron-left" />
        </button>
      )}

      <div className="book-carousel-track" ref={trackRef}>
        {items.map((item) => (
          <div className="book-carousel-item" key={item._id || item.id}>
            <ExternalMediaCard item={item} onDetail={onDetail} />
          </div>
        ))}
      </div>

      {showArrows && (
        <button
          aria-label="Scroll to more items"
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
              aria-label={`Show items page ${idx + 1}`}
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

export default ExternalMediaCarousel
