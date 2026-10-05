import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { auth } from '../../features/auth-firebase/firebaseConfig'
import { apiFetch, publicApiFetch } from '../../utils/apiClient'
import { useNavigation } from '../../context/NavigationContext'
import { useAudioPlayer } from '../../context/AudioPlayerContext'
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

  const isCurrentTrackLoaded = audioItem && (audioItem._id === id || audioItem.id === id)

  useEffect(() => {
    if (!id) return
    let ignore = false
    setLoading(true)
    setError('')

    Promise.all([publicApiFetch(`/api/content/${id}`), publicApiFetch(`/api/content/${id}/chapters`)])
      .then(([itemData, chaptersData]) => {
        if (ignore) return
        setItem(itemData)
        const chList = Array.isArray(chaptersData?.chapters) ? chaptersData.chapters : []
        setPageChapters(chList)

        if (auth.currentUser && itemData.categories?.length) {
          apiFetch('/api/users/me/engagement', { method: 'POST', body: { categories: itemData.categories } }).catch(() => {})
        }

        // Auto load into persistent player if not already playing this item
        if (!isCurrentTrackLoaded && chList.length > 0) {
          loadAudiobook(itemData, chList, 0, 0, true)
        }
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

  if (!id) return <p className="admin-validation-error"><i className="bi bi-x-circle" /> No audiobook selected.</p>
  if (loading && !item) return <p className="settings-copy">Loading audiobook details...</p>
  if (error || !item) {
    return <p className="admin-validation-error"><i className="bi bi-x-circle" /> {error || 'Audiobook not found.'}</p>
  }

  const activeChapters = isCurrentTrackLoaded && pageChapters.length === 0 ? [] : pageChapters
  const currentChapter = activeChapters[currentChapterIndex] || null

  return (
    <div className="content-player-page">
      <nav aria-label="Audiobook navigation" style={{ marginBottom: '16px' }}>
        <button className="ghost-button" onClick={() => navigateTo('books')} type="button">
          <i className="bi bi-arrow-left" style={{ marginRight: '6px' }} /> Back to catalog
        </button>
      </nav>

      <section className="content-player-hero">
        <div className="player-hero-cover-wrap">
          {item.cover_image ? (
            <img alt={`${item.title} audiobook cover`} className="player-hero-cover" src={item.cover_image} />
          ) : (
            <div className="player-hero-cover-placeholder">
              <i className="bi bi-headphones" />
            </div>
          )}
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
                  onClick={togglePlay}
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
        <ContentComments contentId={item._id} />
      </section>
    </div>
  )
}

export default ContentPlayerPage
