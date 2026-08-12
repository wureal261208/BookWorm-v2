import { useState } from 'react'
import DetailChapters from '../detail/DetailChapters'
import DetailComments, { COMMENT_PREVIEW_LIMIT } from '../detail/DetailComments'
import DetailHero from '../detail/DetailHero'
import DetailRecommendations from '../detail/DetailRecommendations'
import DetailTabs from '../detail/DetailTabs'
import MembershipRequiredModal from '../detail/MembershipRequiredModal'
import { getAuthor, getCategory } from '../../utils/bookUtils'
import { getBookChapters, getTotalPages } from '../../utils/chapterUtils'

function BookDetailPage({
  account,
  book,
  books = [],
  checkpoints = {},
  comments = [],
  favorites,
  onBack,
  onChapter,
  onComment,
  onDetail,
  onFavorite,
  onHome,
  onAuth,
  onRead,
  onRent,
  rentals = [],
  viewCount = 0,
  viewCounts = {},
  viewerCounts = {},
}) {
  const [commentText, setCommentText] = useState('')
  const [showAllComments, setShowAllComments] = useState(false)
  const [showSavePrompt, setShowSavePrompt] = useState(false)
  const [showChapterPrompt, setShowChapterPrompt] = useState(false)
  const [activeDetailTab, setActiveDetailTab] = useState('chapters')

  if (!book) {
    return (
      <div className="empty-state">
        Select a book first.
        <button className="primary-button" onClick={onHome || onBack} type="button">Go home</button>
      </div>
    )
  }

  const totalReads = (book.download_count || 0) + viewCount
  const totalPages = getTotalPages(book)
  const detailChapters = getBookChapters(book, totalPages)
  const totalChapters = detailChapters.length
  const language = book.languages?.join(', ').toUpperCase() || 'EN'
  const readingTime = Math.max(1, Math.round(totalPages * 2.2))
  const rating = Math.min(5, Math.max(3.8, (book.download_count || 1000) / 25000 + 3.6)).toFixed(1)
  const checkpointKey = getCheckpointKey(account, book)
  const checkpoint = account?.role === 'guest' ? null : checkpoints[checkpointKey]
  const latestComments = getLatestComments(comments)
  const visibleComments = showAllComments ? latestComments : latestComments.slice(0, COMMENT_PREVIEW_LIMIT)
  const hasMoreComments = latestComments.length > COMMENT_PREVIEW_LIMIT
  const recommendations = books
    .filter((item) => item.id !== book.id)
    .map((item) => ({
      book: item,
      score:
        Number(getCategory(item) === getCategory(book)) * 3 +
        Number(getAuthor(item) === getAuthor(book)) * 2 +
        Number(Boolean(item.subjects?.some((subject) => book.subjects?.includes(subject)))),
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

    onComment(book.id, text)
    setCommentText('')
  }

  const handleSaveBook = () => {
    if (account?.role === 'guest') {
      setShowSavePrompt(true)
      return
    }

    onFavorite(book.id)
  }

  const handleChapterClick = (chapter) => {
    if (account?.role === 'guest' && chapter.number > 3) {
      setShowChapterPrompt(true)
      return
    }

    onChapter(book, chapter)
  }

  return (
    <section className="detail-page">
      <DetailHero
        book={book}
        checkpoint={checkpoint}
        favorites={favorites}
        language={language}
        onAuth={onAuth}
        onRead={onRead}
        onRent={onRent}
        rental={rentals.find((item) => item.id === book.id)}
        onSaveBook={handleSaveBook}
        onToggleSavePrompt={setShowSavePrompt}
        rating={rating}
        readingTime={readingTime}
        showSavePrompt={showSavePrompt}
        totalChapters={totalChapters}
        totalPages={totalPages}
        totalReads={totalReads}
      />

      <DetailTabs activeTab={activeDetailTab} onChange={setActiveDetailTab} />

      {activeDetailTab === 'chapters' && (
        <DetailChapters account={account} chapters={detailChapters} onChapterClick={handleChapterClick} />
      )}

      {activeDetailTab === 'comments' && (
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

      {activeDetailTab === 'more' && (
        <DetailRecommendations
          books={recommendations}
          favorites={favorites}
          onDetail={onDetail}
          onFavorite={onFavorite}
          onRead={onRead}
          onRent={onRent}
          rentals={rentals}
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
