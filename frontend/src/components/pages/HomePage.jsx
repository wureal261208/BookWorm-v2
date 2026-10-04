import { useEffect, useState } from 'react'
import { auth } from '../../features/auth-firebase/firebaseConfig'
import { publicApiFetch } from '../../utils/apiClient'
import { GENRE_SLIDES } from '../../utils/genreSlides'
import BookGrid from '../books/BookGrid'
import BookCarousel from '../books/BookCarousel'
import ExternalMediaCarousel from '../books/ExternalMediaCarousel'
import PromoBanner from '../books/PromoBanner'

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

const GENRE_EMOJIS = {
  Romance: '💖',
  Fantasy: '🧙‍♂️',
  'Science Fiction': '🚀',
  Mystery: '🕵️‍♂️',
  Horror: '👻',
  History: '📜',
  Literary: '📖',
  Biography: '👤',
}

function HomePage({
  books = [],
  booksLoading = false,
  favorites,
  onDetail,
  onFavorite,
  onRead,
  onSelectGenre,
  progress = {},
  setPage,
  viewCounts,
  viewerCounts,
}) {
  const [recommended, recommendedLoading] = useBookRow('limit=16&sort=views&page=2')
  const [hotEbooks, hotEbooksLoading] = useExternalRow('/api/content?type=ebook&limit=16')
  const [hotAudiobooks, hotAudiobooksLoading] = useExternalRow('/api/content?type=audiobook&limit=16')
  const isGuest = !auth.currentUser
  const [forYou, forYouLoading] = useExternalRow(isGuest ? null : '/api/content/for-you?limit=16')

  const newBooks = books.slice(0, 16)
  const continueReading = books.filter((book) => (progress[book.id] || 0) > 0 && (progress[book.id] || 0) < 100).slice(0, 4)

  return (
    <div className="home-page">
      {/* Featured visual banner */}
      <PromoBanner onSelectGenre={onSelectGenre} />

      {/* Genre quick-access navigation strip */}
      <nav aria-label="Quick genre navigation" className="home-genre-strip">
        <button
          className="home-genre-chip"
          onClick={() => onSelectGenre?.('')}
          type="button"
        >
          <span>✨</span>
          <span>All genres</span>
        </button>
        {GENRE_SLIDES.map((slide) => (
          <button
            key={slide.id}
            className="home-genre-chip"
            onClick={() => onSelectGenre?.(slide.topic)}
            type="button"
          >
            <span>{GENRE_EMOJIS[slide.topic] || '📚'}</span>
            <span>{slide.topic}</span>
          </button>
        ))}
      </nav>

      {/* Continue Reading shelf (only when user has active reading progress) */}
      {continueReading.length > 0 && (
        <section className="section-block">
          <div className="section-heading">
            <div>
              <p className="mono-eyebrow">Pick up again</p>
              <h2>Continue reading</h2>
            </div>
            <button className="ghost-button" onClick={() => setPage('profile')} type="button">
              My progress
            </button>
          </div>
          <BookGrid
            books={continueReading}
            favorites={favorites}
            onDetail={onDetail}
            onFavorite={onFavorite}
            onRead={onRead}
            progress={progress}
            variant="read"
            viewCounts={viewCounts}
            viewerCounts={viewerCounts}
          />
        </section>
      )}

      {/* Personalized For You (Logged-in readers) */}
      {!isGuest && (forYouLoading || forYou.length > 0) && (
        <ExternalRowSection
          eyebrow="Picked for you"
          items={forYou}
          loading={forYouLoading}
          title="For You"
        />
      )}

      {/* Recommended for your shelf */}
      <BookRowSection
        books={recommended}
        eyebrow="For your shelf"
        favorites={favorites}
        loading={recommendedLoading}
        onDetail={onDetail}
        onFavorite={onFavorite}
        onRead={onRead}
        title="Recommended for you"
        viewCounts={viewCounts}
        viewerCounts={viewerCounts}
      />

      {/* Just added - New books */}
      <BookRowSection
        books={booksLoading ? [] : newBooks}
        eyebrow="Just added"
        favorites={favorites}
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
        title="Hot ebooks"
      />

      {/* Hot audiobooks */}
      <ExternalRowSection
        eyebrow="Fresh from LibriVox"
        icon="bi-headphones"
        items={hotAudiobooks}
        loading={hotAudiobooksLoading}
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
          <h2>{title}</h2>
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

function ExternalRowSection({ eyebrow, icon, items, loading, title }) {
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
      {loading ? <CarouselSkeleton /> : <ExternalMediaCarousel items={items} />}
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
