function ReaderFrame({
  activeBook,
  chapterPage,
  currentChapter,
  currentPage,
  currentReaderParagraphs,
  guestChapterLimit,
  hasReachedGuestLimit,
  onLoginRequired,
  onMovePage,
  readerMessage,
  readerStatus,
  readerUrl,
  totalPages,
}) {
  return (
    <article className="reader-frame">
      <div className="reader-chapter-header">
        <div>
          <p className="mono-eyebrow">Reading section</p>
          <h2>{currentChapter.title}</h2>
        </div>
        <div className="reader-page-actions">
          <button disabled={currentPage === 1} onClick={() => onMovePage(-1)} type="button">
            <i className="bi bi-chevron-left" />
          </button>
          <span>Page {chapterPage}</span>
          <button disabled={currentPage === totalPages} onClick={() => onMovePage(1)} type="button">
            <i className="bi bi-chevron-right" />
          </button>
        </div>
      </div>
      {readerStatus === 'loading' ? (
        <div className="reader-text-state">
          <span className="reader-spinner" />
          <p>Loading chapter text...</p>
        </div>
      ) : currentReaderParagraphs.length ? (
        <div className="reader-text-page" aria-live="polite">
          <p className="reader-page-kicker">{currentChapter.title} - Page {chapterPage}</p>
          {currentReaderParagraphs.map((paragraph, index) => (
            <p key={`${currentPage}-${index}`}>{paragraph}</p>
          ))}
        </div>
      ) : readerUrl ? (
        <div className="reader-source-fallback">
          <p>{readerMessage || 'Readable text is not available for this generated page.'}</p>
          <a href={readerUrl} rel="noreferrer" target="_blank">Open original reader</a>
          <iframe loading="lazy" src={readerUrl} title={`Read ${activeBook.title}`} />
        </div>
      ) : (
        <p>This book does not include a readable text link.</p>
      )}
      {hasReachedGuestLimit && (
        <div className="reader-lock">
          <div>
            <i className="bi bi-lock-fill" />
            <h2>You need to be a BookWorm member to keep reading</h2>
            <p>Guests can preview the first {guestChapterLimit} chapters. Log in to unlock the rest and keep your reading progress.</p>
            <button className="primary-button" onClick={onLoginRequired} type="button">
              <i className="bi bi-box-arrow-in-right" />
              Log in to keep reading
            </button>
          </div>
        </div>
      )}
    </article>
  )
}

export default ReaderFrame
