import { useState } from 'react'
import { mongoApi } from './mongoApi'
import SearchAutocomplete from './SearchAutocomplete'

const USAGE_TYPES = ['none', 'read', 'rent', 'both']
const emptyForm = { title: '', author: '', cover: '', description: '', usageType: 'read' }

export default function AdminBooksPage() {
  const [form, setForm] = useState(emptyForm)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function fillFromSuggestion(book) {
    setForm((current) => ({
      title: book.title,
      author: book.author,
      cover: book.cover || '',
      description: book.description || '',
      usageType: current.usageType,
    }))
    setStatus(`Filled from catalog match: "${book.title}". Review and adjust below, then push.`)
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    setStatus('')
    try {
      await mongoApi('/api/books', { method: 'POST', body: form })
      setStatus(`Pushed "${form.title}" successfully.`)
      setForm(emptyForm)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="mongo-admin-books">
      <h1>Push Book (MongoDB)</h1>

      <section className="account-settings-card">
        <h2>Suggestions from the catalog</h2>
        <p className="settings-copy">Search the existing catalog - click a match to autofill the form below instead of typing everything.</p>
        <SearchAutocomplete onPick={fillFromSuggestion} placeholder="Search catalog to autofill..." />
      </section>

      <section className="account-settings-card">
        <h2>Book details</h2>
        {status && <p className="settings-copy">{status}</p>}
        {error && <p className="settings-error">{error}</p>}
        <form className="admin-form compact-form" onSubmit={submit}>
          <label className="wide-field">
            Title
            <input onChange={(event) => updateForm('title', event.target.value)} required value={form.title} />
          </label>
          <label>
            Author
            <input onChange={(event) => updateForm('author', event.target.value)} value={form.author} />
          </label>
          <label>
            Cover URL
            <input onChange={(event) => updateForm('cover', event.target.value)} value={form.cover} />
          </label>
          <label>
            Usage type
            <select onChange={(event) => updateForm('usageType', event.target.value)} value={form.usageType}>
              {USAGE_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </label>
          <label className="wide-field">
            Description
            <textarea onChange={(event) => updateForm('description', event.target.value)} value={form.description} />
          </label>
          <button className="primary-button" type="submit">Push book</button>
        </form>
      </section>
    </div>
  )
}
