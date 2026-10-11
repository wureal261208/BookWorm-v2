import { useCallback, useEffect, useRef, useState } from 'react'
import { auth } from '../../features/auth-firebase/firebaseConfig'
import { apiFetch, publicApiFetch } from '../../utils/apiClient'
import { useNavigation } from '../../context/NavigationContext'
import { renderLiteMarkdown } from '../../utils/liteMarkdown'
import { getInitials, getNickname } from '../../utils/bookUtils'

const POPULAR_TAGS = ['all', 'stories', 'reflection', 'inspiration', 'poetry', 'memoir', 'fiction', 'audio']

function timeAgo(dateString) {
  if (!dateString) return 'Recently'
  const diff = Math.max(0, Date.now() - new Date(dateString).getTime())
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(dateString).toLocaleDateString()
}

function formatDuration(sec) {
  if (!sec || isNaN(sec)) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

function StoriesPage({ account, onToast }) {
  const { navigateTo } = useNavigation()
  const isGuest = !auth.currentUser

  const [typeFilter, setTypeFilter] = useState('') // '' | 'audio-story' | 'story'
  const [selectedTag, setSelectedTag] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const [stories, setStories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  // Active audio player track
  const [playingStoryId, setPlayingStoryId] = useState(null)
  const [audioProgress, setAudioProgress] = useState(0)
  const [audioCurrentTime, setAudioCurrentTime] = useState(0)
  const audioRef = useRef(null)

  // Reader Modal
  const [selectedStory, setSelectedStory] = useState(null)

  // Story Comments states
  const [comments, setComments] = useState([])
  const [loadingComments, setLoadingComments] = useState(false)
  const [newCommentText, setNewCommentText] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [commentError, setCommentError] = useState('')
  const [deletingCommentId, setDeletingCommentId] = useState(null)
  const commentInputRef = useRef(null)

  // Search debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim())
      setPage(1)
    }, 350)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Fetch stories
  const fetchStories = useCallback(async (pageNum = 1, append = false) => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      params.set('page', String(pageNum))
      params.set('limit', '12')
      if (typeFilter) params.set('type', typeFilter)
      if (selectedTag && selectedTag !== 'all') params.set('tag', selectedTag)
      if (debouncedSearch) params.set('search', debouncedSearch)

      const res = await publicApiFetch(`/api/stories?${params.toString()}`)
      const items = Array.isArray(res?.stories) ? res.stories : []
      if (append) {
        setStories((prev) => [...prev, ...items])
      } else {
        setStories(items)
      }
      setTotalPages(res?.pages || 1)
      setTotalCount(res?.total || items.length)
      setPage(pageNum)
    } catch (err) {
      setError(err.message || 'Failed to load community stories.')
      if (!append) setStories([])
    } finally {
      setLoading(false)
    }
  }, [typeFilter, selectedTag, debouncedSearch])

  useEffect(() => {
    fetchStories(1, false)
  }, [fetchStories])

  // Like interaction
  const handleLike = async (story) => {
    if (isGuest) {
      onToast?.({ type: 'info', message: 'Please sign in to like community stories.' })
      return
    }

    const storyId = story.id || story._id
    const prevLiked = story.isLiked
    const prevCount = story.likesCount || 0

    // Optimistic update
    setStories((prev) =>
      prev.map((s) =>
        (s.id === storyId || s._id === storyId)
          ? {
              ...s,
              isLiked: !prevLiked,
              likesCount: prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1,
            }
          : s
      )
    )

    if (selectedStory && (selectedStory.id === storyId || selectedStory._id === storyId)) {
      setSelectedStory((prev) => ({
        ...prev,
        isLiked: !prevLiked,
        likesCount: prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1,
      }))
    }

    try {
      const res = await apiFetch(`/api/stories/${storyId}/like`, { method: 'POST' })
      if (typeof res?.likesCount === 'number') {
        setStories((prev) =>
          prev.map((s) =>
            (s.id === storyId || s._id === storyId)
              ? { ...s, isLiked: res.isLiked, likesCount: res.likesCount }
              : s
          )
        )
      }
    } catch (err) {
      // Revert optimistic update
      setStories((prev) =>
        prev.map((s) =>
          (s.id === storyId || s._id === storyId)
            ? { ...s, isLiked: prevLiked, likesCount: prevCount }
            : s
        )
      )
      onToast?.({ type: 'error', message: err.message || 'Could not update like.' })
    }
  }

  // Audio Playback
  const handleTogglePlay = (story) => {
    const sId = story.id || story._id
    if (playingStoryId === sId) {
      if (audioRef.current) {
        if (audioRef.current.paused) {
          audioRef.current.play().catch(() => {})
        } else {
          audioRef.current.pause()
          setPlayingStoryId(null)
        }
      }
    } else {
      setPlayingStoryId(sId)
      setAudioProgress(0)
      setAudioCurrentTime(0)
      if (audioRef.current) {
        audioRef.current.src = story.audioUrl
        audioRef.current.play().catch(() => {})
      }
    }
  }

  const handleAudioTimeUpdate = () => {
    if (audioRef.current) {
      const current = audioRef.current.currentTime || 0
      const duration = audioRef.current.duration || 1
      setAudioCurrentTime(current)
      setAudioProgress((current / duration) * 100)
    }
  }

  const handleAudioEnded = () => {
    setPlayingStoryId(null)
    setAudioProgress(0)
    setAudioCurrentTime(0)
  }

  // Share story
  const handleShare = async (story) => {
    const sId = story.id || story._id
    const shareUrl = `${window.location.origin}/stories?id=${sId}`
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl)
        onToast?.({ type: 'success', message: 'Story link copied to clipboard!' })
      } else {
        onToast?.({ type: 'info', message: shareUrl })
      }
    } catch {
      onToast?.({ type: 'info', message: shareUrl })
    }
  }

  // Open full story reader
  const handleOpenStory = (story, focusComments = false) => {
    setSelectedStory(story)
    setComments(Array.isArray(story.comments) ? story.comments : [])
    setNewCommentText('')
    setCommentError('')

    const sId = story.id || story._id
    // Silently notify backend view count increment
    publicApiFetch(`/api/stories/${sId}`).catch(() => {})

    // Load fresh comments from MongoDB
    setLoadingComments(true)
    publicApiFetch(`/api/stories/${sId}/comments`)
      .then((res) => {
        if (Array.isArray(res?.comments)) {
          setComments(res.comments)
        }
      })
      .catch(() => {})
      .finally(() => setLoadingComments(false))

    if (focusComments) {
      setTimeout(() => {
        const el = document.getElementById('story-comments-section')
        if (el) el.scrollIntoView({ behavior: 'smooth' })
        commentInputRef.current?.focus()
      }, 200)
    }
  }

  // Submit comment to MongoDB
  const handleAddComment = async (e) => {
    e.preventDefault()
    if (isGuest) {
      onToast?.({ type: 'info', message: 'Please sign in to post a comment.' })
      return
    }

    const text = newCommentText.trim()
    if (!text) {
      setCommentError('Please enter a comment.')
      return
    }

    setSubmittingComment(true)
    setCommentError('')
    const sId = selectedStory?.id || selectedStory?._id

    try {
      const res = await apiFetch(`/api/stories/${sId}/comments`, {
        method: 'POST',
        body: { text },
      })

      if (res?.comment) {
        setComments((prev) => [...prev, res.comment])
        setNewCommentText('')
        const newCount = res.commentsCount ?? (comments.length + 1)
        setSelectedStory((prev) => (prev ? { ...prev, commentsCount: newCount } : prev))
        setStories((prev) =>
          prev.map((s) => (s.id === sId || s._id === sId ? { ...s, commentsCount: newCount } : s))
        )
        onToast?.({ type: 'success', message: 'Comment posted successfully!' })
      }
    } catch (err) {
      setCommentError(err.message || 'Could not post comment.')
    } finally {
      setSubmittingComment(false)
    }
  }

  // Delete comment from MongoDB
  const handleDeleteComment = async (commentId) => {
    const sId = selectedStory?.id || selectedStory?._id
    setDeletingCommentId(commentId)
    try {
      await apiFetch(`/api/stories/${sId}/comments/${commentId}`, {
        method: 'DELETE',
      })
      setComments((prev) => prev.filter((c) => (c.id || c._id) !== commentId))
      const newCount = Math.max(0, (selectedStory?.commentsCount || comments.length) - 1)
      setSelectedStory((prev) => (prev ? { ...prev, commentsCount: newCount } : prev))
      setStories((prev) =>
        prev.map((s) => (s.id === sId || s._id === sId ? { ...s, commentsCount: newCount } : s))
      )
      onToast?.({ type: 'success', message: 'Comment deleted.' })
    } catch (err) {
      onToast?.({ type: 'error', message: err.message || 'Could not delete comment.' })
    } finally {
      setDeletingCommentId(null)
    }
  }

  return (
    <div className="stories-page-container">
      {/* Hidden audio element for audio story playback */}
      <audio
        onEnded={handleAudioEnded}
        onTimeUpdate={handleAudioTimeUpdate}
        ref={audioRef}
        style={{ display: 'none' }}
      />

      {/* Hero Header */}
      <header className="stories-hero-banner">
        <div className="stories-hero-content">
          <div className="stories-hero-badge">
            <i className="bi bi-chat-heart-fill" />
            <span>Community Stories</span>
          </div>
          <h1>Stories & Voice Recordings</h1>
          <p>
            Explore authentic personal reflections, creative writing, and voice messages shared by
            fellow readers and storytellers across the globe.
          </p>
          <div className="stories-hero-actions">
            <button
              className="primary-button stories-share-btn"
              onClick={() => navigateTo('write', { query: 'tab=story' })}
              type="button"
            >
              <i className="bi bi-mic-fill" />
              <span>Share a Story & Voice</span>
            </button>
            <button
              className="ghost-button stories-explore-btn"
              onClick={() => {
                setTypeFilter('audio-story')
                setPage(1)
              }}
              type="button"
            >
              <i className="bi bi-headphones" />
              <span>Browse Audio Stories</span>
            </button>
          </div>
        </div>
      </header>

      {/* Filters and Search Bar */}
      <section className="stories-filter-bar" aria-label="Filter stories">
        <div className="stories-type-tabs" role="tablist">
          <button
            aria-selected={typeFilter === ''}
            className={`stories-type-tab ${typeFilter === '' ? 'active' : ''}`}
            onClick={() => {
              setTypeFilter('')
              setPage(1)
            }}
            role="tab"
            type="button"
          >
            <i className="bi bi-grid-fill" />
            <span>All Stories</span>
          </button>
          <button
            aria-selected={typeFilter === 'audio-story'}
            className={`stories-type-tab ${typeFilter === 'audio-story' ? 'active' : ''}`}
            onClick={() => {
              setTypeFilter('audio-story')
              setPage(1)
            }}
            role="tab"
            type="button"
          >
            <i className="bi bi-mic-fill" />
            <span>Voice Recordings</span>
          </button>
          <button
            aria-selected={typeFilter === 'story'}
            className={`stories-type-tab ${typeFilter === 'story' ? 'active' : ''}`}
            onClick={() => {
              setTypeFilter('story')
              setPage(1)
            }}
            role="tab"
            type="button"
          >
            <i className="bi bi-journal-richtext" />
            <span>Written Stories</span>
          </button>
        </div>

        <div className="stories-search-box">
          <i className="bi bi-search stories-search-icon" />
          <input
            aria-label="Search stories"
            className="stories-search-input"
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title, author, or keyword..."
            type="search"
            value={searchQuery}
          />
          {searchQuery && (
            <button
              aria-label="Clear search"
              className="stories-search-clear"
              onClick={() => setSearchQuery('')}
              type="button"
            >
              <i className="bi bi-x-circle-fill" />
            </button>
          )}
        </div>
      </section>

      {/* Popular Tags Row */}
      <nav className="stories-tags-nav" aria-label="Topic tags">
        <span className="stories-tags-label"><i className="bi bi-tags" /> Topics:</span>
        <div className="stories-tags-list">
          {POPULAR_TAGS.map((tag) => (
            <button
              className={`story-tag-chip ${selectedTag === tag ? 'active' : ''}`}
              key={tag}
              onClick={() => {
                setSelectedTag(tag)
                setPage(1)
              }}
              type="button"
            >
              #{tag}
            </button>
          ))}
        </div>
      </nav>

      {/* Main Stories Grid */}
      <main className="stories-feed-workspace">
        {error && (
          <div className="stories-error-alert" role="alert">
            <i className="bi bi-exclamation-triangle-fill" />
            <span>{error}</span>
            <button className="ghost-button" onClick={() => fetchStories(1, false)} type="button">
              Retry
            </button>
          </div>
        )}

        {loading && stories.length === 0 ? (
          <div className="stories-grid-loading" aria-label="Loading stories">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div className="story-card-skeleton" key={idx} />
            ))}
          </div>
        ) : stories.length > 0 ? (
          <>
            <div className="stories-count-indicator">
              Showing <strong>{stories.length}</strong> of <strong>{totalCount}</strong> community stories
            </div>

            <div className="stories-cards-grid">
              {stories.map((story) => {
                const sId = story.id || story._id
                const isAudio = story.type === 'audio-story' || Boolean(story.audioUrl)
                const isPlaying = playingStoryId === sId
                const author = story.author || {}
                const authorName = getNickname(story.authorName || author.name, 'Reader')
                const authorAvatar = story.authorAvatar || author.avatar || ''
                const tags = Array.isArray(story.tags) && story.tags.length ? story.tags : ['stories']

                return (
                  <article className={`story-feed-card ${isAudio ? 'is-audio' : 'is-text'}`} key={sId}>
                    {/* Author & Badge Header */}
                    <div className="story-card-header">
                      <div className="story-author-info">
                        <div className="story-author-avatar">
                          {authorAvatar ? (
                            <img alt="" src={authorAvatar} />
                          ) : (
                            <span>{getInitials(authorName)}</span>
                          )}
                        </div>
                        <div className="story-author-meta">
                          <span className="story-author-name">{authorName}</span>
                          <time className="story-post-time">{timeAgo(story.createdAt)}</time>
                        </div>
                      </div>

                      <span className={`story-type-badge ${isAudio ? 'badge-audio' : 'badge-story'}`}>
                        <i className={`bi ${isAudio ? 'bi-mic-fill' : 'bi-journal-text'}`} />
                        <span>{isAudio ? 'Voice' : 'Story'}</span>
                      </span>
                    </div>

                    {/* Story Cover Image (if uploaded) */}
                    {story.coverUrl && (
                      <div className="story-cover-container" onClick={() => handleOpenStory(story)}>
                        <img
                          alt={`${story.title} cover`}
                          className="story-cover-image"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none'
                          }}
                          src={story.coverUrl}
                        />
                      </div>
                    )}

                    {/* Title & Excerpt */}
                    <div className="story-card-body">
                      <h2
                        className="story-card-title"
                        onClick={() => handleOpenStory(story)}
                        title={story.title}
                      >
                        {story.title}
                      </h2>
                      <p className="story-card-excerpt">
                        {story.content}
                      </p>
                    </div>

                    {/* Embedded Audio Player for Audio Stories */}
                    {isAudio && story.audioUrl && (
                      <div className="story-card-audio-player">
                        <button
                          aria-label={isPlaying ? 'Pause audio' : 'Play voice story'}
                          className={`story-audio-play-btn ${isPlaying ? 'playing' : ''}`}
                          onClick={() => handleTogglePlay(story)}
                          type="button"
                        >
                          <i className={`bi ${isPlaying ? 'bi-pause-fill' : 'bi-play-fill'}`} />
                        </button>
                        <div className="story-audio-waveform-track">
                          <div
                            className="story-audio-waveform-fill"
                            style={{ width: `${isPlaying ? audioProgress : 0}%` }}
                          />
                        </div>
                        <span className="story-audio-duration">
                          {isPlaying
                            ? formatDuration(audioCurrentTime)
                            : formatDuration(story.audioDuration || 0)}
                        </span>
                      </div>
                    )}

                    {/* Tags List */}
                    <div className="story-card-tags">
                      {tags.map((t, idx) => (
                        <span
                          className="story-tag-pill"
                          key={idx}
                          onClick={() => {
                            setSelectedTag(t)
                            setPage(1)
                          }}
                        >
                          #{t}
                        </span>
                      ))}
                    </div>

                    {/* Footer Actions */}
                    <div className="story-card-footer">
                      <div className="story-card-stats">
                        <button
                          aria-label={story.isLiked ? 'Unlike story' : 'Like story'}
                          className={`story-stat-btn like-btn ${story.isLiked ? 'liked' : ''}`}
                          onClick={() => handleLike(story)}
                          type="button"
                        >
                          <i className={`bi ${story.isLiked ? 'bi-heart-fill' : 'bi-heart'}`} />
                          <span>{story.likesCount || 0}</span>
                        </button>

                        <button
                          aria-label="View comments"
                          className="story-stat-btn comment-btn"
                          onClick={() => handleOpenStory(story, true)}
                          title={`${story.commentsCount ?? (story.comments?.length || 0)} comments`}
                          type="button"
                        >
                          <i className="bi bi-chat-dots" />
                          <span>{story.commentsCount ?? (story.comments?.length || 0)}</span>
                        </button>

                        <span className="story-stat-item" title={`${story.views || 0} reads`}>
                          <i className="bi bi-eye" />
                          <span>{story.views || 0}</span>
                        </span>
                      </div>

                      <div className="story-card-actions">
                        <button
                          aria-label="Share story link"
                          className="story-icon-btn"
                          onClick={() => handleShare(story)}
                          title="Share"
                          type="button"
                        >
                          <i className="bi bi-share" />
                        </button>
                        <button
                          className="ghost-button story-read-btn"
                          onClick={() => handleOpenStory(story)}
                          type="button"
                        >
                          <span>{isAudio ? 'Listen' : 'Read'}</span>
                          <i className="bi bi-arrow-right-short" />
                        </button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>

            {/* Load More Pagination */}
            {page < totalPages && (
              <div className="stories-pagination-container">
                <button
                  className="primary-button stories-load-more-btn"
                  disabled={loading}
                  onClick={() => fetchStories(page + 1, true)}
                  type="button"
                >
                  {loading ? (
                    <>
                      <i className="bi bi-arrow-repeat spin" /> Loading more...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-plus-circle" /> Load More Stories
                    </>
                  )}
                </button>
              </div>
            )}
          </>
        ) : (
          /* Empty State */
          <div className="stories-empty-state">
            <div className="stories-empty-icon">
              <i className="bi bi-chat-square-heart" />
            </div>
            <h2>No stories found</h2>
            <p>
              {debouncedSearch
                ? `No community stories matching "${debouncedSearch}". Try another search term or clear filters.`
                : 'No community stories in this category yet. Be the first to share your reflection or voice recording!'}
            </p>
            <div className="stories-empty-actions">
              {debouncedSearch || selectedTag !== 'all' || typeFilter ? (
                <button
                  className="ghost-button"
                  onClick={() => {
                    setTypeFilter('')
                    setSelectedTag('all')
                    setSearchQuery('')
                  }}
                  type="button"
                >
                  Clear all filters
                </button>
              ) : null}
              <button
                className="primary-button"
                onClick={() => navigateTo('write', { query: 'tab=story' })}
                type="button"
              >
                <i className="bi bi-pencil-square" />
                <span>Write or Record Story</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Reader Modal */}
      {selectedStory && (
        <div
          aria-labelledby="story-modal-title"
          aria-modal="true"
          className="confirmation-dialog-backdrop story-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedStory(null)
          }}
          role="dialog"
        >
          <div className="story-modal-card">
            <button
              aria-label="Close story"
              className="confirmation-dialog-close story-modal-close"
              onClick={() => setSelectedStory(null)}
              type="button"
            >
              <i className="bi bi-x-lg" />
            </button>

            <div className="story-modal-header">
              <div className="story-author-info">
                <div className="story-author-avatar">
                  {selectedStory.authorAvatar || selectedStory.author?.avatar ? (
                    <img alt="" src={selectedStory.authorAvatar || selectedStory.author?.avatar} />
                  ) : (
                    <span>{getInitials(getNickname(selectedStory.authorName || selectedStory.author?.name, 'A'))}</span>
                  )}
                </div>
                <div className="story-author-meta">
                  <strong>{getNickname(selectedStory.authorName || selectedStory.author?.name, 'Reader')}</strong>
                  <time>{timeAgo(selectedStory.createdAt)}</time>
                </div>
              </div>

              <span className={`story-type-badge ${selectedStory.type === 'audio-story' ? 'badge-audio' : 'badge-story'}`}>
                <i className={`bi ${selectedStory.type === 'audio-story' ? 'bi-mic-fill' : 'bi-journal-text'}`} />
                <span>{selectedStory.type === 'audio-story' ? 'Voice Recording' : 'Written Story'}</span>
              </span>
            </div>

            {selectedStory.coverUrl && (
              <div className="story-modal-cover">
                <img
                  alt={`${selectedStory.title} cover`}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                  src={selectedStory.coverUrl}
                />
              </div>
            )}

            <div className="story-modal-content">
              <h1 id="story-modal-title">{selectedStory.title}</h1>

              {selectedStory.audioUrl && (
                <div className="story-modal-audio-box">
                  <div className="story-modal-audio-label">
                    <i className="bi bi-soundwave" />
                    <span>Voice Recording</span>
                  </div>
                  <audio
                    controls
                    preload="metadata"
                    src={selectedStory.audioUrl}
                    style={{ width: '100%' }}
                  />
                </div>
              )}

              <div
                className="story-modal-text"
                dangerouslySetInnerHTML={{
                  __html: renderLiteMarkdown(selectedStory.content).replace(/\n/g, '<br/>'),
                }}
              />

              <div className="story-modal-tags">
                {(selectedStory.tags || ['stories']).map((t, idx) => (
                  <span className="story-tag-pill" key={idx}>#{t}</span>
                ))}
              </div>
            </div>

            {/* Interactive Story Comments Section (Persisted in MongoDB) */}
            <div className="story-comments-section" id="story-comments-section">
              <div className="story-comments-header">
                <div className="story-comments-title">
                  <i className="bi bi-chat-left-text-fill" />
                  <h3>Community Comments</h3>
                  <span className="story-comments-badge">{comments.length}</span>
                </div>
                <small className="story-comments-subtitle">
                  Share your reflection and thoughts on this story.
                </small>
              </div>

              {/* Add Comment Form */}
              {!isGuest ? (
                <form className="story-comment-form" onSubmit={handleAddComment}>
                  <div className="story-comment-author-badge">
                    <i className="bi bi-person-circle" />
                    <span>Commenting as: <strong>{getNickname(account, 'Reader')}</strong></span>
                  </div>
                  <div className="story-comment-input-wrap">
                    <textarea
                      aria-label="Write a comment"
                      className="story-comment-textarea"
                      maxLength={2000}
                      onChange={(e) => setNewCommentText(e.target.value)}
                      placeholder={`Leave a thoughtful comment as ${getNickname(account, 'Reader')}...`}
                      ref={commentInputRef}
                      rows={3}
                      value={newCommentText}
                    />
                    <div className="story-comment-form-footer">
                      <span className="story-comment-char-count">{newCommentText.length}/2000</span>
                      <button
                        className="primary-button story-comment-submit-btn"
                        disabled={submittingComment || !newCommentText.trim()}
                        type="submit"
                      >
                        {submittingComment ? (
                          <>
                            <i className="bi bi-arrow-repeat spin" /> Posting...
                          </>
                        ) : (
                          <>
                            <i className="bi bi-send-fill" /> Post Comment
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  {commentError && (
                    <p className="story-comment-error" role="alert">
                      <i className="bi bi-exclamation-circle" /> {commentError}
                    </p>
                  )}
                </form>
              ) : (
                <div className="story-comment-guest-prompt">
                  <i className="bi bi-chat-heart" />
                  <div>
                    <strong>Join the conversation</strong>
                    <p>Sign in to comment and share your perspective with this storyteller.</p>
                  </div>
                </div>
              )}

              {/* Comments List */}
              <div className="story-comments-list">
                {loadingComments && comments.length === 0 ? (
                  <p className="story-comments-loading">
                    <i className="bi bi-arrow-repeat spin" /> Loading comments...
                  </p>
                ) : comments.length > 0 ? (
                  comments.map((comment) => {
                    const cId = comment.id || comment._id
                    const isOwner =
                      account &&
                      (comment.user === account.uid ||
                        comment.user === account._id ||
                        String(comment.user) === String(account._id) ||
                        String(selectedStory?.author) === String(account._id) ||
                        String(selectedStory?.author?._id) === String(account._id) ||
                        account.role === 'admin')
                    const cNickname = getNickname(comment.authorName || comment.user?.name, 'Reader')

                    return (
                      <div className="story-comment-item" key={cId}>
                        <div className="story-comment-avatar">
                          {comment.authorAvatar ? (
                            <img alt="" src={comment.authorAvatar} />
                          ) : (
                            <span>{getInitials(cNickname)}</span>
                          )}
                        </div>
                        <div className="story-comment-content">
                          <div className="story-comment-meta">
                            <span className="story-comment-author">{cNickname}</span>
                            <time className="story-comment-time">{timeAgo(comment.createdAt)}</time>
                            {isOwner && (
                              <button
                                aria-label="Delete comment"
                                className="story-comment-delete-btn"
                                disabled={deletingCommentId === cId}
                                onClick={() => handleDeleteComment(cId)}
                                title="Delete comment"
                                type="button"
                              >
                                <i className="bi bi-trash" />
                              </button>
                            )}
                          </div>
                          <p className="story-comment-text">{comment.text}</p>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="story-comments-empty">
                    <i className="bi bi-chat-square" />
                    <p>No comments yet. Be the first to share your reflection on this story!</p>
                  </div>
                )}
              </div>
            </div>

            <div className="story-modal-footer">
              <button
                aria-label="Like story"
                className={`primary-button story-modal-like-btn ${selectedStory.isLiked ? 'liked' : ''}`}
                onClick={() => handleLike(selectedStory)}
                type="button"
              >
                <i className={`bi ${selectedStory.isLiked ? 'bi-heart-fill' : 'bi-heart'}`} />
                <span>{selectedStory.isLiked ? 'Liked' : 'Like'} ({selectedStory.likesCount || 0})</span>
              </button>
              <button
                aria-label="Share story"
                className="ghost-button story-modal-share-btn"
                onClick={() => handleShare(selectedStory)}
                type="button"
              >
                <i className="bi bi-share" />
                <span>Share Story</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default StoriesPage
