import { useEffect, useRef, useState } from 'react'
import { useAudioPlayer } from '../../context/AudioPlayerContext'
import { useNavigation } from '../../context/NavigationContext'
import { getCover } from '../../utils/bookUtils'

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
const SLEEP_OPTIONS = [
  { value: null, label: 'Off' },
  { value: '15', label: '15 mins' },
  { value: '30', label: '30 mins' },
  { value: '45', label: '45 mins' },
  { value: '60', label: '60 mins' },
  { value: 'end_chapter', label: 'End of chapter' },
]

export default function GlobalMiniPlayer() {
  const {
    audioItem,
    chapters,
    currentChapter,
    currentChapterIndex,
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    volume,
    isMuted,
    isBuffering,
    isPlayerVisible,
    sleepTimerRemaining,
    sleepTimerOption,
    togglePlay,
    seek,
    skip,
    nextChapter,
    prevChapter,
    setPlaybackRate,
    setVolume,
    toggleMute,
    setSleepTimer,
    closePlayer,
  } = useAudioPlayer()

  const { activePage, navigateTo } = useNavigation()

  const [showSpeedMenu, setShowSpeedMenu] = useState(false)
  const [showSleepMenu, setShowSleepMenu] = useState(false)
  const [showVolumeSlider, setShowVolumeSlider] = useState(false)

  const speedMenuRef = useRef(null)
  const sleepMenuRef = useRef(null)
  const volumeRef = useRef(null)

  // Close popup menus on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (speedMenuRef.current && !speedMenuRef.current.contains(e.target)) {
        setShowSpeedMenu(false)
      }
      if (sleepMenuRef.current && !sleepMenuRef.current.contains(e.target)) {
        setShowSleepMenu(false)
      }
      if (volumeRef.current && !volumeRef.current.contains(e.target)) {
        setShowVolumeSlider(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // If player shouldn't be visible, or no audio item loaded, or user is currently in Admin page
  if (!isPlayerVisible || !audioItem || activePage === 'admin') {
    return null
  }

  function handleGoToPlayerPage() {
    if (audioItem._id || audioItem.id) {
      navigateTo('listen', { query: `id=${audioItem._id || audioItem.id}` })
    }
  }

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="global-mini-player-container" role="region" aria-label="Audio player">
      {/* Top thin seek progress line */}
      <div
        className="mini-player-progress-bar-wrap"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const clickPos = (e.clientX - rect.left) / rect.width
          seek(clickPos * duration)
        }}
      >
        <div className="mini-player-progress-fill" style={{ width: `${progressPercent}%` }} />
      </div>

      <div className="mini-player-content">
        {/* Left Section: Book & Chapter info */}
        <div className="mini-player-left">
          <button
            className="mini-player-cover-btn"
            onClick={handleGoToPlayerPage}
            title="Open audiobook details"
            type="button"
          >
            <img
              alt=""
              className={`mini-player-cover ${isPlaying ? 'is-playing' : ''}`}
              src={getCover(audioItem)}
            />
          </button>
          <div className="mini-player-meta">
            <button
              className="mini-player-title"
              onClick={handleGoToPlayerPage}
              title={audioItem.title}
              type="button"
            >
              {audioItem.title}
            </button>
            <span className="mini-player-sub">
              {currentChapter ? currentChapter.title : audioItem.author}
              {chapters.length > 1 && (
                <small className="mini-player-chapter-count">
                  ({currentChapterIndex + 1}/{chapters.length})
                </small>
              )}
            </span>
          </div>
        </div>

        {/* Center Section: Core Controls & Timeline */}
        <div className="mini-player-center">
          <div className="mini-player-buttons">
            <button
              aria-label="Previous chapter"
              className="mini-player-btn ghost"
              disabled={currentChapterIndex <= 0 && currentTime <= 5}
              onClick={prevChapter}
              title="Previous chapter"
              type="button"
            >
              <i className="bi bi-skip-backward-fill" />
            </button>

            <button
              aria-label="Rewind 15 seconds"
              className="mini-player-btn ghost skip-btn"
              onClick={() => skip(-15)}
              title="Rewind 15s"
              type="button"
            >
              <i className="bi bi-arrow-counterclockwise" />
              <span className="skip-badge">15</span>
            </button>

            <button
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="mini-player-btn play-btn"
              onClick={togglePlay}
              title={isPlaying ? 'Pause' : 'Play'}
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
              className="mini-player-btn ghost skip-btn"
              onClick={() => skip(15)}
              title="Forward 15s"
              type="button"
            >
              <i className="bi bi-arrow-clockwise" />
              <span className="skip-badge">15</span>
            </button>

            <button
              aria-label="Next chapter"
              className="mini-player-btn ghost"
              disabled={currentChapterIndex >= chapters.length - 1}
              onClick={nextChapter}
              title="Next chapter"
              type="button"
            >
              <i className="bi bi-skip-forward-fill" />
            </button>
          </div>

          <div className="mini-player-timeline">
            <span className="mini-player-time">{formatTime(currentTime)}</span>
            <input
              aria-label="Seek track position"
              className="mini-player-slider"
              max={duration || 100}
              min="0"
              onChange={(e) => seek(Number(e.target.value))}
              step="1"
              type="range"
              value={currentTime || 0}
            />
            <span className="mini-player-time">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Right Section: Extras (Speed, Timer, Volume, Expand, Close) */}
        <div className="mini-player-right">
          {/* Playback speed menu */}
          <div className="mini-player-popover-wrap" ref={speedMenuRef}>
            <button
              className="mini-player-pill-btn"
              onClick={() => setShowSpeedMenu((v) => !v)}
              title="Playback speed"
              type="button"
            >
              {playbackRate}x
            </button>
            {showSpeedMenu && (
              <div className="mini-player-popover">
                <span className="popover-title">Playback Speed</span>
                {SPEED_OPTIONS.map((rate) => (
                  <button
                    className={`popover-item ${playbackRate === rate ? 'active' : ''}`}
                    key={rate}
                    onClick={() => {
                      setPlaybackRate(rate)
                      setShowSpeedMenu(false)
                    }}
                    type="button"
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sleep timer menu */}
          <div className="mini-player-popover-wrap" ref={sleepMenuRef}>
            <button
              className={`mini-player-icon-btn ${sleepTimerOption ? 'is-active' : ''}`}
              onClick={() => setShowSleepMenu((v) => !v)}
              title={sleepTimerOption ? `Sleep timer active (${sleepTimerRemaining ? Math.ceil(sleepTimerRemaining / 60) + 'm' : 'End of ch.'})` : 'Set sleep timer'}
              type="button"
            >
              <i className="bi bi-moon-stars" />
              {sleepTimerRemaining !== null && (
                <span className="mini-player-timer-badge">
                  {Math.ceil(sleepTimerRemaining / 60)}m
                </span>
              )}
            </button>
            {showSleepMenu && (
              <div className="mini-player-popover">
                <span className="popover-title">Sleep Timer</span>
                {SLEEP_OPTIONS.map((opt) => (
                  <button
                    className={`popover-item ${sleepTimerOption === opt.value ? 'active' : ''}`}
                    key={String(opt.value)}
                    onClick={() => {
                      setSleepTimer(opt.value)
                      setShowSleepMenu(false)
                    }}
                    type="button"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Volume control */}
          <div className="mini-player-popover-wrap volume-wrap" ref={volumeRef}>
            <button
              className="mini-player-icon-btn"
              onClick={toggleMute}
              title={isMuted || volume === 0 ? 'Unmute' : 'Mute'}
              type="button"
            >
              <i
                className={`bi ${
                  isMuted || volume === 0
                    ? 'bi-volume-mute-fill'
                    : volume < 0.5
                    ? 'bi-volume-down-fill'
                    : 'bi-volume-up-fill'
                }`}
              />
            </button>
            <div className="mini-player-volume-slider-box">
              <input
                aria-label="Volume"
                className="mini-player-vol-slider"
                max="1"
                min="0"
                onChange={(e) => setVolume(Number(e.target.value))}
                step="0.05"
                type="range"
                value={isMuted ? 0 : volume}
              />
            </div>
          </div>

          {/* Expand to detail page */}
          <button
            className="mini-player-icon-btn"
            onClick={handleGoToPlayerPage}
            title="Expand to Full Player"
            type="button"
          >
            <i className="bi bi-arrows-angle-expand" />
          </button>

          {/* Close mini player */}
          <button
            className="mini-player-icon-btn close-btn"
            onClick={closePlayer}
            title="Close Player"
            type="button"
          >
            <i className="bi bi-x-lg" />
          </button>
        </div>
      </div>
    </div>
  )
}
