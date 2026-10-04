import { createContext, useContext, useEffect, useRef, useState } from 'react'

const AudioPlayerContext = createContext(null)

const PROGRESS_STORAGE_PREFIX = 'bookworm_audio_progress_'

export function AudioPlayerProvider({ children }) {
  const audioRef = useRef(null)

  const [audioItem, setAudioItem] = useState(null)
  const [chapters, setChapters] = useState([])
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackRate, setPlaybackRateState] = useState(1)
  const [volume, setVolumeState] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const [isPlayerVisible, setIsPlayerVisible] = useState(false)
  const [sleepTimerRemaining, setSleepTimerRemaining] = useState(null) // seconds
  const [sleepTimerOption, setSleepTimerOption] = useState(null) // '15', '30', '45', '60', 'end_chapter', null

  const currentChapter = chapters[currentChapterIndex] || null

  // Save progress throttle ref
  const lastSavedTimeRef = useRef(0)

  // Sleep timer interval
  useEffect(() => {
    if (sleepTimerRemaining === null || sleepTimerOption === 'end_chapter') return

    const interval = setInterval(() => {
      setSleepTimerRemaining((prev) => {
        if (prev === null) return null
        if (prev <= 1) {
          pause()
          setSleepTimerOption(null)
          return null
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [sleepTimerRemaining, sleepTimerOption])

  // Sync MediaSession API
  useEffect(() => {
    if (!('mediaSession' in navigator) || !audioItem || !currentChapter) return

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentChapter.title || audioItem.title,
        artist: audioItem.author || 'LibriVox / BookWorm',
        album: audioItem.title,
        artwork: audioItem.cover_image
          ? [
              { src: audioItem.cover_image, sizes: '96x96', type: 'image/jpeg' },
              { src: audioItem.cover_image, sizes: '128x128', type: 'image/jpeg' },
              { src: audioItem.cover_image, sizes: '256x256', type: 'image/jpeg' },
              { src: audioItem.cover_image, sizes: '512x512', type: 'image/jpeg' },
            ]
          : [],
      })

      navigator.mediaSession.setActionHandler('play', () => play())
      navigator.mediaSession.setActionHandler('pause', () => pause())
      navigator.mediaSession.setActionHandler('seekbackward', () => skip(-15))
      navigator.mediaSession.setActionHandler('seekforward', () => skip(15))
      navigator.mediaSession.setActionHandler('previoustrack', () => prevChapter())
      navigator.mediaSession.setActionHandler('nexttrack', () => nextChapter())
    } catch (_) {}
  }, [audioItem, currentChapter])

  function saveProgress(itemId, chIndex, time) {
    if (!itemId) return
    try {
      localStorage.setItem(
        `${PROGRESS_STORAGE_PREFIX}${itemId}`,
        JSON.stringify({
          chapterIndex: chIndex,
          currentTime: Math.floor(time),
          updatedAt: Date.now(),
        })
      )
    } catch (_) {}
  }

  function getSavedProgress(itemId) {
    if (!itemId) return null
    try {
      const data = localStorage.getItem(`${PROGRESS_STORAGE_PREFIX}${itemId}`)
      return data ? JSON.parse(data) : null
    } catch (_) {
      return null
    }
  }

  function loadAudiobook(item, chaptersList = [], startChapterIndex = 0, resumeTime = 0, autoPlay = true) {
    if (!item) return

    setAudioItem(item)
    const validChapters = Array.isArray(chaptersList) ? chaptersList : []
    setChapters(validChapters)
    setIsPlayerVisible(true)

    // Check if we already have saved progress
    let targetChapter = startChapterIndex
    let targetTime = resumeTime

    if (resumeTime === 0 && startChapterIndex === 0) {
      const saved = getSavedProgress(item._id || item.id)
      if (saved && typeof saved.chapterIndex === 'number' && validChapters[saved.chapterIndex]) {
        targetChapter = saved.chapterIndex
        targetTime = saved.currentTime || 0
      }
    }

    setCurrentChapterIndex(targetChapter)
    setCurrentTime(targetTime)

    const ch = validChapters[targetChapter]
    if (audioRef.current && ch?.url) {
      audioRef.current.src = ch.url
      audioRef.current.currentTime = targetTime
      if (autoPlay) {
        safePlay(audioRef.current, () => setIsPlaying(false))
      }
    }
  }

  function safePlay(el, onFail) {
    if (!el) return
    try {
      const p = el.play()
      if (p && typeof p.catch === 'function') {
        p.catch(() => onFail?.())
      }
    } catch (_) {
      onFail?.()
    }
  }

  function safePause(el) {
    if (!el) return
    try {
      el.pause()
    } catch (_) {}
  }

  function play() {
    safePlay(audioRef.current, () => setIsPlaying(false))
  }

  function pause() {
    safePause(audioRef.current)
  }

  function togglePlay() {
    if (isPlaying) {
      pause()
    } else {
      play()
    }
  }

  function seek(timeInSeconds) {
    if (!audioRef.current) return
    const clamped = Math.max(0, Math.min(timeInSeconds, duration || 0))
    audioRef.current.currentTime = clamped
    setCurrentTime(clamped)
    if (audioItem) {
      saveProgress(audioItem._id || audioItem.id, currentChapterIndex, clamped)
    }
  }

  function skip(deltaSeconds) {
    if (!audioRef.current) return
    seek(currentTime + deltaSeconds)
  }

  function setChapter(index) {
    if (index < 0 || index >= chapters.length) return
    setCurrentChapterIndex(index)
    setCurrentTime(0)
    const ch = chapters[index]
    if (audioRef.current && ch?.url) {
      audioRef.current.src = ch.url
      audioRef.current.currentTime = 0
      safePlay(audioRef.current, () => setIsPlaying(false))
      if (audioItem) {
        saveProgress(audioItem._id || audioItem.id, index, 0)
      }
    }
  }

  function nextChapter() {
    if (currentChapterIndex < chapters.length - 1) {
      setChapter(currentChapterIndex + 1)
    }
  }

  function prevChapter() {
    // If more than 5 seconds in, restart chapter; otherwise go to previous chapter
    if (currentTime > 5) {
      seek(0)
    } else if (currentChapterIndex > 0) {
      setChapter(currentChapterIndex - 1)
    } else {
      seek(0)
    }
  }

  function setPlaybackRate(rate) {
    setPlaybackRateState(rate)
    if (audioRef.current) {
      audioRef.current.playbackRate = rate
    }
  }

  function setVolume(vol) {
    const clamped = Math.max(0, Math.min(1, vol))
    setVolumeState(clamped)
    if (audioRef.current) {
      audioRef.current.volume = clamped
      if (clamped > 0 && isMuted) {
        audioRef.current.muted = false
        setIsMuted(false)
      }
    }
  }

  function toggleMute() {
    if (!audioRef.current) return
    const nextMuted = !isMuted
    audioRef.current.muted = nextMuted
    setIsMuted(nextMuted)
  }

  function setSleepTimer(option) {
    setSleepTimerOption(option)
    if (!option) {
      setSleepTimerRemaining(null)
      return
    }
    if (option === 'end_chapter') {
      setSleepTimerRemaining(null)
      return
    }
    const minutes = Number(option)
    if (!Number.isNaN(minutes) && minutes > 0) {
      setSleepTimerRemaining(minutes * 60)
    }
  }

  function closePlayer() {
    pause()
    setIsPlayerVisible(false)
  }

  // Audio element listeners
  function handleTimeUpdate() {
    if (!audioRef.current) return
    const cur = audioRef.current.currentTime
    setCurrentTime(cur)

    // Save progress periodically (every 5 seconds)
    if (Math.abs(cur - lastSavedTimeRef.current) >= 5) {
      lastSavedTimeRef.current = cur
      if (audioItem) {
        saveProgress(audioItem._id || audioItem.id, currentChapterIndex, cur)
      }
    }
  }

  function handleLoadedMetadata() {
    if (!audioRef.current) return
    setDuration(audioRef.current.duration || 0)
    audioRef.current.playbackRate = playbackRate
  }

  function handleEnded() {
    if (sleepTimerOption === 'end_chapter') {
      pause()
      setSleepTimerOption(null)
      return
    }

    if (currentChapterIndex < chapters.length - 1) {
      nextChapter()
    } else {
      setIsPlaying(false)
      setCurrentTime(0)
    }
  }

  const value = {
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
    loadAudiobook,
    play,
    pause,
    togglePlay,
    seek,
    skip,
    setChapter,
    nextChapter,
    prevChapter,
    setPlaybackRate,
    setVolume,
    toggleMute,
    setSleepTimer,
    closePlayer,
    setIsPlayerVisible,
    getSavedProgress,
  }

  return (
    <AudioPlayerContext.Provider value={value}>
      {children}
      <audio
        onEnded={handleEnded}
        onError={() => {
          setIsBuffering(false)
          setIsPlaying(false)
        }}
        onLoadedMetadata={handleLoadedMetadata}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onPlaying={() => setIsBuffering(false)}
        onTimeUpdate={handleTimeUpdate}
        onWaiting={() => setIsBuffering(true)}
        preload="metadata"
        ref={audioRef}
        style={{ display: 'none' }}
      />
    </AudioPlayerContext.Provider>
  )
}

export function useAudioPlayer() {
  const context = useContext(AudioPlayerContext)
  if (!context) {
    throw new Error('useAudioPlayer must be used within an AudioPlayerProvider')
  }
  return context
}
