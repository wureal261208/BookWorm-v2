import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import DetailChapters from '../detail/DetailChapters'
import DetailComments, { COMMENT_PREVIEW_LIMIT } from '../detail/DetailComments'
import DetailHero from '../detail/DetailHero'
import DetailRecommendations from '../detail/DetailRecommendations'
import DetailTabs from '../detail/DetailTabs'
import MembershipRequiredModal from '../detail/MembershipRequiredModal'
import { getAuthor, getCategory } from '../../utils/bookUtils'
import { getBookChapters, getTotalPages, hasExplicitChapters } from '../../utils/chapterUtils'
import { publicApiFetch } from '../../utils/apiClient'

function BookDetailPage({
  account,
  book,
  books = [],
  checkpoints = {},
  comments = [],
  favorites = [],
  onBack,
  onChapter,
  onComment,
  onDetail,
  onFavorite,
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

  const [commentText, setCommentText] = useState('')
  const [showAllComments, setShowAllComments] = useState(false)
  const [showSavePrompt, setShowSavePrompt] = useState(false)
  const [showChapterPrompt, setShowChapterPrompt] = useState(false)
  const [activeDetailTab, setActiveDetailTab] = useState('chapters')

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

  if (loading) {
    return (
      <section className="detail-page">
        <p className="settings-copy"><span className="admin-spin-small" /> Loading book details...</p>
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

  const totalReads = (currentBook.download_count || currentBook.downloadCount || 0) + viewCount
  const totalPages = getTotalPages(currentBook)
  const detailChapters = fetchedChapters.length > 0
    ? fetchedChapters
    : getBookChapters(currentBook, totalPages)
  const totalChapters = detailChapters.length
  const hasChapters = fetchedChapters.length > 0 || hasExplicitChapters(currentBook)
  const effectiveDetailTab = !hasChapters && activeDetailTab === 'chapters' ? 'comments' : activeDetailTab
  const language = currentBook.languages?.join(', ').toUpperCase() || currentBook.language?.toUpperCase() || 'EN'
  const readingTime = Math.max(1, Math.round(totalPages * 2.2))
  const checkpointKey = getCheckpointKey(account, currentBook)
  const checkpoint = account?.role === 'guest' ? null : checkpoints[checkpointKey]
  const latestComments = getLatestComments(comments)
  const visibleComments = showAllComments ? latestComments : latestComments.slice(0, COMMENT_PREVIEW_LIMIT)
  const hasMoreComments = latestComments.length > COMMENT_PREVIEW_LIMIT
  const currentId = currentBook.id || currentBook._id
  const recommendations = books
    .filter((item) => (item.id || item._id) !== currentId)
    .map((item) => ({
      book: item,
      score:
        Number(getCategory(item) === getCategory(currentBook)) * 3 +
        Number(getAuthor(item) === getAuthor(currentBook)) * 2 +
        Number(Boolean(item.subjects?.some((subject) => currentBook.subjects?.includes(subject)))),
    }))
    .filter((item) => item.score > 0)
    .sort((first, second) => second.score - first.score || (second.book.download_count || 0) - (first.book.download_count || 0))
    .map((item) => item.book)
    .slice(0, 4)

  const submitComment = () => {
    const text = commentText.trim()

    if (!text) {
      return
    }

    onComment(currentId, text)
    setCommentText('')
  }

  const handleSaveBook = () => {
    if (account?.role === 'guest') {
      setShowSavePrompt(true)
      return
    }

    onFavorite(currentId)
  }

  const handleChapterClick = (chapter) => {
    const num = chapter.number || chapter.order || 1
    if (account?.role === 'guest' && num > 3) {
      setShowChapterPrompt(true)
      return
    }

    if (currentBook.type === 'audiobook' || currentBook.source === 'LibriVox') {
      onListen(currentBook)
    } else if (onChapter) {
      onChapter(currentBook, chapter)
    } else {
      onRead(currentBook)
    }
  }

  return (
    <section className="detail-page">
      <DetailHero
        book={currentBook}
        checkpoint={checkpoint}
        favorites={favorites}
        hasChapters={hasChapters}
        language={language}
        onAuth={onAuth}
        onListen={onListen}
        onRead={onRead}
        onSaveBook={handleSaveBook}
        onToggleSavePrompt={setShowSavePrompt}
        readingTime={readingTime}
        showSavePrompt={showSavePrompt}
        totalChapters={totalChapters}
        totalPages={totalPages}
        totalReads={totalReads}
      />

      <DetailTabs activeTab={effectiveDetailTab} onChange={setActiveDetailTab} showChapters={hasChapters} />

      {hasChapters && effectiveDetailTab === 'chapters' && (
        <DetailChapters account={account} chapters={detailChapters} onChapterClick={handleChapterClick} />
      )}

      {effectiveDetailTab === 'comments' && (
        <DetailComments
          account={account}
          commentText={commentText}
          comments={latestComments}
          hasMoreComments={hasMoreComments}
          onCommentText={setCommentText}
          onSubmitComment={submitComment}
          onToggleComments={() => setShowAllComments((current) => !current)}
          showAllComments={showAllComments}
          visibleComments={visibleComments}
        />
      )}

      {effectiveDetailTab === 'more' && (
        <DetailRecommendations
          books={recommendations}
          favorites={favorites}
          onDetail={onDetail}
          onFavorite={onFavorite}
          onRead={onRead}
          viewCounts={viewCounts}
          viewerCounts={viewerCounts}
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
  return `${accountKey}:${book.id}`
}

function getLatestComments(comments = []) {
  return [...comments].sort((first, second) => {
    const firstTime = new Date(first.createdAt).getTime()
    const secondTime = new Date(second.createdAt).getTime()

    return secondTime - firstTime
  })
}

export default BookDetailPage
