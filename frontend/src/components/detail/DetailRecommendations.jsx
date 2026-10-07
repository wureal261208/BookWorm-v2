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
  const rawCat = Array.isArray(category) ? (category[0] || '') : (category || '')
  const displayCategory = typeof rawCat === 'string' ? rawCat.replace(/Browsing:\s*/i, '').trim() : String(rawCat || '').trim()

  return (
    <section className={`section-block recommendations-section ${isBottomSection ? 'detail-bottom-recommendations' : ''}`}>
      <div className="section-heading">
        <div>
          <p className="mono-eyebrow">
            <i className="bi bi-fire" style={{ marginRight: '6px', color: '#ea580c' }} />
            {displayCategory ? `Category: ${displayCategory} · Most viewed` : 'Most viewed'}
          </p>
          <h2>{isAudio ? 'Related audiobooks you may like' : 'Related books you may like'}</h2>
        </div>
        {books.length > 0 && (
          <span className="comments-count-pill">
            <i className="bi bi-collection" style={{ marginRight: '4px' }} />
            {books.length} {isAudio ? (books.length === 1 ? 'audiobook' : 'audiobooks') : (books.length === 1 ? 'title' : 'titles')}
          </span>
        )}
      </div>

      {loading && !books.length ? (
        <div className="empty-state" style={{ minHeight: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          <span className="admin-spin-small" /> Loading related titles...
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
          <p>No other titles found in this category yet.</p>
        </div>
      )}
    </section>
  )
}

export default DetailRecommendations
