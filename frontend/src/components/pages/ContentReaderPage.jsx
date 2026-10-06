import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { auth } from '../../features/auth-firebase/firebaseConfig'
import { apiFetch, publicApiFetch } from '../../utils/apiClient'
import { useNavigation } from '../../context/NavigationContext'
import ContentComments from '../content/ContentComments'
import MarginNotesReader from '../content/MarginNotesReader'

function ContentReaderPage() {
  const { navigateTo } = useNavigation()
  const [searchParams] = useSearchParams()
  const id = searchParams.get('id')

  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Reader customization states (Light, Sepia Warm Paper, Dark)
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('bookworm_reader_theme')
    return saved === 'dark' || saved === 'sepia' ? saved : 'light'
  })
  const [fontSize, setFontSize] = useState(() => Number(localStorage.getItem('bookworm_reader_fontsize')) || 18)
  const [fontFamily, setFontFamily] = useState(() => localStorage.getItem('bookworm_reader_font') || 'serif')
  const [lineHeight, setLineHeight] = useState(() => Number(localStorage.getItem('bookworm_reader_lineheight')) || 1.85)
  const [pageWidth, setPageWidth] = useState(() => {
    const saved = Number(localStorage.getItem('bookworm_reader_width'))
    return saved && saved >= 700 ? saved : 1040
  })
  const [textAlign, setTextAlign] = useState(() => localStorage.getItem('bookworm_reader_align') || 'justify')
  const [showAaPopover, setShowAaPopover] = useState(false)
  const [zenMode, setZenMode] = useState(false)

  // Web Speech API Text-to-Speech (AI TTS)
  const [isTtsActive, setIsTtsActive] = useState(false)
  const [isTtsPlaying, setIsTtsPlaying] = useState(false)
  const [ttsSpeed, setTtsSpeed] = useState(1.0)
  const [currentChapterParagraphs, setCurrentChapterParagraphs] = useState([])
  const [chapterStartParagraphIndex, setChapterStartParagraphIndex] = useState(0)
  const [ttsLocalIndex, setTtsLocalIndex] = useState(0)
  const ttsUtteranceRef = useRef(null)

  // Text selection floating quick-actions
  const [selectionMenu, setSelectionMenu] = useState(null)

  // Reading progress and resume
  const [readPercent, setReadPercent] = useState(0)
  const [savedResume, setSavedResume] = useState(null)
  const [showResumeBanner, setShowResumeBanner] = useState(false)
  const scrollTimeoutRef = useRef(null)

  // Smart Chapter splitting & Table of contents
  const [chapters, setChapters] = useState([])
  const [chaptersLoading, setChaptersLoading] = useState(false)
  const [showToc, setShowToc] = useState(false)
  const [tocOrigin, setTocOrigin] = useState('top') // 'top' | 'bottom' | 'zen'
  const [tocTab, setTocTab] = useState('chapters') // 'chapters' | 'bookmarks'
  const [tocSearch, setTocSearch] = useState('')
  const [activeChapterIndex, setActiveChapterIndex] = useState(0)

  function handleToggleToc(origin = 'top') {
    if (showToc && tocOrigin === origin) {
      setShowToc(false)
    } else {
      setTocOrigin(origin)
      setShowToc(true)
    }
  }

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

  // Restore saved chapter progress from MongoDB (signed-in user only)
  useEffect(() => {
    if (!id || !auth.currentUser) {
      setSavedResume(null)
      setShowResumeBanner(false)
      return undefined
    }
    let ignore = false
    apiFetch('/api/users/me/progress')
      .then((data) => {
        if (ignore || !Array.isArray(data?.progress)) return
        const match = data.progress.find((p) => String(p.contentId) === String(id))
        if (match && typeof match.chapterIndex === 'number' && match.chapterIndex > 0) {
          setActiveChapterIndex(match.chapterIndex)
          setSavedResume(match)
          setShowResumeBanner(true)
        }
      })
      .catch(() => {})
    return () => {
      ignore = true
    }
  }, [id])

  // Save chapter progress to MongoDB whenever chapter changes (only for signed-in user)
  useEffect(() => {
    if (!id || !chapters.length || !auth.currentUser) return
    const ch = chapters[activeChapterIndex]
    const progressData = {
      contentId: String(id),
      title: item?.title || 'Ebook',
      author: item?.author || 'Unknown author',
      cover: item?.cover || '',
      type: 'ebook',
      chapterIndex: activeChapterIndex,
      chapterOrder: ch?.order ?? activeChapterIndex,
      chapterTitle: ch?.title || (ch?.isIntro ? 'Introduction' : `Chapter ${activeChapterIndex + 1}`),
      percent: Math.round(((activeChapterIndex + 1) / chapters.length) * 100),
    }
    apiFetch('/api/users/me/progress', { method: 'POST', body: progressData }).catch(() => {})
  }, [id, activeChapterIndex, chapters, item])

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

  // Engagement tracking: increment view count in MongoDB and sync UI immediately
  useEffect(() => {
    if (!id) return undefined
    publicApiFetch(`/api/content/${id}/view`, { method: 'POST' })
      .then((res) => {
        const views = res?.views ?? res?.data?.views
        if (typeof views === 'number') {
          setItem((prev) => (prev ? { ...prev, views } : prev))
        }
      })
      .catch(() => {})
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
            chapterTitle: chapters[activeChapterIndex]?.title || `Chapter ${activeChapterIndex}`,
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
      setToastMsg('Bookmark removed.')
    } else {
      const newBm = {
        id: `bm-${Date.now()}`,
        chapterIndex: activeChapterIndex,
        chapterOrder: ch?.order ?? activeChapterIndex,
        chapterTitle: ch?.title || (ch?.isIntro ? 'Introduction' : `Chapter ${activeChapterIndex}`),
        timestamp: Date.now(),
      }
      updated = [newBm, ...bookmarks]
      setToastMsg(`Bookmarked ${ch?.isIntro ? 'Introduction' : `Chapter ${ch?.order || activeChapterIndex}`}!`)
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
    setToastMsg('Bookmark deleted.')
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

  useEffect(() => {
    localStorage.setItem('bookworm_reader_lineheight', String(lineHeight))
  }, [lineHeight])

  useEffect(() => {
    localStorage.setItem('bookworm_reader_width', String(pageWidth))
  }, [pageWidth])

  useEffect(() => {
    localStorage.setItem('bookworm_reader_align', textAlign)
  }, [textAlign])

  // Dismiss popover when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (showAaPopover && !e.target.closest('.reader-aa-popover') && !e.target.closest('.reader-aa-trigger') && !e.target.closest('.zen-pill-btn')) {
        setShowAaPopover(false)
      }
      if (
        showToc &&
        !e.target.closest('.reader-toc-wrap') &&
        !e.target.closest('.reader-bottom-toc-wrap') &&
        !e.target.closest('.reader-chapter-dock') &&
        !e.target.closest('.zen-toc-wrap')
      ) {
        setShowToc(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showAaPopover, showToc])

  // Keyboard shortcut: Escape exits Zen mode, closes drawers and selection popovers
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        if (showAaPopover) setShowAaPopover(false)
        if (showToc) setShowToc(false)
        if (zenMode) setZenMode(false)
        if (selectionMenu) setSelectionMenu(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showAaPopover, showToc, zenMode, selectionMenu])

  // Web Speech API Text-to-Speech logic
  const stopTts = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    setIsTtsPlaying(false)
    setIsTtsActive(false)
  }, [])

  const playParagraphTts = useCallback(
    (index, paragraphs = currentChapterParagraphs, speed = ttsSpeed) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        setToastMsg('Browser does not support Web Speech API for reading aloud.')
        return
      }
      if (!paragraphs || index >= paragraphs.length || index < 0) {
        stopTts()
        return
      }

      window.speechSynthesis.cancel()
      const text = paragraphs[index]
      if (!text || !text.trim()) {
        if (index + 1 < paragraphs.length) {
          setTtsLocalIndex(index + 1)
          playParagraphTts(index + 1, paragraphs, speed)
        } else {
          stopTts()
        }
        return
      }

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = speed
      const voices = window.speechSynthesis.getVoices()
      const viVoice = voices.find((v) => v.lang && v.lang.toLowerCase().includes('vi'))
      if (viVoice) {
        utterance.voice = viVoice
      }

      utterance.onend = () => {
        if (index + 1 < paragraphs.length) {
          setTtsLocalIndex(index + 1)
          playParagraphTts(index + 1, paragraphs, speed)
        } else {
          stopTts()
          setToastMsg('Finished reading this chapter aloud.')
        }
      }

      utterance.onerror = (e) => {
        if (e.error !== 'canceled' && e.error !== 'interrupted') {
          setIsTtsPlaying(false)
        }
      }

      ttsUtteranceRef.current = utterance
      window.speechSynthesis.speak(utterance)
      setIsTtsPlaying(true)
      setIsTtsActive(true)

      const targetEl = document.getElementById(`paragraph-${chapterStartParagraphIndex + index}`)
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    },
    [currentChapterParagraphs, ttsSpeed, chapterStartParagraphIndex, stopTts]
  )

  function handleStartTts() {
    if (!currentChapterParagraphs.length) {
      setToastMsg('Preparing reading content...')
      return
    }
    if (isTtsActive && isTtsPlaying) {
      window.speechSynthesis.pause()
      setIsTtsPlaying(false)
      return
    }
    if (isTtsActive && !isTtsPlaying) {
      window.speechSynthesis.resume()
      setIsTtsPlaying(true)
      return
    }
    setTtsLocalIndex(0)
    playParagraphTts(0, currentChapterParagraphs, ttsSpeed)
    setToastMsg('Starting AI reading aloud for this chapter...')
  }

  function handleTtsTogglePlay() {
    if (isTtsPlaying) {
      window.speechSynthesis.pause()
      setIsTtsPlaying(false)
    } else {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume()
        setIsTtsPlaying(true)
      } else {
        playParagraphTts(ttsLocalIndex, currentChapterParagraphs, ttsSpeed)
      }
    }
  }

  function handleTtsPrev() {
    if (ttsLocalIndex > 0) {
      const prev = ttsLocalIndex - 1
      setTtsLocalIndex(prev)
      playParagraphTts(prev, currentChapterParagraphs, ttsSpeed)
    }
  }

  function handleTtsNext() {
    if (ttsLocalIndex < currentChapterParagraphs.length - 1) {
      const next = ttsLocalIndex + 1
      setTtsLocalIndex(next)
      playParagraphTts(next, currentChapterParagraphs, ttsSpeed)
    }
  }

  function handleTtsCycleSpeed() {
    const speeds = [0.8, 1.0, 1.2, 1.5]
    const curIdx = speeds.indexOf(ttsSpeed)
    const nextSpeed = speeds[(curIdx + 1) % speeds.length]
    setTtsSpeed(nextSpeed)
    if (isTtsActive && isTtsPlaying) {
      playParagraphTts(ttsLocalIndex, currentChapterParagraphs, nextSpeed)
    }
  }

  function handleTtsStop() {
    stopTts()
    setToastMsg('Reading aloud stopped.')
  }

  // Stop TTS on chapter change or unmount
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
    }
  }, [activeChapterIndex])

  const handleParagraphsLoaded = useCallback((paras, startIdx) => {
    setCurrentChapterParagraphs(paras)
    setChapterStartParagraphIndex(startIdx)
  }, [])

  // Floating text selection quick-actions
  function handleTextSelection() {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed) {
      setSelectionMenu(null)
      return
    }
    const text = sel.toString().trim()
    if (text.length < 2) {
      setSelectionMenu(null)
      return
    }
    try {
      const range = sel.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        setSelectionMenu({
          text,
          top: Math.max(10, rect.top - 52 + window.scrollY),
          left: Math.max(16, rect.left + rect.width / 2),
        })
      }
    } catch (_) {
      setSelectionMenu(null)
    }
  }

  function handleSelHighlight() {
    setToastMsg('Snippet highlighted.')
    setSelectionMenu(null)
    window.getSelection()?.removeAllRanges()
  }

  function handleSelNote() {
    setToastMsg('Click the note icon 💬 beside the paragraph to add a margin note.')
    setSelectionMenu(null)
  }

  function handleSelSpeak() {
    if (!selectionMenu?.text) return
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      const utt = new SpeechSynthesisUtterance(selectionMenu.text)
      utt.rate = ttsSpeed
      const voices = window.speechSynthesis.getVoices()
      const viVoice = voices.find((v) => v.lang && v.lang.toLowerCase().includes('vi'))
      if (viVoice) utt.voice = viVoice
      window.speechSynthesis.speak(utt)
      setToastMsg('Reading selected text...')
    }
    setSelectionMenu(null)
  }

  function handleSelCopy() {
    if (!selectionMenu?.text) return
    navigator.clipboard
      ?.writeText(selectionMenu.text)
      .then(() => {
        setToastMsg('Snippet copied to clipboard.')
      })
      .catch(() => {})
    setSelectionMenu(null)
    window.getSelection()?.removeAllRanges()
  }

  // Fetch book details
  useEffect(() => {
    if (!id) return
    let ignore = false
    setLoading(true)
    setError('')

    publicApiFetch(`/api/content/${id}`)
      .then((data) => {
        if (ignore) return
        if (data && (data._id || data.id || data.title)) {
          setItem(data)
          if (auth.currentUser && data.categories?.length) {
            apiFetch('/api/users/me/engagement', { method: 'POST', body: { categories: data.categories } }).catch(() => {})
          }
        } else {
          return publicApiFetch(`/api/books/${id}`).then((bData) => {
            if (!ignore && bData?.book) setItem(bData.book)
          })
        }
      })
      .catch(() => {
        return publicApiFetch(`/api/books/${id}`)
          .then((bData) => {
            if (!ignore && bData?.book) setItem(bData.book)
          })
          .catch((err) => {
            if (!ignore) setError(err.message)
          })
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })

    return () => {
      ignore = true
    }
  }, [id])

  // Track scroll percentage for progress indicator
  useEffect(() => {
    if (!id || !item) return

    function handleScroll() {
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight
      if (scrollHeight <= 0) return

      const currentScroll = window.scrollY
      const percent = Math.min(100, Math.max(0, Math.round((currentScroll / scrollHeight) * 100)))
      setReadPercent(percent)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
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
          (c.isIntro && 'introduction intro'.includes(query))
        )
      })
    : chapters

  return (
    <div
      className={`content-reader-page reader-theme-${theme} reader-font-${fontFamily} ${zenMode ? 'reader-zen-active' : ''}`}
      style={{
        '--reader-font-size': `${fontSize}px`,
        '--reader-line-height': lineHeight,
        '--reader-max-width': `${pageWidth}px`,
      }}
    >
      {/* Floating Zen Pill when in Zen distraction-free mode */}
      {zenMode && (
        <aside aria-label="Zen mode controls" className="reader-zen-floating-pill">
          <button
            className="ghost-button zen-pill-exit"
            onClick={() => setZenMode(false)}
            title="Exit Zen mode (Esc)"
            type="button"
          >
            <i className="bi bi-x-lg" />
            <span>Exit Zen (Esc)</span>
          </button>
          <div className="zen-pill-divider" />
          <button
            className="ghost-button zen-pill-btn"
            onClick={() => setShowAaPopover((v) => !v)}
            title="Reading appearance"
            type="button"
          >
            <i className="bi bi-fonts" />
          </button>
          <div className="zen-toc-wrap">
            <button
              aria-expanded={showToc && tocOrigin === 'zen'}
              className="ghost-button zen-pill-btn"
              onClick={() => handleToggleToc('zen')}
              title="Table of contents"
              type="button"
            >
              <i className="bi bi-list-ul" />
            </button>
            {showToc && tocOrigin === 'zen' && (
              <ChapterTocPopover
                activeChapterIndex={activeChapterIndex}
                bookmarks={bookmarks}
                chapters={chapters}
                chaptersLoading={chaptersLoading}
                filteredChapters={filteredChapters}
                handleRemoveBookmark={handleRemoveBookmark}
                jumpToChapter={jumpToChapter}
                onClose={() => setShowToc(false)}
                placement="zen"
                recentPreviousChapter={recentPreviousChapter}
                setTocSearch={setTocSearch}
                setTocTab={setTocTab}
                tocSearch={tocSearch}
                tocTab={tocTab}
              />
            )}
          </div>
          <span className="zen-pill-progress">{readPercent}%</span>
        </aside>
      )}

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
            {/* Table of Contents Trigger & Adjacent Popover */}
            <div className="reader-toc-wrap">
              <button
                aria-expanded={showToc && tocOrigin === 'top'}
                aria-label="Table of contents"
                className={`ghost-button reader-toc-trigger ${showToc && tocOrigin === 'top' ? 'active' : ''}`}
                onClick={() => handleToggleToc('top')}
                title="Table of contents & bookmarks"
                type="button"
              >
                <i className="bi bi-list-ul" />
                <span className="reader-toc-trigger-text">
                  {chapters.length
                    ? currentChapterObj?.isIntro
                      ? 'Introduction'
                      : `Chapter ${currentChapterObj?.order || activeChapterIndex}`
                    : 'Contents'}
                </span>
              </button>

              {showToc && tocOrigin === 'top' && (
                <ChapterTocPopover
                  activeChapterIndex={activeChapterIndex}
                  bookmarks={bookmarks}
                  chapters={chapters}
                  chaptersLoading={chaptersLoading}
                  filteredChapters={filteredChapters}
                  handleRemoveBookmark={handleRemoveBookmark}
                  jumpToChapter={jumpToChapter}
                  onClose={() => setShowToc(false)}
                  placement="top"
                  recentPreviousChapter={recentPreviousChapter}
                  setTocSearch={setTocSearch}
                  setTocTab={setTocTab}
                  tocSearch={tocSearch}
                  tocTab={tocTab}
                />
              )}
            </div>

            {/* Bookmark button */}
            <button
              aria-label={isCurrentBookmarked ? 'Remove bookmark' : 'Bookmark this chapter'}
              aria-pressed={isCurrentBookmarked}
              className={`ghost-button reader-bookmark-trigger ${isCurrentBookmarked ? 'active' : ''}`}
              onClick={handleToggleBookmark}
              title={isCurrentBookmarked ? 'Remove bookmark' : 'Bookmark this chapter to return later'}
              type="button"
            >
              <i className={`bi ${isCurrentBookmarked ? 'bi-bookmark-check-fill' : 'bi-bookmark-plus'}`} />
              <span className="reader-bookmark-text">{isCurrentBookmarked ? 'Saved' : 'Bookmark'}</span>
            </button>

            {/* Reading progress indicator */}
            <span
              className="reader-progress-indicator"
              title={
                chapters.length > 0
                  ? currentChapterObj?.isIntro
                    ? 'Introduction'
                    : `Chapter ${currentChapterObj?.order || activeChapterIndex} / ${totalRegularChapters}`
                  : `${readPercent}% progress`
              }
            >
              <i className="bi bi-bookmark-check-fill" />{' '}
              {chapters.length > 0
                ? currentChapterObj?.isIntro
                  ? 'Intro'
                  : `Ch. ${currentChapterObj?.order || activeChapterIndex}/${totalRegularChapters}`
                : `${readPercent}%`}
            </span>

            {/* Text-to-Speech (AI TTS) trigger */}
            <button
              aria-label={isTtsPlaying ? 'Pause reading aloud' : 'Read aloud with AI voice'}
              className={`ghost-button reader-bar-icon-btn reader-tts-trigger ${isTtsActive ? 'active' : ''}`}
              onClick={handleStartTts}
              title={isTtsActive ? (isTtsPlaying ? 'Reading aloud... Click to pause' : 'Reading aloud paused') : 'Read entire chapter aloud with AI voice (Web Speech)'}
              type="button"
            >
              <i className={`bi ${isTtsPlaying ? 'bi-volume-up-fill' : 'bi-volume-up'}`} />
              <span className="reader-btn-label">Read aloud</span>
            </button>

            {/* Appearance (Aa) Popover Trigger & Popover Menu */}
            <div className="reader-aa-wrap">
              <button
                aria-expanded={showAaPopover}
                aria-label="Reading appearance settings"
                className={`ghost-button reader-bar-icon-btn reader-aa-trigger ${showAaPopover ? 'active' : ''}`}
                onClick={() => setShowAaPopover((v) => !v)}
                title="Customize reading theme, font family, font size, and line spacing"
                type="button"
              >
                <i className="bi bi-fonts" />
                <span className="reader-btn-label">Aa</span>
              </button>

              {showAaPopover && (
                <div className="reader-aa-popover" role="dialog" aria-label="Reading appearance">
                  <div className="aa-popover-header">
                    <h4>Reading appearance</h4>
                    <button
                      aria-label="Close appearance settings"
                      className="ghost-button aa-close-btn"
                      onClick={() => setShowAaPopover(false)}
                      type="button"
                    >
                      <i className="bi bi-x-lg" />
                    </button>
                  </div>

                  {/* 1. Theme Color Swatches (Light, Sepia Warm Paper, Dark) */}
                  <div className="aa-section">
                    <label className="aa-section-label">Theme</label>
                    <div className="aa-theme-swatches" role="radiogroup" aria-label="Theme">
                      <button
                        aria-checked={theme === 'light'}
                        className={`aa-swatch aa-swatch-light ${theme === 'light' ? 'active' : ''}`}
                        onClick={() => setTheme('light')}
                        role="radio"
                        type="button"
                      >
                        <span className="swatch-circle" />
                        <span className="swatch-name">Light</span>
                      </button>
                      <button
                        aria-checked={theme === 'sepia'}
                        className={`aa-swatch aa-swatch-sepia ${theme === 'sepia' ? 'active' : ''}`}
                        onClick={() => setTheme('sepia')}
                        role="radio"
                        type="button"
                      >
                        <span className="swatch-circle" />
                        <span className="swatch-name">Sepia</span>
                      </button>
                      <button
                        aria-checked={theme === 'dark'}
                        className={`aa-swatch aa-swatch-dark ${theme === 'dark' ? 'active' : ''}`}
                        onClick={() => setTheme('dark')}
                        role="radio"
                        type="button"
                      >
                        <span className="swatch-circle" />
                        <span className="swatch-name">Dark</span>
                      </button>
                    </div>
                  </div>

                  {/* 2. Font Family */}
                  <div className="aa-section">
                    <label className="aa-section-label">Font family</label>
                    <div className="aa-segmented-group">
                      <button
                        className={`aa-segment-btn ${fontFamily === 'serif' ? 'active' : ''}`}
                        onClick={() => setFontFamily('serif')}
                        type="button"
                        style={{ fontFamily: "'Lora', Georgia, serif" }}
                      >
                        Serif
                      </button>
                      <button
                        className={`aa-segment-btn ${fontFamily === 'sans' ? 'active' : ''}`}
                        onClick={() => setFontFamily('sans')}
                        type="button"
                        style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}
                      >
                        Sans-serif
                      </button>
                    </div>
                  </div>

                  {/* 3. Font Size Slider */}
                  <div className="aa-section">
                    <div className="aa-section-row">
                      <label className="aa-section-label">Font size</label>
                      <span className="aa-value-badge">{fontSize}px</span>
                    </div>
                    <div className="aa-slider-row">
                      <button
                        aria-label="Decrease font size"
                        className="ghost-button aa-step-btn"
                        disabled={fontSize <= 14}
                        onClick={() => setFontSize((s) => Math.max(14, s - 1))}
                        type="button"
                      >
                        A-
                      </button>
                      <input
                        aria-label="Font size slider"
                        className="aa-range-slider"
                        max="26"
                        min="14"
                        onChange={(e) => setFontSize(Number(e.target.value))}
                        step="1"
                        type="range"
                        value={fontSize}
                      />
                      <button
                        aria-label="Increase font size"
                        className="ghost-button aa-step-btn"
                        disabled={fontSize >= 26}
                        onClick={() => setFontSize((s) => Math.min(26, s + 1))}
                        type="button"
                      >
                        A+
                      </button>
                    </div>
                  </div>

                  {/* 4. Line Spacing */}
                  <div className="aa-section">
                    <label className="aa-section-label">Line spacing</label>
                    <div className="aa-segmented-group">
                      <button
                        className={`aa-segment-btn ${lineHeight === 1.6 ? 'active' : ''}`}
                        onClick={() => setLineHeight(1.6)}
                        type="button"
                      >
                        Compact (1.6x)
                      </button>
                      <button
                        className={`aa-segment-btn ${lineHeight === 1.85 ? 'active' : ''}`}
                        onClick={() => setLineHeight(1.85)}
                        type="button"
                      >
                        Normal (1.85x)
                      </button>
                      <button
                        className={`aa-segment-btn ${lineHeight === 2.1 ? 'active' : ''}`}
                        onClick={() => setLineHeight(2.1)}
                        type="button"
                      >
                        Relaxed (2.1x)
                      </button>
                    </div>
                  </div>

                  {/* 5. Column Width */}
                  <div className="aa-section">
                    <label className="aa-section-label">Page width</label>
                    <div className="aa-segmented-group">
                      <button
                        className={`aa-segment-btn ${pageWidth === 760 ? 'active' : ''}`}
                        onClick={() => setPageWidth(760)}
                        type="button"
                      >
                        Compact (760px)
                      </button>
                      <button
                        className={`aa-segment-btn ${pageWidth === 920 ? 'active' : ''}`}
                        onClick={() => setPageWidth(920)}
                        type="button"
                      >
                        Standard (920px)
                      </button>
                      <button
                        className={`aa-segment-btn ${pageWidth === 1080 ? 'active' : ''}`}
                        onClick={() => setPageWidth(1080)}
                        type="button"
                      >
                        Wide (1080px)
                      </button>
                      <button
                        className={`aa-segment-btn ${pageWidth === 1260 ? 'active' : ''}`}
                        onClick={() => setPageWidth(1260)}
                        type="button"
                      >
                        Immersive (1260px)
                      </button>
                    </div>
                  </div>

                  {/* 6. Text Alignment */}
                  <div className="aa-section">
                    <label className="aa-section-label">Text alignment</label>
                    <div className="aa-segmented-group">
                      <button
                        className={`aa-segment-btn ${textAlign === 'justify' ? 'active' : ''}`}
                        onClick={() => setTextAlign('justify')}
                        type="button"
                      >
                        <i className="bi bi-justify" /> Justify
                      </button>
                      <button
                        className={`aa-segment-btn ${textAlign === 'left' ? 'active' : ''}`}
                        onClick={() => setTextAlign('left')}
                        type="button"
                      >
                        <i className="bi bi-text-left" /> Left
                      </button>
                    </div>
                  </div>

                  {/* Zen Mode Button */}
                  <div className="aa-section aa-zen-action">
                    <button
                      className="primary-button"
                      onClick={() => {
                        setZenMode((z) => !z)
                        setShowAaPopover(false)
                      }}
                      style={{ width: '100%', justifyContent: 'center' }}
                      type="button"
                    >
                      <i className={`bi ${zenMode ? 'bi-fullscreen-exit' : 'bi-arrows-fullscreen'}`} />
                      <span>{zenMode ? 'Exit Zen mode' : 'Zen mode (distraction-free)'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Zen Mode Toggle Button */}
            <button
              aria-label={zenMode ? 'Exit Zen mode' : 'Zen mode (distraction-free)'}
              className={`ghost-button reader-bar-icon-btn reader-zen-trigger ${zenMode ? 'active' : ''}`}
              onClick={() => setZenMode((v) => !v)}
              title={zenMode ? 'Exit Zen mode (Esc)' : 'Distraction-free reading (Zen mode)'}
              type="button"
            >
              <i className={`bi ${zenMode ? 'bi-fullscreen-exit' : 'bi-arrows-fullscreen'}`} />
              <span className="reader-btn-label">Zen</span>
            </button>
          </div>
        </div>
        <div className="reader-progress-line" aria-hidden="true">
          <div className="reader-progress-fill" style={{ width: `${readPercent}%` }} />
        </div>
      </header>

      {/* Reader Column Container */}
      <main className="content-reader-column" style={{ maxWidth: `${pageWidth}px`, width: '100%' }}>
        {/* Resume Banner */}
        {showResumeBanner && savedResume && (
          <aside aria-label="Continue reading" className="reader-resume-banner">
            <div className="reader-resume-banner-info">
              <div className="resume-icon-badge">
                <i className="bi bi-bookmark-check-fill" />
              </div>
              <div className="resume-text-details">
                <strong>Continue reading</strong>
                <p>
                  You were reading{' '}
                  <strong>
                    {savedResume.chapterTitle ||
                      (savedResume.chapterOrder === 0
                        ? 'Introduction'
                        : `Chapter ${savedResume.chapterOrder || (savedResume.chapterIndex != null ? savedResume.chapterIndex : 1)}`)}
                  </strong>
                  {savedResume.percent ? ` (${savedResume.percent}% progress)` : ''}
                </p>
              </div>
            </div>
            <div className="resume-banner-actions">
              <button className="primary-button" onClick={handleResume} type="button">
                <i className="bi bi-book-half" /> Resume reading
              </button>
              <button
                aria-label="Dismiss banner"
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
          <p className="reader-author-line">Author: <strong>{item.author || 'Unknown'}</strong></p>
          {item.description && <p className="reader-desc-line">{item.description}</p>}

          {/* Paired Audiobook Callout Banner */}
          {item.pairedContent && (
            <div className="reader-paired-callout">
              <div className="reader-paired-callout-text">
                <i className="bi bi-headphones" />
                <div>
                  <strong>Audiobook available</strong>
                  <p>Listen to the complete audio narration with synced chapters.</p>
                </div>
              </div>
              <button
                className="primary-button"
                onClick={() => navigateTo('listen', { query: `id=${item.pairedContent.id}` })}
                type="button"
              >
                <i className="bi bi-play-circle-fill" /> Listen now &rarr;
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

        {/* Reading Body Column */}
        <article
          className="content-reader-body-wrap"
          onMouseUp={handleTextSelection}
          onTouchEnd={handleTextSelection}
          style={{
            fontSize: `${fontSize}px`,
            lineHeight: lineHeight,
            textAlign: textAlign,
          }}
        >
          <MarginNotesReader
            activeChapterIndex={activeChapterIndex}
            chapters={chapters}
            contentId={item._id || id}
            onChapterChange={setActiveChapterIndex}
            onParagraphsLoaded={handleParagraphsLoaded}
            textAlign={textAlign}
            ttsActiveIndex={isTtsActive ? chapterStartParagraphIndex + ttsLocalIndex : null}
          />
        </article>

        {/* Floating Text Selection Quick Actions */}
        {selectionMenu && (
          <aside
            aria-label="Quick snippet actions"
            className="selection-action-tooltip"
            style={{ top: `${selectionMenu.top}px`, left: `${selectionMenu.left}px` }}
          >
            <button
              className="sel-tool-btn"
              onClick={handleSelHighlight}
              title="Highlight snippet"
              type="button"
            >
              <i className="bi bi-brush-fill" style={{ color: '#eab308' }} />
              <span>Highlight</span>
            </button>
            <button
              className="sel-tool-btn"
              onClick={handleSelNote}
              title="Add note for this section"
              type="button"
            >
              <i className="bi bi-chat-quote-fill" style={{ color: 'var(--app-accent, #16a09a)' }} />
              <span>Note</span>
            </button>
            <button
              className="sel-tool-btn"
              onClick={handleSelSpeak}
              title="Speak this selection"
              type="button"
            >
              <i className="bi bi-volume-up-fill" style={{ color: '#3b82f6' }} />
              <span>Speak</span>
            </button>
            <button
              className="sel-tool-btn"
              onClick={handleSelCopy}
              title="Copy snippet"
              type="button"
            >
              <i className="bi bi-clipboard-check" />
              <span>Copy</span>
            </button>
          </aside>
        )}

        {/* Floating TTS Player Dock */}
        {isTtsActive && (
          <aside aria-label="AI TTS reader" className="tts-player-dock">
            <div className="tts-dock-soundwave">
              <span className={`tts-wave-bar ${isTtsPlaying ? 'animating' : ''}`} />
              <span className={`tts-wave-bar ${isTtsPlaying ? 'animating' : ''}`} />
              <span className={`tts-wave-bar ${isTtsPlaying ? 'animating' : ''}`} />
            </div>
            <div className="tts-dock-info">
              <span className="tts-dock-title">
                {isTtsPlaying ? 'Reading aloud (AI TTS)...' : 'Paused'}
              </span>
              <small className="tts-dock-sub">
                Paragraph {ttsLocalIndex + 1} / {currentChapterParagraphs.length || 1} • {currentChapterObj?.isIntro ? 'Introduction' : `Chapter ${currentChapterObj?.order || activeChapterIndex}`}
              </small>
            </div>
            <div className="tts-dock-controls">
              <button
                aria-label="Previous paragraph"
                className="ghost-button tts-dock-btn"
                disabled={ttsLocalIndex <= 0}
                onClick={handleTtsPrev}
                title="Previous paragraph"
                type="button"
              >
                <i className="bi bi-skip-start-fill" />
              </button>
              <button
                aria-label={isTtsPlaying ? 'Pause reading aloud' : 'Resume reading aloud'}
                className="primary-button tts-dock-play-btn"
                onClick={handleTtsTogglePlay}
                title={isTtsPlaying ? 'Pause reading aloud' : 'Resume reading aloud'}
                type="button"
              >
                <i className={`bi ${isTtsPlaying ? 'bi-pause-fill' : 'bi-play-fill'}`} />
              </button>
              <button
                aria-label="Next paragraph"
                className="ghost-button tts-dock-btn"
                disabled={ttsLocalIndex >= currentChapterParagraphs.length - 1}
                onClick={handleTtsNext}
                title="Next paragraph"
                type="button"
              >
                <i className="bi bi-skip-end-fill" />
              </button>
              <button
                aria-label="Reading speed"
                className="ghost-button tts-dock-speed-btn"
                onClick={handleTtsCycleSpeed}
                title="Change reading speed"
                type="button"
              >
                {ttsSpeed}x
              </button>
              <button
                aria-label="Stop reading aloud"
                className="ghost-button tts-dock-close-btn"
                onClick={handleTtsStop}
                title="Close reader"
                type="button"
              >
                <i className="bi bi-x-lg" />
              </button>
            </div>
          </aside>
        )}

        {/* Modern Chapter Stepper Dock */}
        <section aria-label="Chapter navigation" className="reader-chapter-dock">
          {/* Main Stepper Navigation Row */}
          <div className="reader-chapter-stepper-row">
            <button
              aria-label="Previous chapter"
              className="reader-stepper-nav-btn"
              disabled={activeChapterIndex <= 0}
              onClick={() => jumpToChapter(activeChapterIndex - 1)}
              title={activeChapterIndex > 0 ? `Go to previous chapter (${chapters[activeChapterIndex - 1]?.title || 'Chapter ' + (activeChapterIndex)})` : 'First chapter reached'}
              type="button"
            >
              <i className="bi bi-chevron-left" />
              <span className="reader-stepper-btn-label">Prev</span>
            </button>

            <div className="reader-bottom-toc-wrap">
              <button
                aria-expanded={showToc && tocOrigin === 'bottom'}
                className="reader-chapter-dock-pill"
                onClick={() => handleToggleToc('bottom')}
                title="Browse full chapter list & bookmarks"
                type="button"
              >
                <i className="bi bi-grid-fill" />
                <span>
                  {currentChapterObj?.isIntro
                    ? 'Introduction'
                    : `Chapter ${currentChapterObj?.order || activeChapterIndex}`}
                </span>
                <span className="reader-chapter-dock-count">of {totalRegularChapters}</span>
                <i className="bi bi-chevron-expand" />
              </button>

              {showToc && tocOrigin === 'bottom' && (
                <ChapterTocPopover
                  activeChapterIndex={activeChapterIndex}
                  bookmarks={bookmarks}
                  chapters={chapters}
                  chaptersLoading={chaptersLoading}
                  filteredChapters={filteredChapters}
                  handleRemoveBookmark={handleRemoveBookmark}
                  jumpToChapter={jumpToChapter}
                  onClose={() => setShowToc(false)}
                  placement="bottom"
                  recentPreviousChapter={recentPreviousChapter}
                  setTocSearch={setTocSearch}
                  setTocTab={setTocTab}
                  tocSearch={tocSearch}
                  tocTab={tocTab}
                />
              )}
            </div>

            <button
              aria-label="Next chapter"
              className="reader-stepper-nav-btn"
              disabled={activeChapterIndex >= chapters.length - 1}
              onClick={() => jumpToChapter(activeChapterIndex + 1)}
              title={activeChapterIndex < chapters.length - 1 ? `Go to next chapter (${chapters[activeChapterIndex + 1]?.title || 'Chapter ' + (activeChapterIndex + 2)})` : 'Final chapter reached'}
              type="button"
            >
              <span className="reader-stepper-btn-label">Next</span>
              <i className="bi bi-chevron-right" />
            </button>
          </div>

          {/* Quick Chapter Scrubber Slider */}
          {chapters.length > 1 && (
            <div className="reader-chapter-scrubber-wrap">
              <input
                aria-label="Chapter progress scrubber"
                className="reader-chapter-scrubber-slider"
                max={Math.max(0, chapters.length - 1)}
                min="0"
                onChange={(e) => jumpToChapter(Number(e.target.value))}
                type="range"
                value={activeChapterIndex}
              />
              <div className="reader-scrubber-ticks">
                <span>Start</span>
                <span>{Math.round(((activeChapterIndex + 1) / (chapters.length || 1)) * 100)}% through book</span>
                <span>End</span>
              </div>
            </div>
          )}

          {/* Secondary Utilities Row */}
          <div className="reader-chapter-utilities-row">
            <button
              className="ghost-button reader-dock-utility-btn"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              type="button"
            >
              <i className="bi bi-arrow-up" /> Top
            </button>

            {recentPreviousChapter !== null && recentPreviousChapter !== activeChapterIndex && chapters[recentPreviousChapter] && (
              <button
                className="ghost-button reader-dock-utility-btn reader-dock-return-btn"
                onClick={() => jumpToChapter(recentPreviousChapter)}
                title="Return to recently viewed chapter"
                type="button"
              >
                <i className="bi bi-arrow-counterclockwise" /> Last visited: {chapters[recentPreviousChapter]?.isIntro ? 'Introduction' : `Chapter ${chapters[recentPreviousChapter]?.order || recentPreviousChapter}`}
              </button>
            )}

            {item.pairedContent && (
              <button
                className="secondary-button reader-dock-utility-btn"
                onClick={() => navigateTo('listen', { query: `id=${item.pairedContent.id}` })}
                type="button"
              >
                <i className="bi bi-headphones" /> Listen audiobook
              </button>
            )}
          </div>
        </section>

        {/* Comments Section (discrete in zen mode) */}
        {!zenMode && (
          <section style={{ marginTop: '48px' }}>
            <ContentComments contentId={item._id || item.id || id} />
          </section>
        )}
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

function ChapterTocPopover({
  chapters,
  filteredChapters,
  activeChapterIndex,
  recentPreviousChapter,
  bookmarks,
  tocTab,
  setTocTab,
  tocSearch,
  setTocSearch,
  chaptersLoading,
  jumpToChapter,
  handleRemoveBookmark,
  onClose,
  placement = 'top',
}) {
  return (
    <div
      className={`reader-toc-adjacent-popover placement-${placement}`}
      role="dialog"
      aria-label="Table of contents"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="reader-toc-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className="bi bi-journal-text" style={{ color: 'var(--app-accent)', fontSize: '1.25rem' }} />
          <h3>Table of contents</h3>
        </div>
        <button
          aria-label="Close table of contents"
          className="ghost-button aa-close-btn"
          onClick={onClose}
          type="button"
        >
          <i className="bi bi-x-lg" />
        </button>
      </div>

      {/* Tabs: Chapters vs Bookmarks */}
      <div className="reader-toc-tabs" role="tablist">
        <button
          aria-selected={tocTab === 'chapters'}
          className={`reader-toc-tab-btn ${tocTab === 'chapters' ? 'active' : ''}`}
          onClick={() => setTocTab('chapters')}
          role="tab"
          type="button"
        >
          <i className="bi bi-list-ol" /> Chapters ({chapters.length})
        </button>
        <button
          aria-selected={tocTab === 'bookmarks'}
          className={`reader-toc-tab-btn ${tocTab === 'bookmarks' ? 'active' : ''}`}
          onClick={() => setTocTab('bookmarks')}
          role="tab"
          type="button"
        >
          <i className="bi bi-bookmarks-fill" /> Bookmarks ({bookmarks.length})
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
                    <small>Recently viewed:</small>
                    <strong>
                      {chapters[recentPreviousChapter].isIntro
                        ? 'Introduction'
                        : chapters[recentPreviousChapter].title || `Chapter ${chapters[recentPreviousChapter].order || recentPreviousChapter}`}
                    </strong>
                  </div>
                </div>
                <button
                  className="primary-button toc-quick-return-btn"
                  onClick={() => jumpToChapter(recentPreviousChapter)}
                  type="button"
                >
                  <i className="bi bi-arrow-return-left" /> Return to chapter
                </button>
              </div>
            )}

          {chapters.length > 5 && (
            <div className="reader-toc-search-wrap">
              <i className="bi bi-search" />
              <input
                aria-label="Search chapters"
                className="reader-toc-search-input"
                onChange={(e) => setTocSearch(e.target.value)}
                placeholder="Search chapter title or number..."
                type="search"
                value={tocSearch}
              />
              {tocSearch && (
                <button
                  aria-label="Clear search"
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
              <p className="settings-copy"><span className="admin-spin-small" /> Loading chapter list...</p>
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
                        <i className="bi bi-journal-bookmark" title="Introduction" />
                      ) : (
                        ch.order || realIdx
                      )}
                    </span>
                    <div className="toc-item-info">
                      <div className="toc-item-title-row">
                        <strong>
                          {ch.isIntro || ch.order === 0
                            ? ch.title || 'Introduction'
                            : ch.title || `Chapter ${ch.order || realIdx}`}
                        </strong>
                        <div className="toc-item-tags">
                          {isActive && <span className="toc-status-badge current">Current</span>}
                          {isRecent && !isActive && <span className="toc-status-badge recent">Recent</span>}
                          {isBookmarked && <i className="bi bi-bookmark-fill toc-bookmark-icon" title="Bookmarked" />}
                        </div>
                      </div>
                      {ch.excerpt && <small>{ch.excerpt}</small>}
                    </div>
                    <i className="bi bi-chevron-right" />
                  </button>
                )
              })
            ) : (
              <p className="empty-state">No matching chapters found.</p>
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
                    <strong>{bm.chapterTitle || `Chapter ${bm.chapterOrder || bm.chapterIndex}`}</strong>
                  </div>
                  <span className="reader-bookmark-item-time">
                    <i className="bi bi-clock" /> {new Date(bm.timestamp).toLocaleDateString('en-US')} {new Date(bm.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="reader-bookmark-actions">
                  <button
                    className="primary-button reader-bookmark-jump-btn"
                    onClick={() => jumpToChapter(bm.chapterIndex)}
                    type="button"
                  >
                    <i className="bi bi-arrow-right-circle" /> Read
                  </button>
                  <button
                    aria-label="Delete bookmark"
                    className="ghost-button reader-bookmark-del-btn"
                    onClick={(e) => handleRemoveBookmark(bm.id, e)}
                    title="Delete bookmark"
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
              <p>No bookmarks saved yet.</p>
              <small>Click the <strong>[Bookmark]</strong> button in the reading bar to save quick positions you want to return to!</small>
            </div>
          )}
        </div>
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
