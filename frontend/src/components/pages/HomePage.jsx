import { useEffect, useState } from 'react'
import { auth } from '../../features/auth-firebase/firebaseConfig'
import { apiFetch, publicApiFetch } from '../../utils/apiClient'
import { GENRE_SLIDES, GENRE_ICONS } from '../../utils/genreSlides'
import { useNavigation } from '../../context/NavigationContext'
import BookGrid from '../books/BookGrid'
import BookCarousel from '../books/BookCarousel'
import ExternalMediaCarousel from '../books/ExternalMediaCarousel'
import PromoBanner from '../books/PromoBanner'
import { getCover } from '../../utils/bookUtils'

function useBookRow(query) {
  const [books, setBooks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let ignore = false
    setLoading(true)
    publicApiFetch(`/api/books?${query}`)
      .then((data) => {
        if (!ignore) setBooks(Array.isArray(data.books) ? data.books : [])
      })
      .catch(() => {
        if (!ignore) setBooks([])
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  return [books, loading]
}

function useExternalRow(path) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(!!path)

  useEffect(() => {
    if (!path) {
      setItems([])
      setLoading(false)
      return undefined
    }

    let ignore = false
    setLoading(true)
    publicApiFetch(path)
      .then((data) => {
        if (!ignore) setItems(Array.isArray(data?.items) ? data.items : [])
      })
      .catch(() => {
        if (!ignore) setItems([])
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [path])

  return [items, loading]
}

function useStoriesRow() {
  const [stories, setStories] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let ignore = false
    setLoading(true)
    publicApiFetch('/api/stories?limit=12')
      .then((data) => {
        if (!ignore) setStories(Array.isArray(data?.stories) ? data.stories : [])
      })
      .catch(() => {
        if (!ignore) setStories([])
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [])

  return [stories, loading, setStories]
}

function timeAgo(dateString) {
  if (!dateString) return 'Recently'
  const diff = Math.max(0, Date.now() - new Date(dateString).getTime())
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 3600000)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function HomePage({
  account,
  books = [],
  booksLoading = false,
  favorites = [],
  onDetail,
  onFavorite,
  onRead,
  onRemoveShelfBook,
  onSelectGenre,
  preferenceVersion = 0,
  progress = {},
  setPage,
  shelf = [],
  viewCounts,
  viewerCounts,
}) {
  const { navigateTo } = useNavigation()
  const isGuest = !account || account.role === 'guest' || !auth.currentUser

  // Recommended shelf: leverages user's selected preferred categories
  const [recommended, recommendedLoading] = useBookRow(`limit=16&sort=recommended&v=${preferenceVersion}`)

  // Hot books shelf: priority logic based on views/reads, Gutenberg/LibriVox library books,
  // and user-contributed books requiring >= 1,000 views. Views can be edited directly in MongoDB.
  const [hotBooks, hotBooksLoading] = useBookRow('limit=16&sort=hot')

  // External synchronized content rows
  const [hotEbooks, hotEbooksLoading] = useExternalRow('/api/content?type=ebook&sort=hot&limit=16')
  const [hotAudiobooks, hotAudiobooksLoading] = useExternalRow('/api/content?type=audiobook&sort=hot&limit=16')
  const [forYou, forYouLoading] = useExternalRow(`/api/content/for-you?limit=16&v=${preferenceVersion}`)
  const [communityBooks, communityBooksLoading] = useBookRow('createdByRole=customer&limit=16')
  const [stories, storiesLoading, setStories] = useStoriesRow()
  const [recentItems, setRecentItems] = useState([])

  const toggleStoryLike = async (storyId) => {
    if (!auth.currentUser) return
    try {
      const data = await apiFetch(`/api/stories/${storyId}/like`, { method: 'POST' })
      setStories((prev) =>
        prev.map((s) =>
          (s.id === storyId || s._id === storyId)
            ? { ...s, isLiked: data.isLiked, likesCount: data.likesCount }
            : s
        )
      )
    } catch (_) {}
  }

  const handleDismissRecent = (e, bookId) => {
    e.stopPropagation()
    setRecentItems((current) => current.filter((item) => String(item.id) !== String(bookId)))
    onRemoveShelfBook?.(bookId)
  }

  useEffect(() => {
    if (isGuest) {
      setRecentItems([])
      return undefined
    }

    let ignore = false
    apiFetch('/api/users/me/progress')
      .then((data) => {
        if (!ignore && Array.isArray(data?.progress)) {
          const shelfMap = new Map((shelf || []).map((s) => [String(s.bookId), s.status]))
          const mapped = data.progress
            .filter((p) => {
              const contentIdStr = String(p.contentId)
              if (Array.isArray(shelf) && shelf.length > 0) {
                const status = shelfMap.get(contentIdStr)
                if (!status || status === 'finished') return false
              }
              if (progress && Object.keys(progress).length > 0 && progress[contentIdStr] === undefined) {
                return false
              }
              const pct = Number(p.percent) || 0
              if (pct <= 0 || pct >= 100) return false
              return true
            })
            .map((p) => ({
              id: p.contentId,
              _id: p.contentId,
              title: p.title,
              author: p.author,
              cover_image: p.cover,
              cover: p.cover,
              type: p.type || 'ebook',
              percent: p.percent || 0,
              chapterTitle: p.chapterTitle,
              chapterIndex: p.chapterIndex,
              currentTime: p.currentTime,
              duration: p.duration,
              updatedAt: new Date(p.updatedAt).getTime(),
            }))
          setRecentItems(mapped.slice(0, 4))
        }
      })
      .catch(() => {
        if (!ignore) setRecentItems([])
      })

    return () => {
      ignore = true
    }
  }, [isGuest, shelf, progress])

  const newBooks = books.slice(0, 16)
  const savedBooksList = !isGuest && Array.isArray(favorites) && favorites.length > 0
    ? books.filter((book) => favorites.includes(book.id) || favorites.includes(book._id))
    : []

  return (
    <div className="home-page">
      {/* Featured visual banner */}
      <PromoBanner onSelectGenre={onSelectGenre} />

      {/* Genre quick-access navigation strip with Bootstrap Icons */}
      <nav aria-label="Quick genre navigation" className="home-genre-strip">
        <button
          className="home-genre-chip"
          onClick={() => onSelectGenre?.('')}
          type="button"
        >
          <i className="bi bi-stars" />
          <span>All genres</span>
        </button>
        {GENRE_SLIDES.map((slide) => (
          <button
            key={slide.id}
            className="home-genre-chip"
            onClick={() => onSelectGenre?.(slide.topic)}
            type="button"
          >
            <i className={`bi ${slide.icon || GENRE_ICONS[slide.topic] || 'bi-bookmark-star'}`} />
            <span>{slide.topic}</span>
          </button>
        ))}
      </nav>

      {/* Continue Reading / Listening (Recent active reads from MongoDB - Signed-in only) */}
      {!isGuest && recentItems.length > 0 && (
        <section className="section-block">
          <div className="section-heading">
            <div>
              <p className="mono-eyebrow">Pick up where you left off</p>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="bi bi-book-half" style={{ color: 'var(--app-accent)' }} />
                Continue reading & listening
              </h2>
            </div>
            <button className="ghost-button" onClick={() => setPage?.('profile')} type="button">
              View all history
            </button>
          </div>
          <div className="home-recent-resume-grid">
            {recentItems.map((item) => (
              <div className="home-recent-resume-card" key={item.id}>
                <img src={getCover(item)} alt="" className="resume-card-cover" loading="lazy" />
                <div className="resume-card-info">
                  <span className="mono-eyebrow">
                    {item.type === 'ebook' ? 'Ebook' : 'Audiobook'} · {item.percent}% completed
                  </span>
                  <h4 title={item.title}>{item.title}</h4>
                  <small>{item.chapterTitle || item.author}</small>
                  <div className="resume-card-bar">
                    <div className="resume-card-fill" style={{ width: `${item.percent}%` }} />
                  </div>
                </div>
                <div className="resume-card-actions">
                  <button
                    type="button"
                    className="primary-button resume-card-btn"
                    onClick={() => {
                      const chQuery = typeof item.chapterIndex === 'number' && item.chapterIndex > 0 ? `&chapter=${item.chapterIndex}` : ''
                      navigateTo(item.type === 'ebook' ? 'read' : 'listen', { query: `id=${item.id}${chQuery}` })
                    }}
                  >
                    Resume <i className="bi bi-arrow-right" />
                  </button>
                  {onRemoveShelfBook && (
                    <button
                      type="button"
                      className="ghost-button resume-card-dismiss-btn"
                      onClick={(e) => handleDismissRecent(e, item.id)}
                      title="Remove from reading shelf"
                      aria-label={`Remove ${item.title || 'book'} from reading shelf`}
                    >
                      <i className="bi bi-x-lg" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Saved books (Quick shelf for authenticated readers) */}
      {!isGuest && savedBooksList.length > 0 && (
        <section className="section-block">
          <div className="section-heading">
            <div>
              <p className="mono-eyebrow">Your shelf</p>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="bi bi-bookmark-heart-fill" style={{ color: 'var(--app-accent)' }} />
                Saved books
              </h2>
            </div>
            <button className="ghost-button" onClick={() => setPage?.('profile')} type="button">
              View all ({favorites.length})
            </button>
          </div>
          <BookCarousel
            books={savedBooksList}
            favorites={favorites}
            onDetail={onDetail}
            onFavorite={onFavorite}
            onRead={onRead}
            viewCounts={viewCounts}
            viewerCounts={viewerCounts}
          />
        </section>
      )}

      {/* Personalized For You (Gutenberg & LibriVox personalized content) */}
      {(forYouLoading || forYou.length > 0) && (
        <ExternalRowSection
          eyebrow="Picked for you"
          icon="bi-person-heart"
          items={forYou}
          loading={forYouLoading}
          onDetail={onDetail}
          title="For You"
        />
      )}

      {/* Recommended for your shelf */}
      <BookRowSection
        books={recommended}
        eyebrow="Curated for your taste"
        favorites={favorites}
        icon="bi-stars"
        loading={recommendedLoading}
        onDetail={onDetail}
        onFavorite={onFavorite}
        onRead={onRead}
        title="Recommended for you"
        viewCounts={viewCounts}
        viewerCounts={viewerCounts}
      />

      {/* Hot books - prioritized logic: highest views, library books, user books >= 1000 views */}
      <BookRowSection
        books={hotBooks}
        eyebrow="Community & library favorites"
        favorites={favorites}
        icon="bi-fire"
        loading={hotBooksLoading}
        onDetail={onDetail}
        onFavorite={onFavorite}
        onRead={onRead}
        title="Hot books"
        viewCounts={viewCounts}
        viewerCounts={viewerCounts}
      />

      {/* Just added - New books */}
      <BookRowSection
        books={booksLoading ? [] : newBooks}
        eyebrow="Just added"
        favorites={favorites}
        icon="bi-clock-history"
        loading={booksLoading}
        onDetail={onDetail}
        onFavorite={onFavorite}
        onRead={onRead}
        title="New books"
        viewCounts={viewCounts}
        viewerCounts={viewerCounts}
      />

      {/* People share their own stories & audio (tagged: stories) */}
      <section className="section-block community-stories-section">
        <div className="section-heading">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <p className="mono-eyebrow" style={{ margin: 0 }}>Community Voices</p>
              <span className="community-tag-badge">#stories</span>
            </div>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="bi bi-chat-heart" style={{ color: 'var(--app-accent)' }} />
              People share their own stories & audio
            </h2>
          </div>
          <button
            className="ghost-button"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.history.pushState({}, '', '/?tab=story')
              }
              setPage?.('write')
            }}
            type="button"
          >
            <i className="bi bi-mic" /> Share a story
          </button>
        </div>

        {storiesLoading ? (
          <CarouselSkeleton />
        ) : stories.length > 0 ? (
          <div className="community-stories-scroll-container">
            <div className="community-stories-grid">
              {stories.map((story) => {
                const sId = story.id || story._id
                return (
                  <article className="community-story-card" key={sId}>
                    <div className="story-card-header">
                      <div className="story-card-avatar">
                        {story.authorAvatar ? (
                          <img alt={story.authorName} src={story.authorAvatar} />
                        ) : (
                          <span>{(story.authorName || 'R')[0].toUpperCase()}</span>
                        )}
                      </div>
                      <div className="story-card-meta">
                        <strong>{story.authorName || 'Reader'}</strong>
                        <small>{timeAgo(story.createdAt)}</small>
                      </div>
                      {story.type === 'audio-story' ? (
                        <span className="story-type-badge audio-type">
                          <i className="bi bi-soundwave" /> Audio
                        </span>
                      ) : (
                        <span className="story-type-badge text-type">
                          <i className="bi bi-file-text" /> Story
                        </span>
                      )}
                    </div>

                    {story.coverUrl && (
                      <div className="story-card-cover">
                        <img
                          alt={story.title}
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none'
                          }}
                          src={story.coverUrl}
                        />
                      </div>
                    )}

                    <h4 className="story-card-title">{story.title}</h4>
                    <p className="story-card-snippet">{story.content}</p>

                    {story.audioUrl && (
                      <div className="story-card-audio">
                        <audio controls preload="none" src={story.audioUrl} />
                      </div>
                    )}

                    <div className="story-card-tags">
                      {(story.tags || ['stories']).map((tag, tIdx) => (
                        <span className="story-pill-tag" key={tIdx}>#{tag}</span>
                      ))}
                    </div>

                    <div className="story-card-footer">
                      <button
                        className={`story-like-btn ${story.isLiked ? 'liked' : ''}`}
                        onClick={() => toggleStoryLike(sId)}
                        type="button"
                        aria-label={`Like story by ${story.authorName || 'Reader'}`}
                      >
                        <i className={`bi ${story.isLiked ? 'bi-heart-fill' : 'bi-heart'}`} />
                        <span>{story.likesCount || 0}</span>
                      </button>
                      <span className="story-views-count">
                        <i className="bi bi-eye" /> {story.views || 0} views
                      </span>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="community-stories-empty">
            <p>No community stories shared yet. Be the first to share your reflection or voice recording!</p>
            <button
              className="primary-button"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.history.pushState({}, '', '/?tab=story')
                }
                setPage?.('write')
              }}
              type="button"
            >
              <i className="bi bi-mic" /> Share your story
            </button>
          </div>
        )}
      </section>

      {/* People share their own books (tagged: audiobooks, ebooks) */}
      <section className="section-block community-books-section">
        <div className="section-heading">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <p className="mono-eyebrow" style={{ margin: 0 }}>Community Authors</p>
              <span className="community-tag-badge">#ebooks</span>
              <span className="community-tag-badge">#audiobooks</span>
            </div>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="bi bi-pen" style={{ color: 'var(--app-accent)' }} />
              People share their own books
            </h2>
          </div>
          <button
            className="ghost-button"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.history.pushState({}, '', '/?tab=write')
              }
              setPage?.('write')
            }}
            type="button"
          >
            <i className="bi bi-plus-lg" /> Write a book
          </button>
        </div>

        {communityBooksLoading ? (
          <CarouselSkeleton />
        ) : communityBooks.length > 0 ? (
          <BookCarousel
            books={communityBooks}
            favorites={favorites}
            onDetail={onDetail}
            onFavorite={onFavorite}
            onRead={onRead}
            viewCounts={viewCounts}
            viewerCounts={viewerCounts}
          />
        ) : (
          <div className="community-stories-empty">
            <p>No community books published yet. Write your own book and get featured after editorial review!</p>
            <button
              className="primary-button"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.history.pushState({}, '', '/?tab=write')
                }
                setPage?.('write')
              }}
              type="button"
            >
              <i className="bi bi-pen" /> Start writing
            </button>
          </div>
        )}
      </section>

      {/* Hot ebooks */}
      <ExternalRowSection
        eyebrow="Popular on Gutenberg"
        icon="bi-journal-bookmark"
        items={hotEbooks}
        loading={hotEbooksLoading}
        onDetail={onDetail}
        title="Hot ebooks"
      />

      {/* Hot audiobooks */}
      <ExternalRowSection
        eyebrow="Fresh from LibriVox"
        icon="bi-headphones"
        items={hotAudiobooks}
        loading={hotAudiobooksLoading}
        onDetail={onDetail}
        title="Hot audiobooks"
      />
    </div>
  )
}

function BookRowSection({
  actionLabel,
  books,
  eyebrow,
  favorites,
  icon,
  loading,
  onAction,
  onDetail,
  onFavorite,
  onRead,
  title,
  viewCounts,
  viewerCounts,
}) {
  return (
    <section className="section-block">
      <div className="section-heading">
        <div>
          <p className="mono-eyebrow">{eyebrow}</p>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {icon && <i className={`bi ${icon}`} style={{ color: 'var(--app-accent)' }} />}
            {title}
          </h2>
        </div>
        {onAction && (
          <button className="ghost-button" onClick={onAction} type="button">
            {actionLabel}
          </button>
        )}
      </div>
      {loading ? (
        <CarouselSkeleton />
      ) : (
        <BookCarousel
          books={books}
          favorites={favorites}
          onDetail={onDetail}
          onFavorite={onFavorite}
          onRead={onRead}
          viewCounts={viewCounts}
          viewerCounts={viewerCounts}
        />
      )}
    </section>
  )
}

function ExternalRowSection({ eyebrow, icon, items, loading, onDetail, title }) {
  return (
    <section className="section-block">
      <div className="section-heading">
        <div>
          <p className="mono-eyebrow">{eyebrow}</p>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {icon && <i className={`bi ${icon}`} style={{ color: 'var(--app-accent)' }} />}
            {title}
          </h2>
        </div>
      </div>
      {loading ? <CarouselSkeleton /> : <ExternalMediaCarousel items={items} onDetail={onDetail} />}
    </section>
  )
}

function CarouselSkeleton() {
  return (
    <div className="book-carousel">
      <div className="book-carousel-track">
        {Array.from({ length: 6 }).map((_, index) => (
          <div className="book-carousel-item" key={index}>
            <div className="book-card-skeleton" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default HomePage
