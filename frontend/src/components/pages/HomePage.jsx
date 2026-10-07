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

function HomePage({
  account,
  books = [],
  booksLoading = false,
  favorites = [],
  onDetail,
  onFavorite,
  onRead,
  onSelectGenre,
  preferenceVersion = 0,
  progress = {},
  setPage,
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
  const [recentItems, setRecentItems] = useState([])

  useEffect(() => {
    if (isGuest) {
      setRecentItems([])
      return undefined
    }

    let ignore = false
    apiFetch('/api/users/me/progress')
      .then((data) => {
        if (!ignore && Array.isArray(data?.progress)) {
          const mapped = data.progress.map((p) => ({
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
  }, [isGuest])

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
