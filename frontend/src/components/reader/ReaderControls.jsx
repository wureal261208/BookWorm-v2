function ReaderControls({
  chapterPage,
  chapterProgressValue,
  chapters,
  currentChapter,
  currentChapterIndex,
  guestChapterLimit,
  isFinished,
  isGuest,
  onChapter,
  onMarkChapterDone,
  onReaderFontSize,
  onReaderTheme,
  progressValue,
  readerFontSize,
  readerTheme,
}) {
  return (
    <div className="reader-controls">
      <div className="reader-control-card reader-theme-control">
        <label>
          Theme
          <select value={readerTheme} onChange={(event) => onReaderTheme(event.target.value)}>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </div>
      <div className="reader-control-card reader-font-size-control">
        <label>
          Font size
          <select value={readerFontSize} onChange={(event) => onReaderFontSize(Number(event.target.value))}>
            <option value="16">Small</option>
            <option value="18">Medium</option>
            <option value="20">Large</option>
            <option value="24">Extra large</option>
          </select>
        </label>
      </div>
      <div className="reader-control-card reader-chapter-control">
        <label>
          Chapter
          <select value={currentChapterIndex} onChange={(event) => onChapter(Number(event.target.value))}>
            {chapters.map((chapter, index) => (
              <option key={chapter.id || `${chapter.title}-${index}`} value={index}>
                {chapter.title || chapter.label}
                {isGuest && index + 1 > guestChapterLimit ? ' (locked)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="reader-page-meter">
        <span>{currentChapter.label} - Page {chapterPage} / {currentChapter.pages}</span>
        <progress max="100" value={chapterProgressValue} />
        <div className="reader-progress-meta">
          <small>Chapter {chapterProgressValue}%</small>
          <small>Book {progressValue}%</small>
          {isGuest && <small>Guest preview: first {guestChapterLimit} chapters</small>}
          {isFinished && <small className="finished-status">Finished</small>}
        </div>
      </div>
      <div className="reader-control-card reader-quick-actions">
        <button disabled={chapterPage >= currentChapter.pages} onClick={onMarkChapterDone} type="button">
          <i className="bi bi-check2-circle" />
          Mark chapter done
        </button>
      </div>
    </div>
  )
}

export default ReaderControls
