import { useState } from 'react'
import { apiFetch } from '../../utils/apiClient'
import { GENRE_SLIDES } from '../../utils/genreSlides'

// Shown once per account until they've made a choice (an empty "skip"
// counts), and reusable from Profile any time after to change it. Feeds
// Home's "For You" row (see GET /api/content/for-you) alongside real
// reading/listening behavior - see recordCategoryEngagement in
// authController.js - so this is a starting point for that row, not the
// only input to it.
function PreferencesModal({ initialSelected = [], onClose }) {
  const [selected, setSelected] = useState(() => new Set(initialSelected))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function toggle(topic) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(topic)) next.delete(topic)
      else next.add(topic)
      return next
    })
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      await apiFetch('/api/users/me/preferences', { method: 'PATCH', body: { categories: [...selected] } })
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div aria-labelledby="preferences-modal-title" aria-modal="true" className="reader-modal-backdrop preferences-modal-backdrop" role="dialog">
      <div className="preferences-modal">
        <h2 id="preferences-modal-title">What do you like to read?</h2>
        <p>Pick a few genres - we'll use these, plus what you actually open, to build your For You row on Home.</p>

        <div className="preferences-modal-grid">
          {GENRE_SLIDES.map((slide) => (
            <button className={selected.has(slide.topic) ? 'active' : ''} key={slide.id} onClick={() => toggle(slide.topic)} type="button">
              {slide.topic}
            </button>
          ))}
        </div>

        {error && <p className="admin-validation-error"><i className="bi bi-x-circle" /> {error}</p>}

        <div className="admin-row-actions">
          <button className="primary-button" disabled={saving} onClick={save} type="button">
            {saving ? 'Saving...' : 'Save preferences'}
          </button>
          <button className="ghost-button" disabled={saving} onClick={() => save()} type="button">
            Skip for now
          </button>
        </div>
      </div>
    </div>
  )
}

export default PreferencesModal
