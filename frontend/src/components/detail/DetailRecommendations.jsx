import BookGrid from '../books/BookGrid'

function DetailRecommendations({ books, favorites, onDetail, onFavorite, onRead, viewCounts, viewerCounts }) {
  return (
    <section className="section-block recommendations-section">
      <div className="section-heading">
        <h2>More Books You Might Like</h2>
      </div>
      {books.length ? (
        <BookGrid
          books={books}
          favorites={favorites}
          onDetail={onDetail}
          onFavorite={onFavorite}
          onRead={onRead}
          viewCounts={viewCounts}
          viewerCounts={viewerCounts}
        />
      ) : (
        <div className="empty-state">No similar books yet. Load more books in Discover to expand recommendations.</div>
      )}
    </section>
  )
}

export default DetailRecommendations
