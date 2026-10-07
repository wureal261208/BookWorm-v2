import { useEffect, useMemo, useState } from 'react'
import { auth } from '../../features/auth-firebase/firebaseConfig'
import { apiFetch, publicApiFetch } from '../../utils/apiClient'

const EXCERPT_LENGTH = 80

function MarginNotesReader({
  contentId,
  chapters = [],
  activeChapterIndex = 0,
  onChapterChange,
  ttsActiveIndex = null,
  textAlign = 'justify',
  onParagraphsLoaded,
  onChaptersGenerated,
  searchQuery = '',
  searchMatchIndex = 0,
  onSearchResults,
}) {
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
        title: 'Introduction',
        startParagraph: 0,
        excerpt: paragraphs[0]?.slice(0, 100) || '',
      },
    ]
    for (let i = 1; i < totalChunks; i++) {
      list.push({
        order: i,
        isIntro: false,
        title: `Chapter ${i}`,
        startParagraph: i * CHUNK_SIZE,
        excerpt: paragraphs[i * CHUNK_SIZE]?.slice(0, 100) || '',
      })
    }
    return list
  }, [chapters, paragraphs])

  useEffect(() => {
    if ((!chapters || chapters.length === 0) && virtualChapters.length > 0 && onChaptersGenerated) {
      onChaptersGenerated(virtualChapters)
    }
  }, [chapters, virtualChapters, onChaptersGenerated])

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

  useEffect(() => {
    if (chapterParagraphs.length > 0 && onParagraphsLoaded) {
      onParagraphsLoaded(chapterParagraphs, startParagraph)
    }
  }, [chapterParagraphs, startParagraph, onParagraphsLoaded])

  const totalWords = useMemo(() => {
    return chapterParagraphs.join(' ').trim().split(/\s+/).filter(Boolean).length
  }, [chapterParagraphs])
  const estimatedReadingMinutes = Math.max(1, Math.round(totalWords / 190))

  const searchMatches = useMemo(() => {
    const q = (searchQuery || '').trim().toLowerCase()
    if (!q || q.length < 2) return []

    const matches = []
    chapterParagraphs.forEach((paragraph, localParaIdx) => {
      const pLower = paragraph.toLowerCase()
      let startIdx = 0
      while (startIdx < pLower.length) {
        const foundIdx = pLower.indexOf(q, startIdx)
        if (foundIdx === -1) break
        matches.push({
          localParaIdx,
          charStart: foundIdx,
          charEnd: foundIdx + q.length,
          globalParaIdx: startParagraph + localParaIdx,
        })
        startIdx = foundIdx + q.length
      }
    })
    return matches
  }, [searchQuery, chapterParagraphs, startParagraph])

  useEffect(() => {
    if (onSearchResults) {
      onSearchResults(searchMatches.length)
    }
  }, [searchMatches.length, onSearchResults])

  useEffect(() => {
    if (!searchMatches.length || searchMatchIndex < 0 || searchMatchIndex >= searchMatches.length) return
    const targetMatch = searchMatches[searchMatchIndex]
    if (!targetMatch) return

    const el = document.getElementById(`search-match-${searchMatchIndex}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else {
      const paraEl = document.getElementById(`paragraph-${targetMatch.globalParaIdx}`)
      if (paraEl) paraEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [searchMatchIndex, searchMatches])

  function renderHighlightedText(text, localParaIdx) {
    const q = (searchQuery || '').trim()
    if (!q || q.length < 2) return text

    const paraMatches = searchMatches
      .map((m, overallIdx) => ({ ...m, overallIdx }))
      .filter((m) => m.localParaIdx === localParaIdx)

    if (!paraMatches.length) return text

    const parts = []
    let lastIndex = 0

    paraMatches.forEach((m) => {
      if (m.charStart > lastIndex) {
        parts.push(text.slice(lastIndex, m.charStart))
      }
      const isCurrentActive = m.overallIdx === searchMatchIndex
      parts.push(
        <mark
          id={`search-match-${m.overallIdx}`}
          key={`match-${m.overallIdx}`}
          className={`reader-search-highlight ${isCurrentActive ? 'active-match' : ''}`}
        >
          {text.slice(m.charStart, m.charEnd)}
        </mark>
      )
      lastIndex = m.charEnd
    })

    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex))
    }

    return parts
  }

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
  if (!paragraphs.length) return <p className="empty-state">No reading text available for this book yet.</p>

  const totalRegularChapters = effectiveChapters.filter((c) => !c.isIntro && c.order !== 0).length || effectiveChapters.length

  return (
    <div className="margin-notes-reader">
      {/* Chapter Title & Header */}
      {currentChapter && effectiveChapters.length > 0 && (
        <header className="reader-chapter-header">
          <div className="reader-chapter-meta-row">
            <div className="reader-chapter-badge">
              <span>
                {currentChapter.isIntro || currentChapter.order === 0
                  ? 'Introduction'
                  : `Chapter ${currentChapter.order || activeChapterIndex} / ${totalRegularChapters}`}
              </span>
            </div>
            {totalWords > 0 && (
              <span className="reading-time-badge">
                <i className="bi bi-clock-history" /> ~{estimatedReadingMinutes} min read ({totalWords.toLocaleString()} words)
              </span>
            )}
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
        const isTtsReading = ttsActiveIndex === globalIndex

        return (
          <div
            key={globalIndex}
            className={`margin-notes-paragraph-wrapper ${isTtsReading ? 'tts-highlight-active' : ''}`}
            style={{ textAlign: textAlign || 'justify' }}
          >
            <div className="margin-notes-paragraph" id={`paragraph-${globalIndex}`}>
              <p className={localIndex === 0 && !searchQuery ? 'drop-cap' : ''}>{renderHighlightedText(paragraph, localIndex)}</p>
              <button
                aria-label={`Notes for paragraph ${globalIndex + 1}`}
                className={`margin-notes-toggle ${notes.length ? 'has-notes' : ''}`}
                onClick={() => toggleParagraph(globalIndex)}
                title="Add or view margin notes"
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
                    <p className="empty-state">Sign in to add margin notes.</p>
                  ) : (
                    <div className="margin-notes-form">
                      <textarea
                        onChange={(event) => setNoteText(event.target.value)}
                        placeholder="Add your margin note or thoughts for this paragraph..."
                        value={noteText}
                      />
                      <button className="primary-button" disabled={!noteText.trim() || posting} onClick={() => submitNote(globalIndex)} type="button">
                        {posting ? 'Saving...' : 'Save note'}
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
        <nav aria-label="Chapter navigation" className="reader-chapter-nav">
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
            <span>{prevChapter ? prevChapter.title : 'Previous chapter'}</span>
          </button>

          <span className="reader-nav-indicator">
            {currentChapter?.isIntro || currentChapter?.order === 0
              ? 'Introduction'
              : `Chapter ${currentChapter?.order || activeChapterIndex} / ${totalRegularChapters}`}
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
              <span>{nextChapter ? nextChapter.title : 'Next chapter'}</span>
              <i className="bi bi-chevron-right" />
            </button>
          ) : (
            <div className="reader-nav-finished">
              <i className="bi bi-check-circle-fill" /> Book completed
            </div>
          )}
        </nav>
      )}
    </div>
  )
}

export default MarginNotesReader
