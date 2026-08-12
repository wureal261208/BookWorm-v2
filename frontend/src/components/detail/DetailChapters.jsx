function DetailChapters({ account, chapters, onChapterClick }) {
  return (
    <section className="section-block detail-chapters-section">
      <div className="section-heading">
        <div>
          <p className="mono-eyebrow">Table of contents</p>
          <h2>Chapters</h2>
        </div>
        {account?.role === 'guest' && <span>Guest preview includes chapters 1-3</span>}
      </div>
      <div className="detail-chapter-grid">
        {chapters.map((chapter) => (
          <button key={chapter.id} onClick={() => onChapterClick(chapter)} type="button">
            <span>{chapter.number}</span>
            <div>
              <strong>{chapter.title}</strong>
              <small>{chapter.pages} pages - starts page {chapter.startPage}</small>
            </div>
            <i className={`bi ${account?.role === 'guest' && chapter.number > 3 ? 'bi-lock-fill' : 'bi-arrow-right'}`} />
          </button>
        ))}
      </div>
    </section>
  )
}

export default DetailChapters
