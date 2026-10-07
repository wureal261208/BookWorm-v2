import BookGrid from '../books/BookGrid'

function DetailRecommendations({
  books = [],
  category = '',
  isAudio = false,
  loading = false,
  favorites = [],
  onDetail,
  onFavorite,
  onRead,
  viewCounts = {},
  viewerCounts = {},
  isBottomSection = false,
}) {
  const displayCategory = category ? category.replace(/Browsing:\s*/i, '').trim() : ''

  return (
    <section className={`section-block recommendations-section ${isBottomSection ? 'detail-bottom-recommendations' : ''}`}>
      <div className="section-heading">
        <div>
          <p className="mono-eyebrow">
            <i className="bi bi-fire" style={{ marginRight: '6px', color: '#ea580c' }} />
            {displayCategory ? `Thể loại: ${displayCategory} · Nhiều lượt xem nhất` : 'Được xem nhiều nhất'}
          </p>
          <h2>{isAudio ? 'Audiobooks cùng thể loại bạn có thể thích' : 'Sách cùng thể loại bạn có thể thích'}</h2>
        </div>
        {books.length > 0 && (
          <span className="comments-count-pill">
            <i className="bi bi-collection" style={{ marginRight: '4px' }} />
            {books.length} {isAudio ? 'audiobooks' : 'cuốn'}
          </span>
        )}
      </div>

      {loading && !books.length ? (
        <div className="empty-state" style={{ minHeight: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          <span className="admin-spin-small" /> Đang tải gợi ý sách liên quan...
        </div>
      ) : books.length > 0 ? (
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
        <div className="empty-state">
          <i className="bi bi-book-half" style={{ fontSize: '1.8rem', color: 'var(--app-muted)', marginBottom: '8px', display: 'block' }} />
          <p>Chưa có sách cùng thể loại nào khác trong danh mục này.</p>
        </div>
      )}
    </section>
  )
}

export default DetailRecommendations
