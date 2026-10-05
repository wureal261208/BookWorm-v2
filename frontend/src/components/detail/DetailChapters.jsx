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
        {chapters.map((chapter, index) => {
          const num = chapter.number || chapter.order || index + 1
          const metaText = chapter.duration
            ? chapter.duration
            : chapter.pages
            ? `${chapter.pages} pages - starts page ${chapter.startPage || 1}`
            : 'Complete chapter'

          return (
            <button key={chapter.id || chapter.order || index} onClick={() => onChapterClick(chapter)} type="button">
              <span>{num}</span>
              <div>
                <strong>{chapter.title || `Chapter ${num}`}</strong>
                <small>{metaText}</small>
              </div>
              <i className={`bi ${account?.role === 'guest' && num > 3 ? 'bi-lock-fill' : 'bi-arrow-right'}`} />
            </button>
          )
        })}
      </div>
    </section>
  )
}

export default DetailChapters
