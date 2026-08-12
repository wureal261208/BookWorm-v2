import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { mongoApi } from './mongoApi'

const NONE_COVER = 'https://icons.veryicon.com/png/o/miscellaneous/myicon-1/none-1.png'

export default function BookDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const [book, setBook] = useState(null)
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [error, setError] = useState('')
  const [rentForm, setRentForm] = useState({ recipientName: '', phone: '', address: '', note: '' })
  const [rentStatus, setRentStatus] = useState('')

  useEffect(() => {
    mongoApi(`/api/books/${id}`).then((data) => setBook(data.book)).catch((err) => setError(err.message))
    mongoApi(`/api/comments?bookId=${id}`).then((data) => setComments(data.comments)).catch(() => {})
  }, [id])

  function updateRentForm(field, value) {
    setRentForm((current) => ({ ...current, [field]: value }))
  }

  async function submitComment(event) {
    event.preventDefault()
    if (!commentText.trim()) return
    try {
      const data = await mongoApi('/api/comments', { method: 'POST', body: { bookId: id, text: commentText } })
      setComments((current) => [data.comment, ...current])
      setCommentText('')
    } catch (err) {
      setError(err.message)
    }
  }

  async function submitRent(event) {
    event.preventDefault()
    setRentStatus('')
    try {
      await mongoApi('/api/rentals', { method: 'POST', body: { bookId: id, bookTitle: book.title, ...rentForm } })
      setRentStatus('Order placed! Check the Activity page for its status.')
      setRentForm({ recipientName: '', phone: '', address: '', note: '' })
    } catch (err) {
      setRentStatus(err.message)
    }
  }

  if (error) return <p className="settings-error">{error}</p>
  if (!book) return <p className="settings-copy">Loading...</p>

  const canRent = book.usageType === 'rent' || book.usageType === 'both'

  return (
    <div className="mongo-detail">
      <div className="mongo-detail-header">
        <img
          alt=""
          onError={(event) => {
            event.currentTarget.src = NONE_COVER
          }}
          src={book.cover || NONE_COVER}
        />
        <div>
          <h1>{book.title}</h1>
          <p>{book.author}</p>
          <p>{book.description}</p>
          <em className="admin-status status-published">{book.usageType}</em>
        </div>
      </div>

      {user && canRent && (
        <section className="account-settings-card">
          <h2>Rent this book (cash on delivery)</h2>
          {rentStatus && <p className="settings-copy">{rentStatus}</p>}
          <form className="admin-form compact-form" onSubmit={submitRent}>
            <label>
              Recipient name
              <input onChange={(event) => updateRentForm('recipientName', event.target.value)} required value={rentForm.recipientName} />
            </label>
            <label>
              Phone
              <input onChange={(event) => updateRentForm('phone', event.target.value)} required value={rentForm.phone} />
            </label>
            <label className="wide-field">
              Address
              <input onChange={(event) => updateRentForm('address', event.target.value)} required value={rentForm.address} />
            </label>
            <label className="wide-field">
              Note (optional)
              <input onChange={(event) => updateRentForm('note', event.target.value)} value={rentForm.note} />
            </label>
            <button className="primary-button" type="submit">Confirm order</button>
          </form>
        </section>
      )}
      {!user && canRent && <p className="settings-copy">Login to rent this book.</p>}

      <section className="account-settings-card">
        <h2>Comments</h2>
        {user && (
          <form className="admin-form compact-form" onSubmit={submitComment}>
            <label className="wide-field">
              Write a comment
              <textarea onChange={(event) => setCommentText(event.target.value)} value={commentText} />
            </label>
            <button className="primary-button" type="submit">Post</button>
          </form>
        )}
        {comments.length ? (
          <ul className="notification-list">
            {comments.map((comment) => (
              <li key={comment.id}>
                <div>
                  <span><strong>{comment.authorName}</strong>: {comment.text}</span>
                  <small>{new Date(comment.createdAt).toLocaleString()}</small>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="settings-copy">No comments yet.</p>
        )}
      </section>
    </div>
  )
}
