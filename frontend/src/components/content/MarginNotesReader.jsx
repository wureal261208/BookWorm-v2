import { useEffect, useMemo, useState } from 'react'
import { auth } from '../../features/auth-firebase/firebaseConfig'
import { apiFetch, publicApiFetch } from '../../utils/apiClient'

const EXCERPT_LENGTH = 80

function MarginNotesReader({ contentId, chapters = [] }) {
  const isGuest = !auth.currentUser
  const [paragraphs, setParagraphs] = useState([])
  const [notesByParagraph, setNotesByParagraph] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeParagraph, setActiveParagraph] = useState(null)
  const [noteText, setNoteText] = useState('')
  const [posting, setPosting] = useState(false)

  const chapterByStartParagraph = useMemo(() => {
    const map = new Map()
    for (const ch of chapters) {
      if (typeof ch.startParagraph === 'number') {
        map.set(ch.startParagraph, ch)
      }
    }
    return map
  }, [chapters])

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

  if (loading) return <p>Loading book text...</p>
  if (error) return <p className="admin-validation-error"><i className="bi bi-x-circle" /> {error}</p>
  if (!paragraphs.length) return <p className="empty-state">No readable text available for this book.</p>

  return (
    <div className="margin-notes-reader">
      {paragraphs.map((paragraph, index) => {
        const notes = notesByParagraph[index] || []
        const isActive = activeParagraph === index
        const chapterAtThisIndex = chapterByStartParagraph.get(index)

        return (
          <div key={index} className="margin-notes-paragraph-wrapper">
            {chapterAtThisIndex && (
              <div className="reader-chapter-divider" id={`chapter-start-${chapterAtThisIndex.order}`}>
                <span className="mono-eyebrow">Chapter {chapterAtThisIndex.order}</span>
                <h2>{chapterAtThisIndex.title}</h2>
              </div>
            )}
            <div className="margin-notes-paragraph" id={`paragraph-${index}`}>
              <p>{paragraph}</p>
              <button
                className={`margin-notes-toggle ${notes.length ? 'has-notes' : ''}`}
                onClick={() => toggleParagraph(index)}
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
                  <p className="empty-state">Log in to add a note.</p>
                ) : (
                  <div className="margin-notes-form">
                    <textarea
                      onChange={(event) => setNoteText(event.target.value)}
                      placeholder="Add a note on this paragraph..."
                      value={noteText}
                    />
                    <button className="primary-button" disabled={!noteText.trim() || posting} onClick={() => submitNote(index)} type="button">
                      {posting ? 'Posting...' : 'Add note'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )
    })}
    </div>
  )
}

export default MarginNotesReader
