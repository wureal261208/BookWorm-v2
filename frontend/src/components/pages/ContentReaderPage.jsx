import { useCallback, useEffect, useRef, useState } from 'react'
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

  // Reader customization states (Light, Sepia Warm Paper, Dark)
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('bookworm_reader_theme')
    return saved === 'dark' || saved === 'sepia' ? saved : 'light'
  })
  const [fontSize, setFontSize] = useState(() => Number(localStorage.getItem('bookworm_reader_fontsize')) || 18)
  const [fontFamily, setFontFamily] = useState(() => localStorage.getItem('bookworm_reader_font') || 'serif')
  const [lineHeight, setLineHeight] = useState(() => Number(localStorage.getItem('bookworm_reader_lineheight')) || 1.85)
  const [pageWidth, setPageWidth] = useState(() => Number(localStorage.getItem('bookworm_reader_width')) || 760)
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
      if (showAaPopover && !e.target.closest('.reader-aa-popover') && !e.target.closest('.reader-aa-trigger')) {
        setShowAaPopover(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showAaPopover])

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
        setToastMsg('Trình duyệt không hỗ trợ Web Speech API đọc to.')
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
          setToastMsg('Đã hoàn thành đọc to chương này.')
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
      setToastMsg('Đang chuẩn bị nội dung đọc...')
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
    setToastMsg('Bắt đầu đọc to chương này bằng giọng AI...')
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
    setToastMsg('Đã dừng đọc to.')
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
    setToastMsg('Đã làm nổi bật đoạn trích!')
    setSelectionMenu(null)
    window.getSelection()?.removeAllRanges()
  }

  function handleSelNote() {
    setToastMsg('Bấm biểu tượng ghi chú 💬 bên cạnh đoạn văn để lưu ghi chú.')
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
      setToastMsg('Đang đọc câu vừa chọn...')
    }
    setSelectionMenu(null)
  }

  function handleSelCopy() {
    if (!selectionMenu?.text) return
    navigator.clipboard
      ?.writeText(selectionMenu.text)
      .then(() => {
        setToastMsg('Đã sao chép đoạn trích vào bộ nhớ tạm!')
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
    <div className={`content-reader-page reader-theme-${theme} reader-font-${fontFamily} ${zenMode ? 'reader-zen-active' : ''}`}>
      {/* Floating Zen Pill when in Zen distraction-free mode */}
      {zenMode && (
        <aside aria-label="Điều khiển chế độ tập trung" className="reader-zen-floating-pill">
          <button
            className="ghost-button zen-pill-exit"
            onClick={() => setZenMode(false)}
            title="Thoát chế độ tập trung (Esc)"
            type="button"
          >
            <i className="bi bi-x-lg" />
            <span>Thoát Zen (Esc)</span>
          </button>
          <div className="zen-pill-divider" />
          <button
            className="ghost-button zen-pill-btn"
            onClick={() => setShowAaPopover((v) => !v)}
            title="Tuỳ chỉnh giao diện"
            type="button"
          >
            <i className="bi bi-fonts" />
          </button>
          <button
            className="ghost-button zen-pill-btn"
            onClick={() => setShowToc((v) => !v)}
            title="Mục lục chương"
            type="button"
          >
            <i className="bi bi-list-ul" />
          </button>
          <span className="zen-pill-progress">{readPercent}%</span>
        </aside>
      )}

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

            {/* Text-to-Speech (AI TTS) trigger */}
            <button
              aria-label={isTtsPlaying ? 'Tạm dừng đọc to' : 'Đọc to bằng giọng AI'}
              className={`ghost-button reader-bar-icon-btn reader-tts-trigger ${isTtsActive ? 'active' : ''}`}
              onClick={handleStartTts}
              title={isTtsActive ? (isTtsPlaying ? 'Đang đọc to... Bấm để tạm dừng' : 'Đang tạm dừng đọc to') : 'Đọc to toàn bộ chương bằng giọng đọc AI (Web Speech)'}
              type="button"
            >
              <i className={`bi ${isTtsPlaying ? 'bi-volume-up-fill' : 'bi-volume-up'}`} />
              <span className="reader-btn-label">Đọc to</span>
            </button>

            {/* Appearance (Aa) Popover Trigger & Popover Menu */}
            <div className="reader-aa-wrap">
              <button
                aria-expanded={showAaPopover}
                aria-label="Cài đặt giao diện đọc"
                className={`ghost-button reader-bar-icon-btn reader-aa-trigger ${showAaPopover ? 'active' : ''}`}
                onClick={() => setShowAaPopover((v) => !v)}
                title="Tuỳ chỉnh giao diện, phông chữ, cỡ chữ, màu nền & giãn dòng"
                type="button"
              >
                <i className="bi bi-fonts" />
                <span className="reader-btn-label">Aa</span>
              </button>

              {showAaPopover && (
                <div className="reader-aa-popover" role="dialog" aria-label="Tuỳ chỉnh giao diện đọc">
                  <div className="aa-popover-header">
                    <h4>Giao diện đọc sách</h4>
                    <button
                      aria-label="Đóng bảng giao diện"
                      className="ghost-button aa-close-btn"
                      onClick={() => setShowAaPopover(false)}
                      type="button"
                    >
                      <i className="bi bi-x-lg" />
                    </button>
                  </div>

                  {/* 1. Theme Color Swatches (Light, Sepia Warm Paper, Dark) */}
                  <div className="aa-section">
                    <label className="aa-section-label">Chủ đề màu (Theme)</label>
                    <div className="aa-theme-swatches" role="radiogroup" aria-label="Chủ đề màu">
                      <button
                        aria-checked={theme === 'light'}
                        className={`aa-swatch aa-swatch-light ${theme === 'light' ? 'active' : ''}`}
                        onClick={() => setTheme('light')}
                        role="radio"
                        type="button"
                      >
                        <span className="swatch-circle" />
                        <span className="swatch-name">Sáng</span>
                      </button>
                      <button
                        aria-checked={theme === 'sepia'}
                        className={`aa-swatch aa-swatch-sepia ${theme === 'sepia' ? 'active' : ''}`}
                        onClick={() => setTheme('sepia')}
                        role="radio"
                        type="button"
                      >
                        <span className="swatch-circle" />
                        <span className="swatch-name">Giấy ngà</span>
                      </button>
                      <button
                        aria-checked={theme === 'dark'}
                        className={`aa-swatch aa-swatch-dark ${theme === 'dark' ? 'active' : ''}`}
                        onClick={() => setTheme('dark')}
                        role="radio"
                        type="button"
                      >
                        <span className="swatch-circle" />
                        <span className="swatch-name">Đêm</span>
                      </button>
                    </div>
                  </div>

                  {/* 2. Font Family */}
                  <div className="aa-section">
                    <label className="aa-section-label">Kiểu chữ (Font)</label>
                    <div className="aa-segmented-group">
                      <button
                        className={`aa-segment-btn ${fontFamily === 'serif' ? 'active' : ''}`}
                        onClick={() => setFontFamily('serif')}
                        type="button"
                        style={{ fontFamily: "'Lora', Georgia, serif" }}
                      >
                        Có chân (Serif)
                      </button>
                      <button
                        className={`aa-segment-btn ${fontFamily === 'sans' ? 'active' : ''}`}
                        onClick={() => setFontFamily('sans')}
                        type="button"
                        style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}
                      >
                        Không chân (Sans)
                      </button>
                    </div>
                  </div>

                  {/* 3. Font Size Slider */}
                  <div className="aa-section">
                    <div className="aa-section-row">
                      <label className="aa-section-label">Cỡ chữ</label>
                      <span className="aa-value-badge">{fontSize}px</span>
                    </div>
                    <div className="aa-slider-row">
                      <button
                        aria-label="Giảm cỡ chữ"
                        className="ghost-button aa-step-btn"
                        disabled={fontSize <= 14}
                        onClick={() => setFontSize((s) => Math.max(14, s - 1))}
                        type="button"
                      >
                        A-
                      </button>
                      <input
                        aria-label="Thanh trượt cỡ chữ"
                        className="aa-range-slider"
                        max="26"
                        min="14"
                        onChange={(e) => setFontSize(Number(e.target.value))}
                        step="1"
                        type="range"
                        value={fontSize}
                      />
                      <button
                        aria-label="Tăng cỡ chữ"
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
                    <label className="aa-section-label">Giãn dòng</label>
                    <div className="aa-segmented-group">
                      <button
                        className={`aa-segment-btn ${lineHeight === 1.6 ? 'active' : ''}`}
                        onClick={() => setLineHeight(1.6)}
                        type="button"
                      >
                        Gọn (1.6x)
                      </button>
                      <button
                        className={`aa-segment-btn ${lineHeight === 1.85 ? 'active' : ''}`}
                        onClick={() => setLineHeight(1.85)}
                        type="button"
                      >
                        Chuẩn (1.85x)
                      </button>
                      <button
                        className={`aa-segment-btn ${lineHeight === 2.1 ? 'active' : ''}`}
                        onClick={() => setLineHeight(2.1)}
                        type="button"
                      >
                        Thoáng (2.1x)
                      </button>
                    </div>
                  </div>

                  {/* 5. Column Width */}
                  <div className="aa-section">
                    <label className="aa-section-label">Độ rộng trang</label>
                    <div className="aa-segmented-group">
                      <button
                        className={`aa-segment-btn ${pageWidth === 640 ? 'active' : ''}`}
                        onClick={() => setPageWidth(640)}
                        type="button"
                      >
                        Hẹp (640px)
                      </button>
                      <button
                        className={`aa-segment-btn ${pageWidth === 760 ? 'active' : ''}`}
                        onClick={() => setPageWidth(760)}
                        type="button"
                      >
                        Vừa (760px)
                      </button>
                      <button
                        className={`aa-segment-btn ${pageWidth === 880 ? 'active' : ''}`}
                        onClick={() => setPageWidth(880)}
                        type="button"
                      >
                        Rộng (880px)
                      </button>
                    </div>
                  </div>

                  {/* 6. Text Alignment */}
                  <div className="aa-section">
                    <label className="aa-section-label">Căn lề</label>
                    <div className="aa-segmented-group">
                      <button
                        className={`aa-segment-btn ${textAlign === 'justify' ? 'active' : ''}`}
                        onClick={() => setTextAlign('justify')}
                        type="button"
                      >
                        <i className="bi bi-justify" /> Căn đều
                      </button>
                      <button
                        className={`aa-segment-btn ${textAlign === 'left' ? 'active' : ''}`}
                        onClick={() => setTextAlign('left')}
                        type="button"
                      >
                        <i className="bi bi-text-left" /> Căn trái
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
                      <span>{zenMode ? 'Thoát Zen Mode' : 'Đọc tập trung (Zen Mode)'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Zen Mode Toggle Button */}
            <button
              aria-label={zenMode ? 'Thoát chế độ tập trung' : 'Chế độ đọc tập trung (Zen Mode)'}
              className={`ghost-button reader-bar-icon-btn reader-zen-trigger ${zenMode ? 'active' : ''}`}
              onClick={() => setZenMode((v) => !v)}
              title={zenMode ? 'Thoát Zen Mode (Esc)' : 'Đọc tập trung không xao nhãng (Zen Mode)'}
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
      <main className="content-reader-column" style={{ maxWidth: `${pageWidth}px` }}>
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
            aria-label="Thao tác nhanh cho đoạn trích"
            className="selection-action-tooltip"
            style={{ top: `${selectionMenu.top}px`, left: `${selectionMenu.left}px` }}
          >
            <button
              className="sel-tool-btn"
              onClick={handleSelHighlight}
              title="Tô màu làm nổi bật"
              type="button"
            >
              <i className="bi bi-brush-fill" style={{ color: '#eab308' }} />
              <span>Nổi bật</span>
            </button>
            <button
              className="sel-tool-btn"
              onClick={handleSelNote}
              title="Ghi chú đoạn này"
              type="button"
            >
              <i className="bi bi-chat-quote-fill" style={{ color: 'var(--app-accent, #16a09a)' }} />
              <span>Ghi chú</span>
            </button>
            <button
              className="sel-tool-btn"
              onClick={handleSelSpeak}
              title="Đọc to câu này"
              type="button"
            >
              <i className="bi bi-volume-up-fill" style={{ color: '#3b82f6' }} />
              <span>Đọc to</span>
            </button>
            <button
              className="sel-tool-btn"
              onClick={handleSelCopy}
              title="Sao chép đoạn trích"
              type="button"
            >
              <i className="bi bi-clipboard-check" />
              <span>Sao chép</span>
            </button>
          </aside>
        )}

        {/* Floating TTS Player Dock */}
        {isTtsActive && (
          <aside aria-label="Trình đọc sách AI TTS" className="tts-player-dock">
            <div className="tts-dock-soundwave">
              <span className={`tts-wave-bar ${isTtsPlaying ? 'animating' : ''}`} />
              <span className={`tts-wave-bar ${isTtsPlaying ? 'animating' : ''}`} />
              <span className={`tts-wave-bar ${isTtsPlaying ? 'animating' : ''}`} />
            </div>
            <div className="tts-dock-info">
              <span className="tts-dock-title">
                {isTtsPlaying ? 'Đang đọc to (AI TTS)...' : 'Đã tạm dừng'}
              </span>
              <small className="tts-dock-sub">
                Đoạn {ttsLocalIndex + 1} / {currentChapterParagraphs.length || 1} • {currentChapterObj?.isIntro ? 'Mở đầu' : `Chương ${currentChapterObj?.order || activeChapterIndex}`}
              </small>
            </div>
            <div className="tts-dock-controls">
              <button
                aria-label="Đoạn trước"
                className="ghost-button tts-dock-btn"
                disabled={ttsLocalIndex <= 0}
                onClick={handleTtsPrev}
                title="Đoạn trước"
                type="button"
              >
                <i className="bi bi-skip-start-fill" />
              </button>
              <button
                aria-label={isTtsPlaying ? 'Tạm dừng đọc' : 'Tiếp tục đọc'}
                className="primary-button tts-dock-play-btn"
                onClick={handleTtsTogglePlay}
                title={isTtsPlaying ? 'Tạm dừng đọc to' : 'Tiếp tục đọc to'}
                type="button"
              >
                <i className={`bi ${isTtsPlaying ? 'bi-pause-fill' : 'bi-play-fill'}`} />
              </button>
              <button
                aria-label="Đoạn sau"
                className="ghost-button tts-dock-btn"
                disabled={ttsLocalIndex >= currentChapterParagraphs.length - 1}
                onClick={handleTtsNext}
                title="Đoạn sau"
                type="button"
              >
                <i className="bi bi-skip-end-fill" />
              </button>
              <button
                aria-label="Tốc độ đọc"
                className="ghost-button tts-dock-speed-btn"
                onClick={handleTtsCycleSpeed}
                title="Chỉnh tốc độ đọc"
                type="button"
              >
                {ttsSpeed}x
              </button>
              <button
                aria-label="Dừng và đóng trình đọc"
                className="ghost-button tts-dock-close-btn"
                onClick={handleTtsStop}
                title="Đóng trình đọc"
                type="button"
              >
                <i className="bi bi-x-lg" />
              </button>
            </div>
          </aside>
        )}

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
