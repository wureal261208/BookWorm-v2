import { useState } from 'react'
import { apiFetch } from '../../utils/apiClient'
import { GENRE_SLIDES, GENRE_ICONS } from '../../utils/genreSlides'

// Shown once per account until they've made a choice (an empty "skip"
// counts), and reusable from Profile any time after to change it. Feeds
// Home's "Recommend for you" and "For You" shelves alongside real
// reading/listening behavior so users get personalized picks immediately.
function PreferencesModal({ initialSelected = [], onClose, onSave }) {
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

  async function save(empty = false) {
    setSaving(true)
    setError('')
    const categoriesToSave = empty ? [] : [...selected]
    try {
      await apiFetch('/api/users/me/preferences', { method: 'PATCH', body: { categories: categoriesToSave } })
      onSave?.(categoriesToSave)
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
        <div className="preferences-modal-header">
          <i className="bi bi-stars" />
          <h2 id="preferences-modal-title">What do you like to read?</h2>
        </div>
        <p>Pick your favorite genres below. We'll curate your <strong>Recommend for you</strong> shelf and reading recommendations tailored to your taste.</p>

        <div className="preferences-modal-grid">
          {GENRE_SLIDES.map((slide) => {
            const isSelected = selected.has(slide.topic)
            const iconClass = slide.icon || GENRE_ICONS[slide.topic] || 'bi-bookmark-star'
            return (
              <button
                className={`preference-genre-card ${isSelected ? 'active' : ''}`}
                key={slide.id}
                onClick={() => toggle(slide.topic)}
                type="button"
                aria-pressed={isSelected}
              >
                <div className="genre-card-icon">
                  <i className={`bi ${iconClass}`} />
                </div>
                <span className="genre-card-label">{slide.topic}</span>
                <i className={`bi ${isSelected ? 'bi-check-circle-fill' : 'bi-circle'} genre-card-check`} />
              </button>
            )
          })}
        </div>

        {error && (
          <p className="admin-validation-error">
            <i className="bi bi-x-circle" /> {error}
          </p>
        )}

        <div className="admin-row-actions">
          <button className="primary-button" disabled={saving} onClick={() => save(false)} type="button">
            <i className="bi bi-check-lg" />
            {saving ? 'Saving...' : 'Save preferences'}
          </button>
          <button className="ghost-button" disabled={saving} onClick={() => save(true)} type="button">
            <i className="bi bi-arrow-right" />
            Skip for now
          </button>
        </div>
      </div>
    </div>
  )
}

export default PreferencesModal
