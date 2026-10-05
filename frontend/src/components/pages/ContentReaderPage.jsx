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
  const [tocTab, setTocTab] = useState('chapters') // 'chapters' | 'bookmarks'
  const [tocSearch, setTocSearch] = useState('')
  const [activeChapterIndex, setActiveChapterIndex] = useState(0)

  // Track recent previous chapter when jumping across chapters
  const [recentPreviousChapter, setRecentPreviousChapter] = useState(() => {
    if (!id) return null
    try {
      const raw = localStorage.getItem(`bookworm_last_read_prev_${id}`)
      if (raw) {
        const parsed = JSON.parse(raw)
        return typeof parsed?.chapterIndex === 'number' ? parsed.chapterIndex : null
      }
    } catch (_) {}
    return null
  })

  // Bookmarks / Tags state
  const [bookmarks, setBookmarks] = useState(() => {
    if (!id) return []
    try {
      const raw = localStorage.getItem(`bookworm_bookmarks_${id}`)
      return raw ? JSON.parse(raw) : []
    } catch (_) {
      return []
    }
  })
  const [toastMsg, setToastMsg] = useState('')

  // Auto-dismiss toast
  useEffect(() => {
    if (!toastMsg) return
    const timer = setTimeout(() => setToastMsg(''), 2600)
    return () => clearTimeout(timer)
  }, [toastMsg])

  // Restore saved chapter progress on initial load
  useEffect(() => {
    if (!id) return
    try {
      const raw = localStorage.getItem(`bookworm_reading_progress_${id}`)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (typeof parsed?.chapterIndex === 'number' && parsed.chapterIndex > 0) {
          setActiveChapterIndex(parsed.chapterIndex)
          setSavedResume(parsed)
          setShowResumeBanner(true)
        }
      }
    } catch (_) {}
  }, [id])

  // Save chapter progress whenever chapter changes
  useEffect(() => {
    if (!id || !chapters.length) return
    const ch = chapters[activeChapterIndex]
    try {
      const progressData = {
        id,
        chapterIndex: activeChapterIndex,
        chapterOrder: ch?.order ?? activeChapterIndex,
        chapterTitle: ch?.title || (ch?.isIntro ? 'Phần mở đầu' : `Chương ${activeChapterIndex + 1}`),
        totalChapters: chapters.length,
        percent: Math.round(((activeChapterIndex + 1) / chapters.length) * 100),
        updatedAt: Date.now(),
      }
      localStorage.setItem(`bookworm_reading_progress_${id}`, JSON.stringify(progressData))
    } catch (_) {}
  }, [id, activeChapterIndex, chapters])

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
    if (index !== activeChapterIndex) {
      setRecentPreviousChapter(activeChapterIndex)
      try {
        localStorage.setItem(
          `bookworm_last_read_prev_${id}`,
          JSON.stringify({
            chapterIndex: activeChapterIndex,
            chapterTitle: chapters[activeChapterIndex]?.title || `Chương ${activeChapterIndex}`,
            timestamp: Date.now(),
          })
        )
      } catch (_) {}
    }
    setActiveChapterIndex(index)
    setShowToc(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleToggleBookmark() {
    if (!id || !chapters.length) return
    const ch = chapters[activeChapterIndex]
    const exists = bookmarks.some((b) => b.chapterIndex === activeChapterIndex)
    let updated = []
    if (exists) {
      updated = bookmarks.filter((b) => b.chapterIndex !== activeChapterIndex)
      setToastMsg('Đã bỏ đánh dấu chương này.')
    } else {
      const newBm = {
        id: `bm-${Date.now()}`,
        chapterIndex: activeChapterIndex,
        chapterOrder: ch?.order ?? activeChapterIndex,
        chapterTitle: ch?.title || (ch?.isIntro ? 'Phần mở đầu' : `Chương ${activeChapterIndex}`),
        timestamp: Date.now(),
      }
      updated = [newBm, ...bookmarks]
      setToastMsg(`Đã đánh dấu ${ch?.isIntro ? 'Phần mở đầu' : `Chương ${ch?.order || activeChapterIndex}`}!`)
    }
    setBookmarks(updated)
    try {
      localStorage.setItem(`bookworm_bookmarks_${id}`, JSON.stringify(updated))
    } catch (_) {}
  }

  function handleRemoveBookmark(bmId, e) {
    e?.stopPropagation()
    const updated = bookmarks.filter((b) => b.id !== bmId)
    setBookmarks(updated)
    try {
      localStorage.setItem(`bookworm_bookmarks_${id}`, JSON.stringify(updated))
    } catch (_) {}
    setToastMsg('Đã xoá dấu trang.')
  }

  const isCurrentBookmarked = bookmarks.some((b) => b.chapterIndex === activeChapterIndex)
  const currentChapterObj = chapters[activeChapterIndex]
  const totalRegularChapters = chapters.filter((c) => !c.isIntro && c.order !== 0).length || chapters.length

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
    if (savedResume && typeof savedResume.chapterIndex === 'number') {
      setActiveChapterIndex(savedResume.chapterIndex)
      setShowResumeBanner(false)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else if (savedResume && savedResume.scrollY) {
      window.scrollTo({ top: savedResume.scrollY, behavior: 'smooth' })
      setShowResumeBanner(false)
    }
  }

  if (!id) return <p className="admin-validation-error"><i className="bi bi-x-circle" /> No book selected.</p>
  if (loading && !item) {
    return <ContentReaderSkeleton />
  }
  if (error || !item) {
    return <p className="admin-validation-error"><i className="bi bi-x-circle" /> {error || 'Book not found.'}</p>
  }

  const hasHtmlEdition = item.files?.some((file) => file.format === 'html')
  const downloadFiles = item.files || []

  const filteredChapters = tocSearch.trim()
    ? chapters.filter((c) => {
        const query = tocSearch.trim().toLowerCase()
        return (
          (c.title && c.title.toLowerCase().includes(query)) ||
          String(c.order).includes(query) ||
          (c.isIntro && 'mở đầu introduction'.includes(query))
        )
      })
    : chapters

  return (
    <div className={`content-reader-page reader-theme-${theme} reader-font-${fontFamily}`}>
      {/* Sticky Top Reading Control Bar */}
      <header className="content-reader-sticky-bar">
        <div className="reader-bar-inner">
          <button className="ghost-button reader-bar-back" onClick={() => navigateTo('detail', { query: `id=${id}` })} type="button">
            <i className="bi bi-arrow-left" /> Trở lại
          </button>

          <span className="reader-bar-title" title={item.title}>
            {item.title}
          </span>

          <div className="reader-bar-controls">
            {/* Table of Contents trigger button */}
            <button
              aria-label="Mục lục chương"
              className={`ghost-button reader-toc-trigger ${showToc ? 'active' : ''}`}
              onClick={() => setShowToc((v) => !v)}
              title="Mục lục chương & Dấu trang"
              type="button"
            >
              <i className="bi bi-list-ul" />
              <span className="reader-toc-trigger-text">
                {chapters.length
                  ? currentChapterObj?.isIntro
                    ? 'Mở đầu'
                    : `Chương ${currentChapterObj?.order || activeChapterIndex}`
                  : 'Mục lục'}
              </span>
            </button>

            {/* Bookmark button */}
            <button
              aria-label={isCurrentBookmarked ? 'Bỏ lưu dấu trang' : 'Đánh dấu chương này'}
              aria-pressed={isCurrentBookmarked}
              className={`ghost-button reader-bookmark-trigger ${isCurrentBookmarked ? 'active' : ''}`}
              onClick={handleToggleBookmark}
              title={isCurrentBookmarked ? 'Bỏ lưu dấu trang' : 'Đánh dấu chương này để quay lại'}
              type="button"
            >
              <i className={`bi ${isCurrentBookmarked ? 'bi-bookmark-check-fill' : 'bi-bookmark-plus'}`} />
              <span className="reader-bookmark-text">{isCurrentBookmarked ? 'Đã lưu' : 'Đánh dấu'}</span>
            </button>

            {/* Reading progress indicator */}
            <span
              className="reader-progress-indicator"
              title={
                chapters.length > 0
                  ? currentChapterObj?.isIntro
                    ? 'Phần mở đầu (Introduction)'
                    : `Chương ${currentChapterObj?.order || activeChapterIndex} / ${totalRegularChapters}`
                  : `${readPercent}% tiến độ`
              }
            >
              <i className="bi bi-bookmark-check-fill" />{' '}
              {chapters.length > 0
                ? currentChapterObj?.isIntro
                  ? 'Mở đầu'
                  : `Ch. ${currentChapterObj?.order || activeChapterIndex}/${totalRegularChapters}`
                : `${readPercent}%`}
            </span>

            {/* Font size adjustments */}
            <div className="reader-btn-group" role="group" aria-label="Font size controls">
              <button
                className="ghost-button"
                disabled={fontSize <= 14}
                onClick={() => setFontSize((s) => Math.max(14, s - 2))}
                title="Giảm cỡ chữ"
                type="button"
              >
                A-
              </button>
              <button
                className="ghost-button"
                disabled={fontSize >= 26}
                onClick={() => setFontSize((s) => Math.min(26, s + 2))}
                title="Tăng cỡ chữ"
                type="button"
              >
                A+
              </button>
            </div>

            {/* Font family toggle */}
            <button
              className="ghost-button reader-font-btn"
              onClick={() => setFontFamily((f) => (f === 'serif' ? 'sans' : 'serif'))}
              title="Đổi kiểu chữ Serif / Sans-serif"
              type="button"
            >
              {fontFamily === 'serif' ? 'Serif' : 'Sans'}
            </button>

            {/* Theme Toggle: Strictly Light & Dark modes only */}
            <div className="reader-theme-toggle" role="group" aria-label="Reader color mode">
              <button
                aria-label="Chế độ sáng"
                aria-pressed={theme === 'light'}
                className={`theme-toggle-btn ${theme === 'light' ? 'active' : ''}`}
                onClick={() => setTheme('light')}
                title="Chế độ sáng"
                type="button"
              >
                <i className="bi bi-sun-fill" />
                <span className="theme-label">Sáng</span>
              </button>
              <button
                aria-label="Chế độ tối"
                aria-pressed={theme === 'dark'}
                className={`theme-toggle-btn ${theme === 'dark' ? 'active' : ''}`}
                onClick={() => setTheme('dark')}
                title="Chế độ tối"
                type="button"
              >
                <i className="bi bi-moon-fill" />
                <span className="theme-label">Tối</span>
              </button>
            </div>
          </div>
        </div>
        <div className="reader-progress-line" aria-hidden="true">
          <div className="reader-progress-fill" style={{ width: `${readPercent}%` }} />
        </div>
      </header>

      {/* Reader Column Container */}
      <main className="content-reader-column">
        {/* Resume Banner */}
        {showResumeBanner && savedResume && (
          <aside aria-label="Tiếp tục đọc sách" className="reader-resume-banner">
            <div className="reader-resume-banner-info">
              <div className="resume-icon-badge">
                <i className="bi bi-bookmark-check-fill" />
              </div>
              <div className="resume-text-details">
                <strong>Tiếp tục đọc từ lần trước (Continue Reading)</strong>
                <p>
                  Bạn đang đọc dở{' '}
                  <strong>
                    {savedResume.chapterTitle ||
                      (savedResume.chapterOrder === 0
                        ? 'Phần mở đầu'
                        : `Chương ${savedResume.chapterOrder || (savedResume.chapterIndex != null ? savedResume.chapterIndex : 1)}`)}
                  </strong>
                  {savedResume.percent ? ` (${savedResume.percent}% tiến độ)` : ''}
                </p>
              </div>
            </div>
            <div className="resume-banner-actions">
              <button className="primary-button" onClick={handleResume} type="button">
                <i className="bi bi-book-half" /> Tiếp tục đọc
              </button>
              <button
                aria-label="Đóng thông báo"
                className="ghost-button resume-dismiss-btn"
                onClick={() => setShowResumeBanner(false)}
                type="button"
              >
                <i className="bi bi-x-lg" />
              </button>
            </div>
          </aside>
        )}

        {/* Book Metadata Header */}
        <section className="content-reader-header">
          <p className="mono-eyebrow">{item.source || 'Gutenberg Ebook'}</p>
          <h1 className="reader-book-title">{item.title}</h1>
          <p className="reader-author-line">Tác giả: <strong>{item.author || 'Khuyết danh'}</strong></p>
          {item.description && <p className="reader-desc-line">{item.description}</p>}

          {/* Paired Audiobook Callout Banner */}
          {item.pairedContent && (
            <div className="reader-paired-callout">
              <div className="reader-paired-callout-text">
                <i className="bi bi-headphones" />
                <div>
                  <strong>Có bản Sách nói (Audiobook)</strong>
                  <p>Nghe diễn đọc trọn vẹn với giọng đọc chuẩn và các chương đồng bộ.</p>
                </div>
              </div>
              <button
                className="primary-button"
                onClick={() => navigateTo('listen', { query: `id=${item.pairedContent.id}` })}
                type="button"
              >
                <i className="bi bi-play-circle-fill" /> Nghe ngay &rarr;
              </button>
            </div>
          )}

          {downloadFiles.length > 0 && (
            <div className="admin-row-actions" style={{ marginTop: '16px' }}>
              {downloadFiles.map((file) => (
                <a className="ghost-button" href={file.url} key={file.url} rel="noreferrer" target="_blank">
                  <i className="bi bi-download" /> Tải về {file.format}
                </a>
              ))}
            </div>
          )}
        </section>

        {/* Table of Contents & Bookmarks Drawer */}
        {showToc && (
          <div className="reader-toc-overlay" onClick={() => setShowToc(false)}>
            <aside aria-label="Mục lục sách" className="reader-toc-drawer" onClick={(e) => e.stopPropagation()}>
              <div className="reader-toc-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="bi bi-journal-text" style={{ color: 'var(--app-accent)', fontSize: '1.25rem' }} />
                  <h3>Mục lục &amp; Dấu trang</h3>
                </div>
                <button
                  aria-label="Đóng mục lục"
                  className="ghost-button"
                  onClick={() => setShowToc(false)}
                  type="button"
                >
                  <i className="bi bi-x-lg" />
                </button>
              </div>

              {/* Drawer Tabs: Chapters vs Bookmarks */}
              <div className="reader-toc-tabs" role="tablist">
                <button
                  aria-selected={tocTab === 'chapters'}
                  className={`reader-toc-tab-btn ${tocTab === 'chapters' ? 'active' : ''}`}
                  onClick={() => setTocTab('chapters')}
                  role="tab"
                  type="button"
                >
                  <i className="bi bi-list-ol" /> Danh sách chương ({chapters.length})
                </button>
                <button
                  aria-selected={tocTab === 'bookmarks'}
                  className={`reader-toc-tab-btn ${tocTab === 'bookmarks' ? 'active' : ''}`}
                  onClick={() => setTocTab('bookmarks')}
                  role="tab"
                  type="button"
                >
                  <i className="bi bi-bookmarks-fill" /> Dấu trang ({bookmarks.length})
                </button>
              </div>

              {tocTab === 'chapters' ? (
                <>
                  {/* Quick Return to Last Read Chapter Callout */}
                  {recentPreviousChapter !== null &&
                    recentPreviousChapter !== activeChapterIndex &&
                    chapters[recentPreviousChapter] && (
                      <div className="reader-toc-quick-return">
                        <div className="toc-quick-return-info">
                          <i className="bi bi-clock-history" />
                          <div>
                            <small>Vừa xem gần nhất:</small>
                            <strong>
                              {chapters[recentPreviousChapter].isIntro
                                ? 'Phần mở đầu (Introduction)'
                                : chapters[recentPreviousChapter].title || `Chương ${chapters[recentPreviousChapter].order || recentPreviousChapter}`}
                            </strong>
                          </div>
                        </div>
                        <button
                          className="primary-button toc-quick-return-btn"
                          onClick={() => jumpToChapter(recentPreviousChapter)}
                          type="button"
                        >
                          <i className="bi bi-arrow-return-left" /> Quay lại ngay
                        </button>
                      </div>
                    )}

                  {chapters.length > 5 && (
                    <div className="reader-toc-search-wrap">
                      <i className="bi bi-search" />
                      <input
                        aria-label="Tìm kiếm chương"
                        className="reader-toc-search-input"
                        onChange={(e) => setTocSearch(e.target.value)}
                        placeholder="Tìm tên hoặc số chương..."
                        type="search"
                        value={tocSearch}
                      />
                      {tocSearch && (
                        <button
                          aria-label="Xoá tìm kiếm"
                          className="reader-toc-search-clear"
                          onClick={() => setTocSearch('')}
                          type="button"
                        >
                          <i className="bi bi-x-circle-fill" />
                        </button>
                      )}
                    </div>
                  )}

                  <div className="reader-toc-list">
                    {chaptersLoading ? (
                      <p className="settings-copy"><span className="admin-spin-small" /> Đang chuẩn bị danh mục chương...</p>
                    ) : filteredChapters.length > 0 ? (
                      filteredChapters.map((ch) => {
                        const realIdx = chapters.indexOf(ch)
                        const isActive = activeChapterIndex === realIdx
                        const isRecent = recentPreviousChapter === realIdx
                        const isBookmarked = bookmarks.some((b) => b.chapterIndex === realIdx)

                        return (
                          <button
                            className={`reader-toc-item ${isActive ? 'active' : ''}`}
                            key={ch.order || realIdx}
                            onClick={() => jumpToChapter(realIdx)}
                            type="button"
                          >
                            <span className="toc-item-order">
                              {ch.isIntro || ch.order === 0 ? (
                                <i className="bi bi-journal-bookmark" title="Phần mở đầu" />
                              ) : (
                                ch.order || realIdx
                              )}
                            </span>
                            <div className="toc-item-info">
                              <div className="toc-item-title-row">
                                <strong>
                                  {ch.isIntro || ch.order === 0
                                    ? ch.title || 'Phần mở đầu (Introduction)'
                                    : ch.title || `Chương ${ch.order || realIdx}`}
                                </strong>
                                <div className="toc-item-tags">
                                  {isActive && <span className="toc-status-badge current">Đang đọc</span>}
                                  {isRecent && !isActive && <span className="toc-status-badge recent">Gần nhất</span>}
                                  {isBookmarked && <i className="bi bi-bookmark-fill toc-bookmark-icon" title="Đã đánh dấu" />}
                                </div>
                              </div>
                              {ch.excerpt && <small>{ch.excerpt}</small>}
                            </div>
                            <i className="bi bi-chevron-right" />
                          </button>
                        )
                      })
                    ) : (
                      <p className="empty-state">Không tìm thấy chương phù hợp.</p>
                    )}
                  </div>
                </>
              ) : (
                <div className="reader-toc-bookmarks-list">
                  {bookmarks.length > 0 ? (
                    bookmarks.map((bm) => (
                      <div className="reader-bookmark-item" key={bm.id}>
                        <div className="reader-bookmark-item-info">
                          <div className="reader-bookmark-item-title">
                            <i className="bi bi-bookmark-fill" style={{ color: 'var(--app-accent)' }} />
                            <strong>{bm.chapterTitle || `Chương ${bm.chapterOrder || bm.chapterIndex}`}</strong>
                          </div>
                          <span className="reader-bookmark-item-time">
                            <i className="bi bi-clock" /> {new Date(bm.timestamp).toLocaleDateString('vi-VN')} {new Date(bm.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="reader-bookmark-actions">
                          <button
                            className="primary-button reader-bookmark-jump-btn"
                            onClick={() => jumpToChapter(bm.chapterIndex)}
                            type="button"
                          >
                            <i className="bi bi-arrow-right-circle" /> Đọc tiếp
                          </button>
                          <button
                            aria-label="Xoá dấu trang"
                            className="ghost-button reader-bookmark-del-btn"
                            onClick={(e) => handleRemoveBookmark(bm.id, e)}
                            title="Xoá dấu trang"
                            type="button"
                          >
                            <i className="bi bi-trash" />
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="empty-state reader-bookmarks-empty">
                      <i className="bi bi-bookmark-plus" style={{ fontSize: '2rem', color: 'var(--app-muted)' }} />
                      <p>Bạn chưa đánh dấu chương nào.</p>
                      <small>Bấm nút <strong>[Đánh dấu]</strong> trên thanh điều hướng trên cùng để lưu nhanh vị trí bạn muốn quay lại!</small>
                    </div>
                  )}
                </div>
              )}
            </aside>
          </div>
        )}

        {/* Reading Body Column */}
        <article className="content-reader-body-wrap" style={{ fontSize: `${fontSize}px` }}>
          <MarginNotesReader
            activeChapterIndex={activeChapterIndex}
            chapters={chapters}
            contentId={item._id || id}
            onChapterChange={setActiveChapterIndex}
          />
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
              <i className="bi bi-chevron-left" /> Chương trước
            </button>
          )}

          <button
            className="secondary-button reader-toc-center-btn"
            onClick={() => setShowToc(true)}
            title="Mở mục lục chương để chuyển nhanh"
            type="button"
          >
            <i className="bi bi-list-ul" />
            <span>
              {currentChapterObj?.isIntro
                ? 'Mở đầu'
                : `Chương ${currentChapterObj?.order || activeChapterIndex}`} / {totalRegularChapters}
            </span>
          </button>

          {activeChapterIndex > 1 && (
            <button
              className="ghost-button reader-jump-first-btn"
              onClick={() => jumpToChapter(chapters[0]?.isIntro ? 0 : 0)}
              title="Về chương đầu sách"
              type="button"
            >
              <i className="bi bi-skip-backward-fill" /> Về đầu sách
            </button>
          )}

          {recentPreviousChapter !== null && recentPreviousChapter !== activeChapterIndex && (
            <button
              className="ghost-button reader-jump-recent-btn"
              onClick={() => jumpToChapter(recentPreviousChapter)}
              title="Quay lại chương bạn vừa đọc gần nhất"
              type="button"
            >
              <i className="bi bi-arrow-return-left" /> Về Ch. {chapters[recentPreviousChapter]?.order || recentPreviousChapter}
            </button>
          )}

          <button
            className="ghost-button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            type="button"
          >
            <i className="bi bi-arrow-up" /> Lên đầu
          </button>

          {chapters.length > 1 && (
            <button
              className="ghost-button"
              disabled={activeChapterIndex >= chapters.length - 1}
              onClick={() => jumpToChapter(activeChapterIndex + 1)}
              type="button"
            >
              Chương tiếp <i className="bi bi-chevron-right" />
            </button>
          )}

          {item.pairedContent && (
            <button
              className="secondary-button"
              onClick={() => navigateTo('listen', { query: `id=${item.pairedContent.id}` })}
              type="button"
            >
              <i className="bi bi-headphones" /> Nghe sách nói
            </button>
          )}
        </div>

        {/* Comments Section */}
        <section style={{ marginTop: '48px' }}>
          <ContentComments contentId={item._id || item.id || id} />
        </section>
      </main>

      {/* Floating Bookmark Feedback Toast */}
      {toastMsg && (
        <aside aria-live="polite" className="reader-floating-toast">
          <i className="bi bi-bookmark-check-fill" />
          <span>{toastMsg}</span>
        </aside>
      )}
    </div>
  )
}

function ContentReaderSkeleton() {
  return (
    <div className="content-reader-page reader-skeleton-page" aria-busy="true" aria-label="Loading reading content">
      <header className="content-reader-sticky-bar">
        <div className="reader-bar-inner">
          <div className="skeleton-box" style={{ width: '80px', height: '34px', borderRadius: '8px' }} />
          <div className="skeleton-box" style={{ width: '220px', height: '20px', borderRadius: '6px' }} />
          <div className="skeleton-box" style={{ width: '100px', height: '34px', borderRadius: '8px' }} />
        </div>
      </header>
      <div className="content-reader-container">
        <div className="content-reader-body-wrap">
          <div className="skeleton-box" style={{ width: '140px', height: '22px', borderRadius: '999px', marginBottom: '14px' }} />
          <div className="skeleton-box" style={{ maxWidth: '420px', height: '34px', marginBottom: '32px' }} />
          <div className="reader-skeleton-paragraphs">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="reader-skeleton-para">
                <div className="skeleton-box" style={{ height: '18px', width: '98%', marginBottom: '8px' }} />
                <div className="skeleton-box" style={{ height: '18px', width: '94%', marginBottom: '8px' }} />
                <div className="skeleton-box" style={{ height: '18px', width: i % 2 === 0 ? '75%' : '88%' }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ContentReaderPage
