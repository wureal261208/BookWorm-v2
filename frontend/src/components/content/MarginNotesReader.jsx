import { useEffect, useMemo, useState } from 'react'
import { auth } from '../../features/auth-firebase/firebaseConfig'
import { apiFetch, publicApiFetch } from '../../utils/apiClient'

const EXCERPT_LENGTH = 80

function MarginNotesReader({ contentId, chapters = [], activeChapterIndex = 0, onChapterChange }) {
  const isGuest = !auth.currentUser
  const [paragraphs, setParagraphs] = useState([])
  const [notesByParagraph, setNotesByParagraph] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeParagraph, setActiveParagraph] = useState(null)
  const [noteText, setNoteText] = useState('')
  const [posting, setPosting] = useState(false)

  useEffect(() => {
    let ignore = false
    setLoading(true)
    setError('')

    Promise.all([publicApiFetch(`/api/content/${contentId}/text`), publicApiFetch(`/api/content/${contentId}/notes`)])
      .then(([textData, notes]) => {
        if (ignore) return
        setParagraphs(Array.isArray(textData?.paragraphs) ? textData.paragraphs : [])
        const grouped = {}
        for (const note of Array.isArray(notes) ? notes : []) {
          if (!grouped[note.paragraphIndex]) grouped[note.paragraphIndex] = []
          grouped[note.paragraphIndex].push(note)
        }
        setNotesByParagraph(grouped)
      })
      .catch((err) => {
        if (!ignore) setError(err.message)
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })

    return () => {
      ignore = true
    }
  }, [contentId])

  function toggleParagraph(index) {
    setActiveParagraph((current) => (current === index ? null : index))
    setNoteText('')
  }

  async function submitNote(index) {
    const text = noteText.trim()
    if (!text || posting) return

    setPosting(true)
    try {
      const quote = paragraphs[index].slice(0, EXCERPT_LENGTH)
      const note = await apiFetch(`/api/content/${contentId}/notes`, { method: 'POST', body: { paragraphIndex: index, quote, text } })
      setNotesByParagraph((current) => ({ ...current, [index]: [...(current[index] || []), note] }))
      setNoteText('')
    } catch (err) {
      setError(err.message)
    } finally {
      setPosting(false)
    }
  }

  // If chapters are not loaded or empty, split paragraphs into virtual reading sections so we never flood the DOM
  const virtualChapters = useMemo(() => {
    if (chapters && chapters.length > 0) return chapters
    if (!paragraphs.length) return []
    const CHUNK_SIZE = 35
    const totalChunks = Math.ceil(paragraphs.length / CHUNK_SIZE)
    const list = [
      {
        order: 0,
        isIntro: true,
        title: 'Phần mở đầu (Introduction)',
        startParagraph: 0,
        excerpt: paragraphs[0]?.slice(0, 100) || '',
      },
    ]
    for (let i = 1; i < totalChunks; i++) {
      list.push({
        order: i,
        isIntro: false,
        title: `Chương ${i}`,
        startParagraph: i * CHUNK_SIZE,
        excerpt: paragraphs[i * CHUNK_SIZE]?.slice(0, 100) || '',
      })
    }
    return list
  }, [chapters, paragraphs])

  const effectiveChapters = chapters.length > 0 ? chapters : virtualChapters
  const currentChapter = effectiveChapters[activeChapterIndex] || effectiveChapters[0]
  const nextChapter = effectiveChapters[activeChapterIndex + 1]
  const prevChapter = activeChapterIndex > 0 ? effectiveChapters[activeChapterIndex - 1] : null

  const startParagraph = typeof currentChapter?.startParagraph === 'number' ? currentChapter.startParagraph : 0
  const endParagraph =
    nextChapter && typeof nextChapter.startParagraph === 'number' && nextChapter.startParagraph > startParagraph
      ? nextChapter.startParagraph
      : Math.min(startParagraph + 60, paragraphs.length)

  // Bound paragraphs rendered in DOM safely (up to 200) to keep browsing ultra-fast
  const chapterParagraphs = useMemo(() => {
    if (!paragraphs.length) return []
    const slice = paragraphs.slice(startParagraph, endParagraph)
    if (slice.length > 0) {
      return slice.slice(0, 200)
    }
    return paragraphs.slice(startParagraph, Math.min(startParagraph + 60, paragraphs.length))
  }, [paragraphs, startParagraph, endParagraph])

  if (loading) {
    return (
      <div className="reader-skeleton-paragraphs" aria-busy="true" aria-label="Loading chapter text">
        <div className="skeleton-box" style={{ width: '130px', height: '22px', borderRadius: '999px', marginBottom: '12px' }} />
        <div className="skeleton-box" style={{ maxWidth: '360px', height: '30px', marginBottom: '24px' }} />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="reader-skeleton-para" style={{ marginBottom: '20px' }}>
            <div className="skeleton-box" style={{ height: '18px', width: '98%', marginBottom: '8px' }} />
            <div className="skeleton-box" style={{ height: '18px', width: '93%', marginBottom: '8px' }} />
            <div className="skeleton-box" style={{ height: '18px', width: i % 2 === 0 ? '70%' : '85%' }} />
          </div>
        ))}
      </div>
    )
  }
  if (error) return <p className="admin-validation-error"><i className="bi bi-x-circle" /> {error}</p>
  if (!paragraphs.length) return <p className="empty-state">Chưa có văn bản đọc cho cuốn sách này.</p>

  const totalRegularChapters = effectiveChapters.filter((c) => !c.isIntro && c.order !== 0).length || effectiveChapters.length

  return (
    <div className="margin-notes-reader">
      {/* Chapter Title & Header */}
      {currentChapter && effectiveChapters.length > 0 && (
        <header className="reader-chapter-header">
          <div className="reader-chapter-badge">
            <span>
              {currentChapter.isIntro || currentChapter.order === 0
                ? 'Phần mở đầu (Introduction)'
                : `Chương ${currentChapter.order || activeChapterIndex} / ${totalRegularChapters}`}
            </span>
          </div>
          <h2 className="reader-chapter-title">{currentChapter.title}</h2>
          {currentChapter.excerpt && <p className="reader-chapter-excerpt">{currentChapter.excerpt}</p>}
        </header>
      )}

      {/* Render Current Chapter Paragraphs */}
      {chapterParagraphs.map((paragraph, localIndex) => {
        const globalIndex = startParagraph + localIndex
        const notes = notesByParagraph[globalIndex] || []
        const isActive = activeParagraph === globalIndex

        return (
          <div key={globalIndex} className="margin-notes-paragraph-wrapper">
            <div className="margin-notes-paragraph" id={`paragraph-${globalIndex}`}>
              <p>{paragraph}</p>
              <button
                aria-label={`Ghi chú cho đoạn ${globalIndex + 1}`}
                className={`margin-notes-toggle ${notes.length ? 'has-notes' : ''}`}
                onClick={() => toggleParagraph(globalIndex)}
                title="Thêm hoặc xem ghi chú bên lề"
                type="button"
              >
                <i className="bi bi-chat-square-text" /> {notes.length > 0 ? notes.length : ''}
              </button>

              {isActive && (
                <div className="margin-notes-panel">
                  {notes.map((note) => (
                    <div className="margin-notes-item" key={note.id}>
                      <strong>{note.author}</strong>
                      <p>{note.text}</p>
                    </div>
                  ))}
                  {isGuest ? (
                    <p className="empty-state">Đăng nhập để thêm ghi chú bên lề.</p>
                  ) : (
                    <div className="margin-notes-form">
                      <textarea
                        onChange={(event) => setNoteText(event.target.value)}
                        placeholder="Thêm ghi chú suy nghĩ cho đoạn văn này..."
                        value={noteText}
                      />
                      <button className="primary-button" disabled={!noteText.trim() || posting} onClick={() => submitNote(globalIndex)} type="button">
                        {posting ? 'Đang lưu...' : 'Thêm ghi chú'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}

      {/* Chapter Navigation Footer */}
      {effectiveChapters.length > 0 && (
        <nav aria-label="Điều hướng chương" className="reader-chapter-nav">
          <button
            className="ghost-button reader-nav-prev-btn"
            disabled={activeChapterIndex <= 0}
            onClick={() => {
              onChapterChange?.(activeChapterIndex - 1)
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
            type="button"
          >
            <i className="bi bi-chevron-left" />
            <span>{prevChapter ? prevChapter.title : 'Chương trước'}</span>
          </button>

          <span className="reader-nav-indicator">
            {currentChapter?.isIntro || currentChapter?.order === 0
              ? 'Phần mở đầu'
              : `Chương ${currentChapter?.order || activeChapterIndex} / ${totalRegularChapters}`}
          </span>

          {activeChapterIndex < effectiveChapters.length - 1 ? (
            <button
              className="primary-button reader-nav-next-btn"
              onClick={() => {
                onChapterChange?.(activeChapterIndex + 1)
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
              type="button"
            >
              <span>{nextChapter ? nextChapter.title : 'Chương tiếp'}</span>
              <i className="bi bi-chevron-right" />
            </button>
          ) : (
            <div className="reader-nav-finished">
              <i className="bi bi-check-circle-fill" /> Đã hoàn thành sách
            </div>
          )}
        </nav>
      )}
    </div>
  )
}

export default MarginNotesReader
