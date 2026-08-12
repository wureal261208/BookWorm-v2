import { useState } from 'react'

function ReaderChapterPanel({
  chapters,
  currentChapterIndex,
  currentPage,
  guestChapterLimit,
  isGuest,
  onChapter,
  onChapterPage,
}) {
  const [openChapterIndex, setOpenChapterIndex] = useState(currentChapterIndex)

  function handleChapterClick(index) {
    setOpenChapterIndex(index)
    onChapter(index)
  }

  function handlePageToggle(index) {
    setOpenChapterIndex((current) => (current === index ? null : index))
  }

  return (
    <aside className="chapter-panel" aria-label="Book contents">
      <div>
        <p className="mono-eyebrow">Contents</p>
        <h2>Chapters</h2>
      </div>
      <div className="chapter-list">
        {chapters.map((chapter, index) => {
          const isActive = index === currentChapterIndex
          const isOpen = openChapterIndex === index
          const isLocked = isGuest && index + 1 > guestChapterLimit
          const pageNumbers = Array.from({ length: chapter.pages }, (_, pageIndex) => pageIndex + 1)

          return (
            <div className="chapter-nav-group" key={chapter.id || `${chapter.title}-${index}`}>
              <button
                aria-current={isActive ? 'true' : undefined}
                className={`chapter-nav-button ${isActive ? 'active' : ''}`}
                onClick={() => handleChapterClick(index)}
                type="button"
              >
                <span className="chapter-nav-number">{chapter.number || index + 1}</span>
                <span className="chapter-nav-copy">
                  <strong>{chapter.title || chapter.label}</strong>
                  <small>
                    {chapter.pages} {chapter.pages === 1 ? 'page' : 'pages'} · starts page {chapter.startPage}
                  </small>
                </span>
                {isLocked && <i className="bi bi-lock-fill" />}
              </button>
              {(isActive || isOpen) && (
                <>
                  <button className="chapter-page-toggle" onClick={() => handlePageToggle(index)} type="button">
                    <span>Page in chapter</span>
                    <small>{chapter.pages}</small>
                    <i className={`bi ${isOpen ? 'bi-chevron-up' : 'bi-chevron-down'}`} />
                  </button>
                  {isOpen && (
                    <div className="chapter-sidebar-pages" aria-label={`${chapter.title} pages`}>
                      {pageNumbers.map((pageNumber) => {
                        const absolutePage = chapter.startPage + pageNumber - 1
                        const isCurrentPage = absolutePage === currentPage

                        return (
                          <button
                            aria-current={isCurrentPage ? 'page' : undefined}
                            className={isCurrentPage ? 'active' : ''}
                            key={`${chapter.id || index}-page-${pageNumber}`}
                            onClick={() => onChapterPage(index, pageNumber)}
                            type="button"
                          >
                            {pageNumber}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>
    </aside>
  )
}

export default ReaderChapterPanel
