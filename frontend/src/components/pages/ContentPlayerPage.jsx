import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { auth } from '../../features/auth-firebase/firebaseConfig'
import { apiFetch, publicApiFetch } from '../../utils/apiClient'
import { useNavigation } from '../../context/NavigationContext'
import { useAudioPlayer } from '../../context/AudioPlayerContext'
import { getCover } from '../../utils/bookUtils'
import ContentComments from '../content/ContentComments'

function formatTime(seconds) {
  if (!seconds || Number.isNaN(seconds) || seconds < 0) return '00:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)

  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 2]

function ContentPlayerPage() {
  const { navigateTo } = useNavigation()
  const [searchParams] = useSearchParams()
  const id = searchParams.get('id')

  const [item, setItem] = useState(null)
  const [pageChapters, setPageChapters] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [readAlongText, setReadAlongText] = useState([])
  const [readAlongLoading, setReadAlongLoading] = useState(false)
  const [showReadAlong, setShowReadAlong] = useState(true)
  const [readAlongFontSize, setReadAlongFontSize] = useState(16)

  const {
    audioItem,
    currentChapterIndex,
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    isBuffering,
    sleepTimerRemaining,
    sleepTimerOption,
    loadAudiobook,
    togglePlay,
    seek,
    skip,
    setChapter,
    nextChapter,
    prevChapter,
    setPlaybackRate,
    setSleepTimer,
  } = useAudioPlayer()

  const [savedResume, setSavedResume] = useState(null)
  const [showResumeBanner, setShowResumeBanner] = useState(false)

  // Restore saved audio progress for Continue Listening banner
  useEffect(() => {
    if (!id) return
    try {
      const raw = localStorage.getItem(`bookworm_audio_progress_${id}`)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && (parsed.currentTime > 5 || parsed.chapterIndex > 0)) {
          setSavedResume(parsed)
          setShowResumeBanner(true)
        }
      }
    } catch (_) {}
  }, [id])

  function handleResumeListening() {
    if (!savedResume || !item) return
    const chList = pageChapters.length > 0 ? pageChapters : activeChapters
    const targetCh = typeof savedResume.chapterIndex === 'number' && chList[savedResume.chapterIndex]
      ? savedResume.chapterIndex
      : 0
    const targetTime = typeof savedResume.currentTime === 'number' ? savedResume.currentTime : 0

    loadAudiobook(item, chList, targetCh, targetTime, true)
    setShowResumeBanner(false)
  }

  const isCurrentTrackLoaded = audioItem && (audioItem._id === id || audioItem.id === id)

  useEffect(() => {
    if (!id) return
    let ignore = false
    setLoading(true)
    setError('')

    // 1. Fetch item details immediately (renders within milliseconds)
    publicApiFetch(`/api/content/${id}`)
      .then((itemData) => {
        if (ignore) return
        setItem(itemData)
        setLoading(false)

        if (auth.currentUser && itemData.categories?.length) {
          apiFetch('/api/users/me/engagement', { method: 'POST', body: { categories: itemData.categories } }).catch(() => {})
        }

        // If itemData already has direct mp3 files, construct immediate provisional chapters
        const directMp3s = (itemData.files || []).filter((f) => f && f.format === 'mp3')
        if (directMp3s.length > 0) {
          const provisional = directMp3s.map((f, i) => ({
            order: i + 1,
            title: directMp3s.length === 1 ? (itemData.title || 'Full Audiobook') : `Part ${i + 1}`,
            url: f.url,
            duration: '',
          }))
          setPageChapters((prev) => (prev.length === 0 ? provisional : prev))
          if (!isCurrentTrackLoaded) {
            loadAudiobook(itemData, provisional, 0, 0, false)
          }
        }
      })
      .catch((err) => {
        if (!ignore) {
          setError(err.message)
          setLoading(false)
        }
      })

    // 2. Fetch full chapter list independently without blocking hero render
    publicApiFetch(`/api/content/${id}/chapters`)
      .then((chaptersData) => {
        if (ignore) return
        const chList = Array.isArray(chaptersData?.chapters) ? chaptersData.chapters : []
        if (chList.length > 0) {
          setPageChapters(chList)
          if (!isCurrentTrackLoaded) {
            setItem((current) => {
              if (current) {
                loadAudiobook(current, chList, 0, 0, false)
              }
              return current
            })
          }
        }
      })
      .catch(() => {})

    // 3. Fetch synchronized story text for Read-Along progressively
    setReadAlongLoading(true)
    publicApiFetch(`/api/content/${id}/text`)
      .then((tData) => {
        if (!ignore && Array.isArray(tData?.paragraphs)) {
          setReadAlongText(tData.paragraphs)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!ignore) setReadAlongLoading(false)
      })

    return () => {
      ignore = true
    }
  }, [id])

  const activeChapters = isCurrentTrackLoaded && pageChapters.length === 0 ? [] : pageChapters
  const currentChapter = activeChapters[currentChapterIndex] || activeChapters[0] || null

  function handlePlayClick() {
    if (!isCurrentTrackLoaded && activeChapters.length > 0) {
      loadAudiobook(item, activeChapters, currentChapterIndex || 0, currentTime || 0, true)
    } else {
      togglePlay()
    }
  }

  const currentChapterParagraphs = useMemo(() => {
    if (!readAlongText.length) return []
    const safeIdx = Math.min(Math.max(0, currentChapterIndex), Math.max(0, activeChapters.length - 1))
    const currentCh = activeChapters[safeIdx]
    const nextCh = activeChapters[safeIdx + 1]

    if (typeof currentCh?.startParagraph === 'number') {
      const start = currentCh.startParagraph
      const end = typeof nextCh?.startParagraph === 'number' && nextCh.startParagraph > start
        ? nextCh.startParagraph
        : Math.min(start + 35, readAlongText.length)
      return readAlongText.slice(start, end).slice(0, 45)
    }

    if (activeChapters.length > 1) {
      const perCh = Math.max(15, Math.floor(readAlongText.length / activeChapters.length))
      const start = safeIdx * perCh
      const end = safeIdx === activeChapters.length - 1 ? readAlongText.length : (safeIdx + 1) * perCh
      return readAlongText.slice(start, end).slice(0, 45)
    }

    return readAlongText.slice(0, 40)
  }, [readAlongText, activeChapters, currentChapterIndex])

  if (!id) return <p className="admin-validation-error"><i className="bi bi-x-circle" /> No audiobook selected.</p>
  if (loading && !item) {
    return <ContentPlayerSkeleton />
  }
  if (error || !item) {
    return <p className="admin-validation-error"><i className="bi bi-x-circle" /> {error || 'Audiobook not found.'}</p>
  }

  return (
    <div className="content-player-page">
      <nav aria-label="Audiobook navigation" style={{ marginBottom: '16px' }}>
        <button className="ghost-button" onClick={() => navigateTo('detail', { query: `id=${id}` })} type="button">
          <i className="bi bi-arrow-left" style={{ marginRight: '6px' }} /> Back to details
        </button>
      </nav>

      {/* Continue Listening / Resume Audio Banner */}
      {showResumeBanner && savedResume && (
        <aside aria-label="Tiếp tục nghe sách" className="audio-resume-banner">
          <div className="audio-resume-banner-info">
            <div className="resume-icon-badge">
              <i className="bi bi-soundwave" />
            </div>
            <div className="resume-text-details">
              <strong>Tiếp tục nghe từ lần trước (Continue Listening)</strong>
              <p>
                Bạn đang nghe dở{' '}
                <strong>
                  {pageChapters[savedResume.chapterIndex]?.title
                    ? `Chương ${savedResume.chapterIndex + 1}: ${pageChapters[savedResume.chapterIndex].title}`
                    : `Chương ${savedResume.chapterIndex + 1}`}
                </strong>{' '}
                tại <strong>{formatTime(savedResume.currentTime)}</strong>
              </p>
            </div>
          </div>
          <div className="resume-banner-actions">
            <button className="primary-button" onClick={handleResumeListening} type="button">
              <i className="bi bi-play-circle-fill" /> Tiếp tục nghe ({formatTime(savedResume.currentTime)})
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

      <section className="content-player-hero">
        <div className="player-hero-cover-wrap">
          <img alt={`${item.title} audiobook cover`} className="player-hero-cover" src={getCover(item)} />
        </div>

        <div className="player-hero-info">
          <p className="mono-eyebrow">{item.source || 'Audiobook'}</p>
          <h1 className="player-hero-title">{item.title}</h1>
          <p className="player-hero-author">By <strong>{item.author || 'Unknown'}</strong></p>

          {item.pairedContent && (
            <div className="player-paired-ebook-banner">
              <div className="player-paired-ebook-info">
                <i className="bi bi-book-half" />
                <div>
                  <strong>Prefer reading text?</strong>
                  <p>Ebook edition with adjustable typography and margin notes is available.</p>
                </div>
              </div>
              <button
                className="ghost-button player-paired-read-btn"
                onClick={() => navigateTo('read', { query: `id=${item.pairedContent.id}` })}
                type="button"
              >
                <i className="bi bi-journal-text" /> Read Ebook &rarr;
              </button>
            </div>
          )}

          {item.description && (
            <p className="player-hero-desc">{item.description}</p>
          )}

          {/* Active Chapter Card & Playback Controls */}
          {currentChapter ? (
            <div className="player-main-controls-card">
              <div className="player-active-chapter-header">
                <div className="player-chapter-title-box">
                  <span className="mono-eyebrow">Now playing</span>
                  <h3>{currentChapter.title}</h3>
                </div>

                <div className="player-header-aux-controls">
                  {/* Speed pills */}
                  <div className="player-speed-pill-group" role="group" aria-label="Playback speed">
                    {SPEED_OPTIONS.map((rate) => (
                      <button
                        className={`player-speed-pill ${playbackRate === rate ? 'active' : ''}`}
                        key={rate}
                        onClick={() => setPlaybackRate(rate)}
                        type="button"
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>

                  {/* Sleep Timer */}
                  <div className="player-sleep-timer-wrap">
                    <label className="player-sleep-label" htmlFor="sleep-timer-select">
                      <i className="bi bi-moon-stars" />
                    </label>
                    <select
                      id="sleep-timer-select"
                      aria-label="Sleep timer"
                      className="player-sleep-select"
                      onChange={(e) => setSleepTimer(e.target.value || null)}
                      value={sleepTimerOption || ''}
                    >
                      <option value="">Timer: Off</option>
                      <option value="15">15 mins</option>
                      <option value="30">30 mins</option>
                      <option value="45">45 mins</option>
                      <option value="60">60 mins</option>
                      <option value="end_chapter">End of chapter</option>
                    </select>
                    {sleepTimerRemaining !== null && (
                      <span className="player-sleep-countdown" title="Sleep timer active">
                        {formatTime(sleepTimerRemaining)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Scrubber slider */}
              <div className="player-scrubber-row">
                <span className="scrubber-time">{formatTime(currentTime)}</span>
                <input
                  aria-label="Seek audio track position"
                  className="mini-player-slider"
                  max={duration || 100}
                  min="0"
                  onChange={(e) => seek(Number(e.target.value))}
                  step="1"
                  type="range"
                  value={currentTime || 0}
                />
                <span className="scrubber-time">{formatTime(duration)}</span>
              </div>

              {/* Main buttons: Prev, Rewind 15s, Play 56px, Forward 15s, Next */}
              <div className="player-controls-row">
                <button
                  aria-label="Previous chapter"
                  className="ghost-button player-btn-ch"
                  disabled={!isCurrentTrackLoaded || currentChapterIndex <= 0}
                  onClick={prevChapter}
                  title="Previous chapter"
                  type="button"
                >
                  <i className="bi bi-skip-backward-fill" />
                </button>

                <button
                  aria-label="Rewind 15 seconds"
                  className="ghost-button player-btn-skip"
                  onClick={() => skip(-15)}
                  title="Rewind 15s"
                  type="button"
                >
                  <i className="bi bi-arrow-counterclockwise" /> -15s
                </button>

                <button
                  aria-label={isPlaying ? 'Pause playback' : 'Start playback'}
                  className="player-btn-play-round"
                  onClick={handlePlayClick}
                  type="button"
                >
                  {isBuffering ? (
                    <span className="spinner-border spinner-border-sm" role="status" />
                  ) : isPlaying ? (
                    <i className="bi bi-pause-fill" />
                  ) : (
                    <i className="bi bi-play-fill" />
                  )}
                </button>

                <button
                  aria-label="Forward 15 seconds"
                  className="ghost-button player-btn-skip"
                  onClick={() => skip(15)}
                  title="Forward 15s"
                  type="button"
                >
                  <i className="bi bi-arrow-clockwise" /> +15s
                </button>

                <button
                  aria-label="Next chapter"
                  className="ghost-button player-btn-ch"
                  disabled={!isCurrentTrackLoaded || currentChapterIndex >= activeChapters.length - 1}
                  onClick={nextChapter}
                  title="Next chapter"
                  type="button"
                >
                  <i className="bi bi-skip-forward-fill" />
                </button>
              </div>
            </div>
          ) : (
            <p className="empty-state">No playable chapters found for this audiobook yet.</p>
          )}
        </div>
      </section>

      {/* Read-Along Subtitles / Synchronized Story Text */}
      <section className="player-readalong-card">
        <div className="player-readalong-header">
          <div className="player-readalong-title-group">
            <span className="mono-eyebrow">
              <i className="bi bi-body-text" style={{ marginRight: '6px' }} />
              Read-Along Companion
            </span>
            <h3>
              {currentChapter ? currentChapter.title : 'Story Transcript'}
            </h3>
          </div>

          <div className="player-readalong-controls">
            <div className="reader-btn-group" role="group" aria-label="Subtitle font size">
              <button
                className="ghost-button"
                disabled={readAlongFontSize <= 14}
                onClick={() => setReadAlongFontSize((s) => Math.max(14, s - 2))}
                title="Smaller text"
                type="button"
              >
                A-
              </button>
              <button
                className="ghost-button"
                disabled={readAlongFontSize >= 22}
                onClick={() => setReadAlongFontSize((s) => Math.min(22, s + 2))}
                title="Larger text"
                type="button"
              >
                A+
              </button>
            </div>

            <button
              className={`ghost-button player-readalong-toggle ${showReadAlong ? 'active' : ''}`}
              onClick={() => setShowReadAlong((v) => !v)}
              title="Toggle subtitles view"
              type="button"
            >
              <i className={`bi ${showReadAlong ? 'bi-eye-fill' : 'bi-eye-slash-fill'}`} />
              <span>{showReadAlong ? 'Hide text' : 'Show text'}</span>
            </button>
          </div>
        </div>

        {showReadAlong && (
          <div className="player-readalong-body" style={{ fontSize: `${readAlongFontSize}px` }}>
            {readAlongLoading ? (
              <p className="inline-loading">
                <span className="admin-spin-small" /> Loading synchronized story text...
              </p>
            ) : currentChapterParagraphs.length > 0 ? (
              <div className="player-readalong-paragraphs">
                {currentChapterParagraphs.map((para, pIdx) => (
                  <p key={pIdx} className="player-readalong-para">
                    {para}
                  </p>
                ))}
              </div>
            ) : (
              <div className="player-readalong-empty">
                <i className="bi bi-headphones" style={{ fontSize: '1.8rem', color: 'var(--app-muted)' }} />
                <p>
                  Full synchronized transcript is not available for this recording. Enjoy the narration by listening to <strong>{currentChapter?.title || item.title}</strong>!
                </p>
                {item.pairedContent && (
                  <button
                    className="primary-button"
                    onClick={() => navigateTo('read', { query: `id=${item.pairedContent.id}` })}
                    style={{ marginTop: '10px' }}
                    type="button"
                  >
                    <i className="bi bi-journal-text" /> Read full Ebook text
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Chapter List */}
      {activeChapters.length > 0 && (
        <section className="player-chapters-section">
          <div className="section-heading">
            <div>
              <p className="mono-eyebrow">Playlist</p>
              <h2>Chapters ({activeChapters.length})</h2>
            </div>
            <span>Click any chapter to listen. Playback continues even when browsing other pages.</span>
          </div>

          <ol className="content-player-chapter-list">
            {activeChapters.map((chapter, index) => {
              const isSelected = isCurrentTrackLoaded && index === currentChapterIndex
              return (
                <li key={chapter.url || `ch-${index}`}>
                  <button
                    className={isSelected ? 'active' : ''}
                    onClick={() => {
                      if (!isCurrentTrackLoaded) {
                        loadAudiobook(item, activeChapters, index, 0, true)
                      } else {
                        setChapter(index)
                      }
                    }}
                    type="button"
                  >
                    <span className="chapter-item-left">
                      <span className="chapter-item-index">{index + 1}</span>
                      <i className={`bi ${isSelected && isPlaying ? 'bi-volume-up-fill soundwave-icon' : isSelected ? 'bi-play-fill' : 'bi-music-note'}`} />
                      <span className="chapter-item-title">{chapter.title}</span>
                    </span>
                    {isSelected && (
                      <span className="chapter-item-badge">
                        {isPlaying ? 'Playing' : 'Paused'}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ol>
        </section>
      )}

      <section style={{ marginTop: '36px' }}>
        <ContentComments contentId={item._id || item.id || id} />
      </section>
    </div>
  )
}

function ContentPlayerSkeleton() {
  return (
    <div className="content-player-page player-skeleton-page" aria-busy="true" aria-label="Loading audiobook player">
      <div className="skeleton-box" style={{ width: '120px', height: '36px', marginBottom: '16px', borderRadius: '8px' }} />
      <div className="content-player-hero">
        <div className="player-hero-cover-wrap">
          <div className="skeleton-box player-skeleton-cover" />
        </div>
        <div className="player-hero-info">
          <div className="skeleton-box" style={{ width: '90px', height: '16px', marginBottom: '8px' }} />
          <div className="skeleton-box" style={{ width: '80%', height: '36px', marginBottom: '10px' }} />
          <div className="skeleton-box" style={{ width: '40%', height: '20px', marginBottom: '24px' }} />
          <div className="skeleton-box" style={{ width: '100%', height: '8px', marginBottom: '20px', borderRadius: '4px' }} />
          <div style={{ display: 'flex', gap: '14px', alignItems: 'center', justifyContent: 'center' }}>
            <div className="skeleton-box" style={{ width: '44px', height: '44px', borderRadius: '50%' }} />
            <div className="skeleton-box" style={{ width: '56px', height: '56px', borderRadius: '50%' }} />
            <div className="skeleton-box" style={{ width: '44px', height: '44px', borderRadius: '50%' }} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default ContentPlayerPage
