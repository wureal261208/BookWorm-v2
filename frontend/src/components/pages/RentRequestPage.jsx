import { useMemo, useState } from 'react'
import { getAuthor, getCover } from '../../utils/bookUtils'
import { formatDeliveryDate } from '../../utils/rentalUtils'

const STATUS_LABELS = {
  pending: 'Pending review',
  approved: 'Approved',
  declined: 'Declined',
}

function RentRequestPage({ account, books = [], notifications = [], onMarkNotificationRead, onSubmitRequest, rentalRequests = [] }) {
  const [step, setStep] = useState('pick') // 'pick' | 'checkout'
  const [query, setQuery] = useState('')
  const [selectedBookId, setSelectedBookId] = useState('')
  const [form, setForm] = useState({ recipientName: account?.name || '', phone: '', address: '', note: '' })

  const myEmail = (account?.email || '').toLowerCase()
  const myRequests = useMemo(
    () => rentalRequests.filter((item) => (item.customerEmail || '').toLowerCase() === myEmail),
    [rentalRequests, myEmail],
  )
  const myNotifications = useMemo(
    () => notifications.filter((item) => (item.targetEmail || '').toLowerCase() === myEmail),
    [notifications, myEmail],
  )
  const unreadCount = myNotifications.filter((item) => !item.read).length

  const searchResults = query.trim().length
    ? books.filter((book) => book.title.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    : []
  const selectedBook = books.find((book) => book.id === selectedBookId)
  const canConfirm = form.recipientName.trim() && form.phone.trim() && form.address.trim()

  function pickBook(book) {
    setSelectedBookId(book.id)
    setQuery('')
    setStep('checkout')
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function confirmOrder(event) {
    event.preventDefault()
    if (!selectedBook || !canConfirm) return

    onSubmitRequest?.(selectedBook, {
      recipientName: form.recipientName.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      note: form.note.trim(),
      paymentMethod: 'cod',
    })

    setSelectedBookId('')
    setForm({ recipientName: account?.name || '', phone: '', address: '', note: '' })
    setStep('pick')
  }

  return (
    <div className="rent-request-page">
      <section className="page-title">
        <div>
          <p className="mono-eyebrow">Rentals</p>
          <h1>Rent a book</h1>
        </div>
        <p>Pick a book, confirm your delivery details, and pay cash on delivery. A manager reviews every order and confirms the delivery date.</p>
      </section>

      {step === 'pick' ? (
        <section className="account-settings-card">
          <h2>1. Choose a book</h2>
          <label className="wide-field">
            Search for a book
            <input onChange={(event) => setQuery(event.target.value)} placeholder="Type a title..." value={query} />
          </label>
          {searchResults.length > 0 ? (
            <div className="book-thumb-list">
              {searchResults.map((book) => (
                <button className="book-pick-row" key={book.id} onClick={() => pickBook(book)} type="button">
                  <img alt="" src={getCover(book)} />
                  <div>
                    <strong>{book.title}</strong>
                    <span>{getAuthor(book)}</span>
                  </div>
                  <i className="bi bi-chevron-right" />
                </button>
              ))}
            </div>
          ) : (
            query.trim() && <p className="settings-copy">No books match "{query}".</p>
          )}
        </section>
      ) : (
        <section className="account-settings-card">
          <div className="section-heading">
            <div>
              <p className="mono-eyebrow">2. Confirm order</p>
              <h2>{selectedBook?.title}</h2>
            </div>
            <button className="ghost-button" onClick={() => setStep('pick')} type="button">Change book</button>
          </div>

          <form className="admin-form compact-form" onSubmit={confirmOrder}>
            <label className="wide-field">
              Recipient name
              <input onChange={(event) => updateForm('recipientName', event.target.value)} required value={form.recipientName} />
            </label>
            <label className="wide-field">
              Phone number
              <input onChange={(event) => updateForm('phone', event.target.value)} placeholder="09xx xxx xxx" required type="tel" value={form.phone} />
            </label>
            <label className="wide-field">
              Delivery address
              <textarea onChange={(event) => updateForm('address', event.target.value)} placeholder="Street, ward, district, city" required value={form.address} />
            </label>
            <label className="wide-field">
              Note for the manager (optional)
              <textarea onChange={(event) => updateForm('note', event.target.value)} placeholder="Preferred delivery time, gate code..." value={form.note} />
            </label>

            <div className="wide-field payment-method-note">
              <i className="bi bi-cash-coin" />
              <div>
                <strong>Cash on delivery (COD)</strong>
                <span>Pay in cash when the book arrives - no online payment needed.</span>
              </div>
            </div>

            <button className="primary-button" disabled={!canConfirm} type="submit">
              <i className="bi bi-check2-circle" />
              Confirm order
            </button>
          </form>
        </section>
      )}

      <section className="account-settings-card">
        <h2>Your notifications {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}</h2>
        {myNotifications.length ? (
          <ul className="notification-list">
            {myNotifications.map((item) => (
              <li className={item.read ? '' : 'unread'} key={item.id}>
                <div>
                  <span>{item.message}</span>
                  <small>{new Date(item.createdAt).toLocaleString()}</small>
                </div>
                {!item.read && (
                  <button className="ghost-button" onClick={() => onMarkNotificationRead?.(item.id)} type="button">
                    Mark read
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="settings-copy">No notifications yet.</p>
        )}
      </section>

      <section className="account-settings-card">
        <h2>Your orders</h2>
        {myRequests.length ? (
          <ul className="rental-list request-list">
            {myRequests.map((item) => (
              <li key={item.id}>
                <strong>{item.bookTitle}</strong>
                <span className={`request-status request-status-${item.status}`}>{STATUS_LABELS[item.status] || item.status}</span>
                {item.status === 'approved' && item.deliveryAt && (
                  <small>Expected delivery: {formatDeliveryDate(item.deliveryAt)}</small>
                )}
                {item.status === 'pending' && <small>COD - waiting for manager review</small>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="settings-copy">You haven't placed any rental orders yet.</p>
        )}
      </section>
    </div>
  )
}

export default RentRequestPage
