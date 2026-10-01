import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { auth } from '../../features/auth-firebase/firebaseConfig'
import { apiFetch, publicApiFetch } from '../../utils/apiClient'
import { useNavigation } from '../../context/NavigationContext'
import ContentComments from '../content/ContentComments'
import MarginNotesReader from '../content/MarginNotesReader'

// Reads ?id= rather than a path param (/read/:id) - the app's own
// lightweight router (see App.jsx's PAGE_PATHS/navigateTo) only maps a
// page id to a fixed path, it doesn't do param interpolation, so every
// per-item page in this app (this one included) is a fixed path plus a
// query string, the same pattern BooksPage.jsx already uses for ?category=.
function ContentReaderPage() {
  const { navigateTo } = useNavigation()
  const [searchParams] = useSearchParams()
  const id = searchParams.get('id')
  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    let ignore = false
    setLoading(true)
    setError('')
    publicApiFetch(`/api/content/${id}`)
      .then((data) => {
        if (ignore) return
        setItem(data)
        // Best-effort, real-behavior signal for Home's "For You" row (see
        // backend/controllers/contentController.js's getForYou) - fails
        // silently for a guest (no account to attach it to) or a network
        // hiccup, neither of which should affect reading the book itself.
        if (auth.currentUser && data.categories?.length) {
          apiFetch('/api/users/me/engagement', { method: 'POST', body: { categories: data.categories } }).catch(() => {})
        }
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

  if (!id) return <p className="admin-validation-error"><i className="bi bi-x-circle" /> No book selected.</p>
  if (loading) return <p>Loading...</p>
  if (error || !item) {
    return <p className="admin-validation-error"><i className="bi bi-x-circle" /> {error || 'Book not found.'}</p>
  }

  // Downloads still link straight to the source files (epub/mobi/txt) -
  // only the "html" edition is fetched and rendered as real paragraphs (see
  // MarginNotesReader.jsx), since that's what margin notes anchor to.
  const hasHtmlEdition = item.files?.some((file) => file.format === 'html')
  const downloadFiles = item.files || []

  return (
    <div className="content-reader-page">
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

      {/* Not a seamless resume-where-you-left-off switch (see backend's
          getPublicContentDetail - neither Gutendex nor LibriVox expose
          any shared chapter/position data to sync against), just an
          honest "this same title exists in the other format too" link. */}
      {item.pairedContent && (
        <button
          className="ghost-button"
          onClick={() => navigateTo('listen', { query: `id=${item.pairedContent.id}` })}
          type="button"
        >
          <i className="bi bi-headphones" /> Also available as an audiobook - Listen
        </button>
      )}

      {downloadFiles.length > 0 && (
        <div className="admin-row-actions">
          {downloadFiles.map((file) => (
            <a className="ghost-button" href={file.url} key={file.url} rel="noreferrer" target="_blank">
              <i className="bi bi-download" /> {file.format}
            </a>
          ))}
        </div>
      )}

      {hasHtmlEdition ? (
        <MarginNotesReader contentId={item._id} />
      ) : (
        <p className="empty-state">No readable HTML edition on file for this book - try one of the download links above.</p>
      )}

      <ContentComments contentId={item._id} />
    </div>
  )
}

export default ContentReaderPage
