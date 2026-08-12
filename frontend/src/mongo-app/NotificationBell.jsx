import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { mongoApi } from './mongoApi'

function hoursUntil(dateString) {
  if (!dateString) return null
  return (new Date(dateString).getTime() - Date.now()) / (1000 * 60 * 60)
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const containerRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [rentalsData, booksData] = await Promise.all([
          mongoApi('/api/rentals/mine'),
          mongoApi('/api/books?limit=5'),
        ])
        if (cancelled) return

        // Orders arriving within the next 24 hours.
        const deliveryNotifications = rentalsData.rentals
          .filter((rental) => rental.status === 'approved' && rental.deliveryAt)
          .map((rental) => ({ hours: hoursUntil(rental.deliveryAt), rental }))
          .filter((item) => item.hours !== null && item.hours <= 24 && item.hours > -6)
          .map((item) => ({
            id: `delivery-${item.rental.id}`,
            icon: 'bi-truck',
            text: item.hours > 0
              ? `"${item.rental.bookTitle}" arrives in about ${Math.max(1, Math.round(item.hours))}h.`
              : `"${item.rental.bookTitle}" is due today - check your order.`,
            link: '/mongo-app/activity',
          }))

        // Most recently pushed books.
        const newBookNotifications = booksData.books.slice(0, 3).map((book) => ({
          id: `book-${book.id}`,
          icon: 'bi-journal-plus',
          text: `New book: "${book.title}"`,
          link: `/mongo-app/book/${book.id}`,
        }))

        setNotifications([...deliveryNotifications, ...newBookNotifications])
      } catch {
        setNotifications([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="mongo-notification" ref={containerRef}>
      <button
        aria-label={`Notifications${notifications.length ? ` (${notifications.length})` : ''}`}
        className="notification-bell"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <i className="bi bi-bell" />
        {notifications.length > 0 && <span className="notification-badge">{notifications.length}</span>}
      </button>
      {open && (
        <div className="mongo-notification-dropdown">
          <strong>Notifications</strong>
          {loading ? (
            <p className="settings-copy">Loading...</p>
          ) : notifications.length ? (
            <ul>
              {notifications.map((item) => (
                <li key={item.id}>
                  <Link onClick={() => setOpen(false)} to={item.link}>
                    <i className={`bi ${item.icon}`} />
                    <span>{item.text}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="settings-copy">No notifications yet.</p>
          )}
        </div>
      )}
    </div>
  )
}
