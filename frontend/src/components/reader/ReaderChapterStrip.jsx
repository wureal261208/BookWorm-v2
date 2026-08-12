import { useEffect, useRef } from 'react'

function ReaderChapterStrip({ chapters, currentChapterIndex, isGuest, guestChapterLimit, onChapter }) {
  const stripRef = useRef(null)
  const activeButtonRef = useRef(null)

  useEffect(() => {
    activeButtonRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    })
  }, [currentChapterIndex])

  return (
    <div className="reader-chapter-strip" aria-label="Book chapters" ref={stripRef}>
      {chapters.map((item) => (
        <button
          aria-current={item.index === currentChapterIndex ? 'true' : undefined}
          className={item.index === currentChapterIndex ? 'active' : ''}
          key={item.id}
          onClick={() => onChapter(item.index)}
          ref={item.index === currentChapterIndex ? activeButtonRef : null}
          type="button"
        >
          <small>{item.position}</small>
          <span>{item.chapter.number || item.index + 1}</span>
          <strong>{item.chapter.label}</strong>
          {isGuest && item.index + 1 > guestChapterLimit && <i className="bi bi-lock-fill" />}
        </button>
      ))}
    </div>
  )
}

export default ReaderChapterStrip
