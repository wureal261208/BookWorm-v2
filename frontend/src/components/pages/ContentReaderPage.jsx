import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { auth } from '../../features/auth-firebase/firebaseConfig'
import { apiFetch, publicApiFetch } from '../../utils/apiClient'
import { useNavigation } from '../../context/NavigationContext'
import ContentComments from '../content/ContentComments'
import MarginNotesReader from '../content/MarginNotesReader'

const EBOOK_STORAGE_PREFIX = 'bookworm_ebook_pos_'

function ContentReaderPage() {
  const { navigateTo } = useNavigation()
  const [searchParams] = useSearchParams()
  const id = searchParams.get('id')

  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Reader customization states
  const [theme, setTheme] = useState(() => localStorage.getItem('bookworm_reader_theme') || 'light')
  const [fontSize, setFontSize] = useState(() => Number(localStorage.getItem('bookworm_reader_fontsize')) || 18)
  const [fontFamily, setFontFamily] = useState(() => localStorage.getItem('bookworm_reader_font') || 'serif')

  // Reading progress and resume
  const [readPercent, setReadPercent] = useState(0)
  const [savedResume, setSavedResume] = useState(null)
  const [showResumeBanner, setShowResumeBanner] = useState(false)
  const scrollTimeoutRef = useRef(null)

  useEffect(() => {
    localStorage.setItem('bookworm_reader_theme', theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem('bookworm_reader_fontsize', String(fontSize))
  }, [fontSize])

  useEffect(() => {
    localStorage.setItem('bookworm_reader_font', fontFamily)
  }, [fontFamily])

  // Fetch book details
  useEffect(() => {
    if (!id) return
    let ignore = false
    setLoading(true)
    setError('')

    publicApiFetch(`/api/content/${id}`)
      .then((data) => {
        if (ignore) return
        setItem(data)

        if (auth.currentUser && data.categories?.length) {
          apiFetch('/api/users/me/engagement', { method: 'POST', body: { categories: data.categories } }).catch(() => {})
        }

        // Check if there was a saved reading position
        try {
          const raw = localStorage.getItem(`${EBOOK_STORAGE_PREFIX}${id}`)
          if (raw) {
            const parsed = JSON.parse(raw)
            if (parsed && parsed.scrollY > 200) {
              setSavedResume(parsed)
              setShowResumeBanner(true)
            }
          }
        } catch (_) {}
      })
      .catch((err) => {
        if (!ignore) setError(err.message)
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })

    return () => {
      ignore = true
    }
  }, [id])

  // Track scroll percentage and persist
  useEffect(() => {
    if (!id || !item) return

    function handleScroll() {
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight
      if (scrollHeight <= 0) return

      const currentScroll = window.scrollY
      const percent = Math.min(100, Math.max(0, Math.round((currentScroll / scrollHeight) * 100)))
      setReadPercent(percent)

      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
      scrollTimeoutRef.current = setTimeout(() => {
        try {
          localStorage.setItem(
            `${EBOOK_STORAGE_PREFIX}${id}`,
            JSON.stringify({
              id: item._id || id,
              title: item.title,
              author: item.author,
              cover_image: item.cover_image,
              scrollY: Math.round(currentScroll),
              percent,
              updatedAt: Date.now(),
            })
          )
        } catch (_) {}
      }, 500)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
    }
  }, [id, item])

  function handleResume() {
    if (savedResume && savedResume.scrollY) {
      window.scrollTo({ top: savedResume.scrollY, behavior: 'smooth' })
      setShowResumeBanner(false)
    }
  }

  if (!id) return <p className="admin-validation-error"><i className="bi bi-x-circle" /> No book selected.</p>
  if (loading && !item) return <p className="settings-copy">Loading book text...</p>
  if (error || !item) {
    return <p className="admin-validation-error"><i className="bi bi-x-circle" /> {error || 'Book not found.'}</p>
  }

  const hasHtmlEdition = item.files?.some((file) => file.format === 'html')
  const downloadFiles = item.files || []

  return (
    <div className={`content-reader-page reader-theme-${theme} reader-font-${fontFamily}`}>
      {/* Sticky Top Reading Control Bar */}
      <div className="content-reader-sticky-bar">
        <div className="reader-bar-inner">
          <button className="ghost-button reader-bar-back" onClick={() => navigateTo('books')} type="button">
            <i className="bi bi-arrow-left" /> Back
          </button>

          <span className="reader-bar-title" title={item.title}>
            {item.title}
          </span>

          <div className="reader-bar-controls">
            {/* Reading progress */}
            <span className="reader-progress-indicator" title={`${readPercent}% read`}>
              <i className="bi bi-bookmark" /> {readPercent}%
            </span>

            {/* Font size adjustments */}
            <div className="reader-btn-group">
              <button
                className="ghost-button"
                disabled={fontSize <= 14}
                onClick={() => setFontSize((s) => Math.max(14, s - 2))}
                title="Decrease font size"
                type="button"
              >
                A-
              </button>
              <button
                className="ghost-button"
                disabled={fontSize >= 26}
                onClick={() => setFontSize((s) => Math.min(26, s + 2))}
                title="Increase font size"
                type="button"
              >
                A+
              </button>
            </div>

            {/* Font family toggle */}
            <button
              className="ghost-button reader-font-btn"
              onClick={() => setFontFamily((f) => (f === 'serif' ? 'sans' : 'serif'))}
              title="Toggle Serif / Sans-serif"
              type="button"
            >
              {fontFamily === 'serif' ? 'Serif' : 'Sans'}
            </button>

            {/* Color themes */}
            <div className="reader-theme-swatches">
              <button
                aria-label="Light mode"
                className={`theme-swatch swatch-light ${theme === 'light' ? 'active' : ''}`}
                onClick={() => setTheme('light')}
                title="Light"
                type="button"
              />
              <button
                aria-label="Sepia mode"
                className={`theme-swatch swatch-sepia ${theme === 'sepia' ? 'active' : ''}`}
                onClick={() => setTheme('sepia')}
                title="Sepia"
                type="button"
              />
              <button
                aria-label="Dark mode"
                className={`theme-swatch swatch-dark ${theme === 'dark' ? 'active' : ''}`}
                onClick={() => setTheme('dark')}
                title="Dark"
                type="button"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Resume Banner */}
      {showResumeBanner && savedResume && (
        <div className="reader-resume-banner">
          <span>
            <i className="bi bi-clock-history" style={{ marginRight: '6px' }} />
            You stopped at <strong>{savedResume.percent}%</strong> last time.
          </span>
          <div className="resume-banner-actions">
            <button className="primary-button" onClick={handleResume} type="button">
              Resume reading
            </button>
            <button
              aria-label="Dismiss"
              className="ghost-button"
              onClick={() => setShowResumeBanner(false)}
              type="button"
            >
              <i className="bi bi-x-lg" />
            </button>
          </div>
        </div>
      )}

      {/* Book Metadata Header */}
      <div className="content-reader-header">
        <div className="section-heading">
          <div>
            <p className="mono-eyebrow">{item.source || 'Gutenberg Ebook'}</p>
            <h1>{item.title}</h1>
          </div>
        </div>
        <p className="reader-author-line">By <strong>{item.author || 'Unknown'}</strong></p>
        {item.description && <p className="reader-desc-line">{item.description}</p>}

        {item.pairedContent && (
          <button
            className="ghost-button"
            onClick={() => navigateTo('listen', { query: `id=${item.pairedContent.id}` })}
            style={{ marginTop: '8px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            type="button"
          >
            <i className="bi bi-headphones" /> Also available as an audiobook &rarr; Listen
          </button>
        )}

        {downloadFiles.length > 0 && (
          <div className="admin-row-actions" style={{ marginTop: '14px' }}>
            {downloadFiles.map((file) => (
              <a className="ghost-button" href={file.url} key={file.url} rel="noreferrer" target="_blank">
                <i className="bi bi-download" /> Download {file.format}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Reading Body */}
      <div className="content-reader-body-wrap" style={{ fontSize: `${fontSize}px` }}>
        {hasHtmlEdition ? (
          <MarginNotesReader contentId={item._id} />
        ) : (
          <p className="empty-state">No readable HTML edition on file for this book - try one of the download links above.</p>
        )}
      </div>

      {/* Comments section */}
      <div style={{ marginTop: '48px' }}>
        <ContentComments contentId={item._id} />
      </div>
    </div>
  )
}

export default ContentReaderPage
