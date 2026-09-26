import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { publicApiFetch } from '../../utils/apiClient'
import { useNavigation } from '../../context/NavigationContext'
import ContentComments from '../content/ContentComments'

function ContentPlayerPage() {
  const { navigateTo } = useNavigation()
  const [searchParams] = useSearchParams()
  const id = searchParams.get('id')
  const [item, setItem] = useState(null)
  const [chapters, setChapters] = useState([])
  const [activeChapter, setActiveChapter] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    let ignore = false
    setLoading(true)
    setError('')

    // Both requests run in parallel - the item's own metadata (title,
    // author, description) and its chapter list (parsed live from
    // LibriVox's RSS feed - see backend/utils/librivoxRssParser.js) come
    // from two different endpoints, since the chapter list isn't cached in
    // the Content document itself.
    Promise.all([publicApiFetch(`/api/content/${id}`), publicApiFetch(`/api/content/${id}/chapters`)])
      .then(([itemData, chaptersData]) => {
        if (ignore) return
        setItem(itemData)
        setChapters(Array.isArray(chaptersData?.chapters) ? chaptersData.chapters : [])
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
  }, [id])

  if (!id) return <p className="admin-validation-error"><i className="bi bi-x-circle" /> No audiobook selected.</p>
  if (loading) return <p>Loading...</p>
  if (error || !item) {
    return <p className="admin-validation-error"><i className="bi bi-x-circle" /> {error || 'Audiobook not found.'}</p>
  }

  const current = chapters[activeChapter]

  return (
    <div className="content-player-page">
      <button className="ghost-button" onClick={() => navigateTo('books')} type="button">
        <i className="bi bi-arrow-left" /> Back to books
      </button>

      <div className="section-heading">
        <div>
          <p className="mono-eyebrow">{item.source}</p>
          <h2>{item.title}</h2>
        </div>
      </div>
      <p>{item.author}</p>
      {item.description && <p>{item.description}</p>}

      {item.pairedContent && (
        <button className="ghost-button" onClick={() => navigateTo('read', { query: `id=${item.pairedContent.id}` })} type="button">
          <i className="bi bi-book" /> Also available as an ebook - Read
        </button>
      )}

      {current ? (
        <div className="content-player-audio">
          <p className="mono-eyebrow">{current.title}</p>
          {/* key={current.url} forces the <audio> element to remount on
              chapter change - without it the browser keeps the previous
              chapter's buffered source instead of loading the new one. */}
          <audio autoPlay controls key={current.url} src={current.url} style={{ width: '100%' }} />
        </div>
      ) : (
        <p className="empty-state">No playable chapters found for this audiobook yet.</p>
      )}

      {chapters.length > 0 && (
        <ol className="content-player-chapter-list">
          {chapters.map((chapter, index) => (
            <li key={chapter.url}>
              <button className={index === activeChapter ? 'active' : ''} onClick={() => setActiveChapter(index)} type="button">
                <i className={`bi ${index === activeChapter ? 'bi-play-fill' : 'bi-music-note'}`} />
                {chapter.title}
              </button>
            </li>
          ))}
        </ol>
      )}

      <ContentComments contentId={item._id} />
    </div>
  )
}

export default ContentPlayerPage
