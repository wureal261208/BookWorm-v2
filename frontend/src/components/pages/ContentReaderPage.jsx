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

  // Reader customization states (strictly Light & Dark only per design system)
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('bookworm_reader_theme')
    return saved === 'dark' ? 'dark' : 'light'
  })
  const [fontSize, setFontSize] = useState(() => Number(localStorage.getItem('bookworm_reader_fontsize')) || 18)
  const [fontFamily, setFontFamily] = useState(() => localStorage.getItem('bookworm_reader_font') || 'serif')

  // Reading progress and resume
  const [readPercent, setReadPercent] = useState(0)
  const [savedResume, setSavedResume] = useState(null)
  const [showResumeBanner, setShowResumeBanner] = useState(false)
  const scrollTimeoutRef = useRef(null)

  // Smart Chapter splitting & Table of contents
  const [chapters, setChapters] = useState([])
  const [chaptersLoading, setChaptersLoading] = useState(false)
  const [showToc, setShowToc] = useState(false)
  const [activeChapterIndex, setActiveChapterIndex] = useState(0)

  useEffect(() => {
    if (!id) return
    let ignore = false
    setChaptersLoading(true)
    publicApiFetch(`/api/content/${id}/chapters`)
      .then((data) => {
        if (!ignore && Array.isArray(data?.chapters)) {
          setChapters(data.chapters)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!ignore) setChaptersLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [id])

  function jumpToChapter(index) {
    if (index < 0 || index >= chapters.length) return
    setActiveChapterIndex(index)
    setShowToc(false)
    const target = chapters[index]
    if (!target) return
    const el = document.getElementById(`chapter-start-${target.order}`) || document.getElementById(`paragraph-${target.startParagraph}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

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
      <header className="content-reader-sticky-bar">
        <div className="reader-bar-inner">
          <button className="ghost-button reader-bar-back" onClick={() => navigateTo('detail', { query: `id=${id}` })} type="button">
            <i className="bi bi-arrow-left" /> Back
          </button>

          <span className="reader-bar-title" title={item.title}>
            {item.title}
          </span>

          <div className="reader-bar-controls">
            {/* Table of Contents trigger button */}
            <button
              aria-label="Table of contents"
              className={`ghost-button reader-toc-trigger ${showToc ? 'active' : ''}`}
              onClick={() => setShowToc((v) => !v)}
              title="Table of contents"
              type="button"
            >
              <i className="bi bi-list-ul" />
              <span className="reader-toc-trigger-text">
                {chapters.length ? `Chapters (${chapters.length})` : 'Chapters'}
              </span>
            </button>

            {/* Reading progress indicator */}
            <span className="reader-progress-indicator" title={`${readPercent}% read`}>
              <i className="bi bi-bookmark-check-fill" /> {readPercent}%
            </span>

            {/* Font size adjustments */}
            <div className="reader-btn-group" role="group" aria-label="Font size controls">
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
              title="Toggle Serif / Sans-serif typography"
              type="button"
            >
              {fontFamily === 'serif' ? 'Serif' : 'Sans'}
            </button>

            {/* Theme Toggle: Strictly Light & Dark modes only */}
            <div className="reader-theme-toggle" role="group" aria-label="Reader color mode">
              <button
                aria-label="Light mode"
                aria-pressed={theme === 'light'}
                className={`theme-toggle-btn ${theme === 'light' ? 'active' : ''}`}
                onClick={() => setTheme('light')}
                title="Light mode"
                type="button"
              >
                <i className="bi bi-sun-fill" />
                <span className="theme-label">Light</span>
              </button>
              <button
                aria-label="Dark mode"
                aria-pressed={theme === 'dark'}
                className={`theme-toggle-btn ${theme === 'dark' ? 'active' : ''}`}
                onClick={() => setTheme('dark')}
                title="Dark mode"
                type="button"
              >
                <i className="bi bi-moon-fill" />
                <span className="theme-label">Dark</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Reader Column Container */}
      <main className="content-reader-column">
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
        <section className="content-reader-header">
          <p className="mono-eyebrow">{item.source || 'Gutenberg Ebook'}</p>
          <h1 className="reader-book-title">{item.title}</h1>
          <p className="reader-author-line">By <strong>{item.author || 'Unknown'}</strong></p>
          {item.description && <p className="reader-desc-line">{item.description}</p>}

          {/* Paired Audiobook Callout Banner */}
          {item.pairedContent && (
            <div className="reader-paired-callout">
              <div className="reader-paired-callout-text">
                <i className="bi bi-headphones" />
                <div>
                  <strong>Audiobook edition available</strong>
                  <p>Listen with narration and synchronized audio chapters.</p>
                </div>
              </div>
              <button
                className="primary-button"
                onClick={() => navigateTo('listen', { query: `id=${item.pairedContent.id}` })}
                type="button"
              >
                <i className="bi bi-play-circle-fill" /> Listen now
              </button>
            </div>
          )}

          {downloadFiles.length > 0 && (
            <div className="admin-row-actions" style={{ marginTop: '16px' }}>
              {downloadFiles.map((file) => (
                <a className="ghost-button" href={file.url} key={file.url} rel="noreferrer" target="_blank">
                  <i className="bi bi-download" /> Download {file.format}
                </a>
              ))}
            </div>
          )}
        </section>

        {/* Table of Contents Drawer */}
        {showToc && (
          <div className="reader-toc-overlay" onClick={() => setShowToc(false)}>
            <aside aria-label="Table of contents" className="reader-toc-drawer" onClick={(e) => e.stopPropagation()}>
              <div className="reader-toc-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="bi bi-list-ul" style={{ color: 'var(--app-accent)', fontSize: '1.2rem' }} />
                  <h3>Chapters</h3>
                </div>
                <button
                  aria-label="Close table of contents"
                  className="ghost-button"
                  onClick={() => setShowToc(false)}
                  type="button"
                >
                  <i className="bi bi-x-lg" />
                </button>
              </div>

              <div className="reader-toc-list">
                {chaptersLoading ? (
                  <p className="settings-copy"><span className="admin-spin-small" /> Splitting into chapters...</p>
                ) : chapters.length > 0 ? (
                  chapters.map((ch, idx) => (
                    <button
                      className={`reader-toc-item ${activeChapterIndex === idx ? 'active' : ''}`}
                      key={ch.order || idx}
                      onClick={() => jumpToChapter(idx)}
                      type="button"
                    >
                      <span className="toc-item-order">{ch.order || idx + 1}</span>
                      <div className="toc-item-info">
                        <strong>{ch.title || `Chapter ${idx + 1}`}</strong>
                        {ch.excerpt && <small>{ch.excerpt}</small>}
                      </div>
                      <i className="bi bi-chevron-right" />
                    </button>
                  ))
                ) : (
                  <p className="empty-state">Single-stream book text. Enjoy reading!</p>
                )}
              </div>
            </aside>
          </div>
        )}

        {/* Reading Body Column */}
        <article className="content-reader-body-wrap" style={{ fontSize: `${fontSize}px` }}>
          <MarginNotesReader chapters={chapters} contentId={item._id || id} />
        </article>

        {/* Bottom Reader Utilities */}
        <div className="reader-bottom-nav">
          {chapters.length > 1 && (
            <button
              className="ghost-button"
              disabled={activeChapterIndex <= 0}
              onClick={() => jumpToChapter(activeChapterIndex - 1)}
              type="button"
            >
              <i className="bi bi-chevron-left" /> Prev chapter
            </button>
          )}
          <button
            className="ghost-button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            type="button"
          >
            <i className="bi bi-arrow-up" /> Back to top
          </button>
          {chapters.length > 1 && (
            <button
              className="ghost-button"
              disabled={activeChapterIndex >= chapters.length - 1}
              onClick={() => jumpToChapter(activeChapterIndex + 1)}
              type="button"
            >
              Next chapter <i className="bi bi-chevron-right" />
            </button>
          )}
          {item.pairedContent && (
            <button
              className="secondary-button"
              onClick={() => navigateTo('listen', { query: `id=${item.pairedContent.id}` })}
              type="button"
            >
              <i className="bi bi-headphones" /> Switch to audiobook
            </button>
          )}
        </div>

        {/* Comments Section */}
        <section style={{ marginTop: '48px' }}>
          <ContentComments contentId={item._id} />
        </section>
      </main>
    </div>
  )
}

export default ContentReaderPage
