import { useEffect, useState } from 'react'
import { auth } from '../../features/auth-firebase/firebaseConfig'
import { apiFetch } from '../../utils/apiClient'

const TYPE_OPTIONS = [
  { id: 'audiobook', label: 'Audiobook narration' },
  { id: 'ebook', label: 'Ebook' },
]

const emptyForm = {
  type: 'audiobook',
  title: '',
  author: '',
  description: '',
  categories: '',
  language: 'en',
  fileFormat: 'mp3',
  fileUrl: '',
}

// Crowd-narration, per Wun's brainstorm (nhóm 3): a reader records/hosts
// their own narration for a book LibriVox doesn't have yet (or contributes
// an ebook) and links it here rather than uploading a file to this site
// directly - there's no file-storage service wired up, so the honest,
// buildable version of this is "paste a link to where you've already
// hosted it" (Google Drive, archive.org, etc.), not a native file picker.
// Submissions land as status:'draft' and go through the exact same
// Publish/Hide review admins already use for synced content - see
// backend/controllers/contentController.js's createUserContent.
function CommunityPage() {
  const isGuest = !auth.currentUser
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [mine, setMine] = useState([])
  const [loadingMine, setLoadingMine] = useState(true)

  function loadMine() {
    setLoadingMine(true)
    apiFetch('/api/content/mine')
      .then((data) => setMine(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message))
      .finally(() => setLoadingMine(false))
  }

  useEffect(() => {
    if (!isGuest) loadMine()
    else setLoadingMine(false)
  }, [isGuest])

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!form.title.trim() || !form.fileUrl.trim()) {
      setError('Title and a link to the file are required.')
      return
    }

    setSubmitting(true)
    try {
      await apiFetch('/api/content', {
        method: 'POST',
        body: {
          type: form.type,
          title: form.title.trim(),
          author: form.author.trim(),
          description: form.description.trim(),
          categories: form.categories
            .split(',')
            .map((category) => category.trim())
            .filter(Boolean),
          language: form.language.trim() || 'en',
          files: [{ format: form.fileFormat.trim() || 'mp3', url: form.fileUrl.trim() }],
        },
      })
      setSuccess('Submitted! An admin will review it before it goes live.')
      setForm(emptyForm)
      loadMine()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (isGuest) {
    return (
      <div className="community-page">
        <div className="section-heading">
          <div>
            <p className="mono-eyebrow">Community</p>
            <h2>Contribute a narration</h2>
          </div>
        </div>
        <p className="empty-state">Log in to submit a narration or ebook contribution.</p>
      </div>
    )
  }

  return (
    <div className="community-page">
      <div className="section-heading">
        <div>
          <p className="mono-eyebrow">Community</p>
          <h2>Contribute a narration</h2>
        </div>
        <span>Recorded a public-domain book LibriVox doesn't have yet? Share the link here for review.</span>
      </div>

      <form className="community-form" onSubmit={submit}>
        <div className="community-form-row">
          {TYPE_OPTIONS.map((option) => (
            <button
              className={form.type === option.id ? 'active' : ''}
              key={option.id}
              onClick={() => updateField('type', option.id)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>

        <label>
          Book title
          <input onChange={(event) => updateField('title', event.target.value)} type="text" value={form.title} />
        </label>
        <label>
          Author
          <input onChange={(event) => updateField('author', event.target.value)} type="text" value={form.author} />
        </label>
        <label>
          Description
          <textarea onChange={(event) => updateField('description', event.target.value)} value={form.description} />
        </label>
        <div className="community-form-row">
          <label>
            Categories (comma-separated)
            <input onChange={(event) => updateField('categories', event.target.value)} type="text" value={form.categories} />
          </label>
          <label>
            Language
            <input onChange={(event) => updateField('language', event.target.value)} type="text" value={form.language} />
          </label>
        </div>
        <div className="community-form-row">
          <label>
            File format
            <input onChange={(event) => updateField('fileFormat', event.target.value)} type="text" value={form.fileFormat} />
          </label>
          <label className="community-form-file-url">
            Link to the file (Drive, archive.org, etc.)
            <input onChange={(event) => updateField('fileUrl', event.target.value)} type="url" value={form.fileUrl} />
          </label>
        </div>

        {error && <p className="admin-validation-error"><i className="bi bi-x-circle" /> {error}</p>}
        {success && <p className="community-success"><i className="bi bi-check-circle" /> {success}</p>}

        <button className="primary-button" disabled={submitting} type="submit">
          {submitting ? 'Submitting...' : 'Submit for review'}
        </button>
      </form>

      <div className="section-heading">
        <div>
          <p className="mono-eyebrow">Track your work</p>
          <h2>Your submissions</h2>
        </div>
      </div>

      {loadingMine ? (
        <div className="community-submissions-list" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <div className="table-row community-submission-row" key={i}>
              <div className="skeleton-box" style={{ width: '45%', height: '18px' }} />
              <div className="skeleton-box" style={{ width: '70px', height: '18px' }} />
            </div>
          ))}
        </div>
      ) : mine.length ? (
        <div className="community-submissions-list">
          {mine.map((item) => (
            <div className="table-row community-submission-row" key={item._id}>
              <span>
                {item.title}
                <em className={`admin-status status-${item.status}`}>{item.status}</em>
              </span>
              <small>{item.type === 'ebook' ? 'Ebook' : 'Audiobook'}</small>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty-state">You haven't submitted anything yet.</p>
      )}
    </div>
  )
}

export default CommunityPage
