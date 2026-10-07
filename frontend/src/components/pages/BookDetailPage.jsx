import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import DetailChapters from '../detail/DetailChapters'
import DetailComments from '../detail/DetailComments'
import DetailHero from '../detail/DetailHero'
import DetailRecommendations from '../detail/DetailRecommendations'
import DetailTabs from '../detail/DetailTabs'
import MembershipRequiredModal from '../detail/MembershipRequiredModal'
import { getAuthor, getCategory } from '../../utils/bookUtils'
import { getBookChapters, getTotalPages, hasExplicitChapters } from '../../utils/chapterUtils'
import { apiFetch, publicApiFetch } from '../../utils/apiClient'

function BookDetailPage({
  account,
  book,
  books = [],
  checkpoints = {},
  comments = [],
  favorites = [],
  shelf = [],
  onBack,
  onChapter,
  onComment,
  onDetail,
  onFavorite,
  onUpdateShelfStatus,
  onRemoveShelfBook,
  onHome,
  onAuth,
  onListen,
  onRead,
  viewCount = 0,
  viewCounts = {},
  viewerCounts = {},
}) {
  const [searchParams] = useSearchParams()
  const queryId = searchParams.get('id')

  const [fetchedBook, setFetchedBook] = useState(null)
  const [fetchedChapters, setFetchedChapters] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [showSavePrompt, setShowSavePrompt] = useState(false)
  const [showChapterPrompt, setShowChapterPrompt] = useState(false)
  const [activeDetailTab, setActiveDetailTab] = useState('chapters')
  const [ratingData, setRatingData] = useState({ average: 0, count: 0, userScore: null })
  const [relatedBooks, setRelatedBooks] = useState([])
  const [relatedLoading, setRelatedLoading] = useState(false)

  useEffect(() => {
    if (!queryId) return
    const activeId = book?._id || book?.id
    if (activeId && String(activeId) === String(queryId)) return

    let ignore = false
    setLoading(true)
    setError('')

    publicApiFetch(`/api/books/${queryId}`)
      .then((data) => {
        if (!ignore && data?.book) {
          setFetchedBook(data.book)
        } else if (!ignore) {
          return publicApiFetch(`/api/content/${queryId}`).then((cData) => {
            if (!ignore && cData) setFetchedBook(cData)
          })
        }
      })
      .catch(() => {
        return publicApiFetch(`/api/content/${queryId}`)
          .then((cData) => {
            if (!ignore && cData) setFetchedBook(cData)
          })
          .catch((err) => {
            if (!ignore) setError(err.message || 'Book not found')
          })
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })

    return () => {
      ignore = true
    }
  }, [queryId, book])

  const currentBook = book || fetchedBook
  const currentCategory = currentBook
    ? (currentBook.category || (Array.isArray(currentBook.categories) && currentBook.categories[0]) || getCategory(currentBook) || 'Classic')
    : 'Classic'
  const isAudio = currentBook
    ? (currentBook.type === 'audiobook' || currentBook.source === 'LibriVox' || currentBook.category === 'Audiobook')
    : false

  // Fetch chapters for ebooks or audiobooks if they don't have explicit chapters
  useEffect(() => {
    if (!currentBook) return
    const targetId = currentBook._id || currentBook.id
    if (!targetId) return
    if (currentBook.chapters?.length > 0) return

    let ignore = false
    publicApiFetch(`/api/content/${targetId}/chapters`)
      .then((data) => {
        if (!ignore && Array.isArray(data?.chapters) && data.chapters.length > 0) {
          setFetchedChapters(data.chapters)
        }
      })
      .catch(() => {})

    return () => {
      ignore = true
    }
  }, [currentBook])

  useEffect(() => {
    const targetId = currentBook?._id || currentBook?.id || queryId
    if (!targetId) return
    let ignore = false
    publicApiFetch(`/api/books/${targetId}/rate`)
      .then((data) => {
        if (!ignore && data?.rating) setRatingData(data.rating)
      })
      .catch(() => {
        publicApiFetch(`/api/content/${targetId}/rate`)
          .then((cData) => {
            if (!ignore && cData?.rating) setRatingData(cData.rating)
          })
          .catch(() => {})
      })
    return () => {
      ignore = true
    }
  }, [currentBook, queryId])

  useEffect(() => {
    if (!currentBook) return
    const currentIdStr = String(currentBook._id || currentBook.id || '')
    let ignore = false
    setRelatedLoading(true)

    async function loadRelated() {
      try {
        let results = []
        const cleanCat = String(currentCategory).replace(/Browsing:\s*/i, '').trim()

        if (isAudio) {
          const params = new URLSearchParams({ type: 'audiobook', limit: '16' })
          if (cleanCat && cleanCat !== 'Audiobook' && cleanCat !== 'Classic') {
            params.set('category', cleanCat)
          }
          const res = await publicApiFetch(`/api/content?${params.toString()}`)
          if (Array.isArray(res?.items) && res.items.length > 0) {
            results = res.items
          } else {
            const fallback = await publicApiFetch('/api/content?type=audiobook&limit=16')
            if (Array.isArray(fallback?.items)) results = fallback.items
          }
        } else {
          const params = new URLSearchParams({ sort: 'views', limit: '16' })
          if (cleanCat && cleanCat !== 'all') {
            params.set('category', cleanCat)
          }
          const res = await publicApiFetch(`/api/books?${params.toString()}`)
          if (Array.isArray(res?.books) && res.books.length > 0) {
            results = res.books
          } else {
            const hot = await publicApiFetch('/api/books?sort=hot&limit=16')
            if (Array.isArray(hot?.books)) results = hot.books
          }
        }

        if (!ignore) {
          setRelatedBooks(results.filter((b) => String(b._id || b.id) !== currentIdStr))
        }
      } catch (_) {
        // Fallback handled by useMemo with props.books
      } finally {
        if (!ignore) setRelatedLoading(false)
      }
    }

    loadRelated()
    return () => {
      ignore = true
    }
  }, [currentBook?._id, currentBook?.id, currentCategory, isAudio])

  const recommendations = useMemo(() => {
    if (!currentBook) return []
    const pool = [...relatedBooks]
    const seen = new Set(pool.map((b) => String(b._id || b.id)))
    const currentIdStr = String(currentBook._id || currentBook.id || '')
    const catLower = String(currentCategory).toLowerCase()

    ;(books || []).forEach((b) => {
      const bId = String(b._id || b.id)
      if (bId && bId !== currentIdStr && !seen.has(bId)) {
        const bCat = String(getCategory(b)).toLowerCase()
        if (bCat.includes(catLower) || catLower.includes(bCat)) {
          pool.push(b)
          seen.add(bId)
        }
      }
    })

    return pool
      .filter((b) => String(b._id || b.id) !== currentIdStr)
      .sort((first, second) => {
        const viewsA = Number(first.views ?? (first.download_count || first.downloadCount || 0))
        const viewsB = Number(second.views ?? (second.download_count || second.downloadCount || 0))
        return viewsB - viewsA
      })
      .slice(0, 8)
  }, [relatedBooks, books, currentBook, currentCategory])

  if (loading) {
    return (
      <section className="detail-page" aria-busy="true">
        <DetailSkeleton />
      </section>
    )
  }

  if (!currentBook) {
    return (
      <div className="empty-state">
        <p>{error || 'Select a book first.'}</p>
        <button className="primary-button" onClick={onHome || onBack} type="button">Go home</button>
      </div>
    )
  }

  const baseReads = typeof currentBook.views === 'number' && currentBook.views > 0
    ? currentBook.views
    : (currentBook.download_count || currentBook.downloadCount || 0)
  const totalReads = baseReads + (Number(viewCount) || 0)
  const totalPages = getTotalPages(currentBook)
  const detailChapters = fetchedChapters.length > 0
    ? fetchedChapters
    : getBookChapters(currentBook, totalPages)
  const totalChapters = detailChapters.length
  const hasChapters = fetchedChapters.length > 0 || hasExplicitChapters(currentBook)
  const effectiveDetailTab = !hasChapters && activeDetailTab === 'chapters' ? 'comments' : activeDetailTab
  const language = Array.isArray(currentBook.languages)
    ? currentBook.languages.join(', ').toUpperCase()
    : (currentBook.language?.toUpperCase() || 'EN')
  const readingTime = Math.max(1, Math.round(totalPages * 2.2))
  const checkpointKey = getCheckpointKey(account, currentBook)
  const checkpoint = account?.role === 'guest' ? null : checkpoints[checkpointKey]
  const currentId = currentBook.id || currentBook._id

  const handleSaveBook = () => {
    if (account?.role === 'guest') {
      setShowSavePrompt(true)
      return
    }

    onFavorite(currentId)
  }

  const handleRateBook = async (score) => {
    if (account?.role === 'guest') {
      setShowSavePrompt(true)
      return
    }

    setRatingData((prev) => {
      const prevScore = prev.userScore
      const newCount = prevScore ? prev.count : prev.count + 1
      const total = (prev.average || 0) * (prev.count || 0) - (prevScore || 0) + score
      const newAvg = Number((total / (newCount || 1)).toFixed(1))
      return { average: newAvg, count: newCount, userScore: score }
    })

    try {
      const res = await apiFetch(`/api/books/${currentId}/rate`, {
        method: 'POST',
        body: { score },
      }).catch(() => {
        return apiFetch(`/api/content/${currentId}/rate`, {
          method: 'POST',
          body: { score },
        })
      })
      if (res?.rating) {
        setRatingData(res.rating)
      }
    } catch (_) {}
  }

  const handleChapterClick = (chapter) => {
    const num = chapter.number || chapter.order || 1
    if (account?.role === 'guest' && num > 3) {
      setShowChapterPrompt(true)
      return
    }

    if (currentBook.type === 'audiobook' || currentBook.source === 'LibriVox') {
      if (onListen) {
        onListen(currentBook, chapter)
      } else {
        onRead(currentBook)
      }
    } else if (onChapter) {
      onChapter(currentBook, chapter)
    } else {
      onRead(currentBook)
    }
  }

  return (
    <section className="detail-page">
      <DetailHero
        account={account}
        book={currentBook}
        checkpoint={checkpoint}
        favorites={favorites}
        shelf={shelf}
        hasChapters={hasChapters}
        language={language}
        onAuth={onAuth}
        onListen={onListen}
        onRead={onRead}
        onSaveBook={handleSaveBook}
        onUpdateShelfStatus={onUpdateShelfStatus}
        onRemoveShelfBook={onRemoveShelfBook}
        onToggleSavePrompt={setShowSavePrompt}
        readingTime={readingTime}
        showSavePrompt={showSavePrompt}
        totalChapters={totalChapters}
        totalPages={totalPages}
        totalReads={totalReads}
        ratingData={ratingData}
        onRateBook={handleRateBook}
      />

      <DetailTabs activeTab={effectiveDetailTab} onChange={setActiveDetailTab} showChapters={hasChapters} />

      {hasChapters && effectiveDetailTab === 'chapters' && (
        <DetailChapters account={account} chapters={detailChapters} onChapterClick={handleChapterClick} />
      )}

      {effectiveDetailTab === 'comments' && (
        <DetailComments
          account={account}
          contentId={currentId}
          onComment={onComment}
        />
      )}

      {effectiveDetailTab === 'more' && (
        <DetailRecommendations
          books={recommendations}
          category={currentCategory}
          isAudio={isAudio}
          loading={relatedLoading}
          favorites={favorites}
          onDetail={onDetail}
          onFavorite={onFavorite}
          onRead={onRead}
          viewCounts={viewCounts}
          viewerCounts={viewerCounts}
        />
      )}

      {effectiveDetailTab !== 'more' && recommendations.length > 0 && (
        <DetailRecommendations
          books={recommendations}
          category={currentCategory}
          isAudio={isAudio}
          loading={relatedLoading}
          favorites={favorites}
          onDetail={onDetail}
          onFavorite={onFavorite}
          onRead={onRead}
          viewCounts={viewCounts}
          viewerCounts={viewerCounts}
          isBottomSection
        />
      )}
      {showChapterPrompt && (
        <MembershipRequiredModal
          id="detail-member-required-title"
          onClose={() => setShowChapterPrompt(false)}
          onLogin={onAuth}
        />
      )}
    </section>
  )
}

function getCheckpointKey(account, book) {
  const accountKey = account?.role === 'guest' ? 'guest' : account?.id || account?.email || 'user'
  return `${accountKey}:${book?.id || book?._id || 'unknown'}`
}

function DetailSkeleton() {
  return (
    <div className="detail-layout detail-skeleton-layout">
      <div className="detail-cover-wrapper">
        <div className="skeleton-box detail-skeleton-cover" />
      </div>
      <div className="detail-copy">
        <div className="skeleton-box detail-skeleton-eyebrow" />
        <div className="skeleton-box detail-skeleton-title" />
        <div className="skeleton-box detail-skeleton-author" />
        <div className="detail-meta-grid">
          <div className="skeleton-box detail-skeleton-metric" />
          <div className="skeleton-box detail-skeleton-metric" />
          <div className="skeleton-box detail-skeleton-metric" />
          <div className="skeleton-box detail-skeleton-metric" />
        </div>
        <div className="detail-skeleton-lines">
          <div className="skeleton-box" style={{ height: '16px', width: '92%' }} />
          <div className="skeleton-box" style={{ height: '16px', width: '85%' }} />
          <div className="skeleton-box" style={{ height: '16px', width: '60%' }} />
        </div>
        <div className="hero-actions" style={{ marginTop: '24px' }}>
          <div className="skeleton-box" style={{ width: '130px', height: '42px', borderRadius: '8px' }} />
          <div className="skeleton-box" style={{ width: '110px', height: '42px', borderRadius: '8px' }} />
        </div>
      </div>
    </div>
  )
}

export default BookDetailPage
