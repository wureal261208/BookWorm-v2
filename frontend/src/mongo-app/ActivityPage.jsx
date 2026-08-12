import { useEffect, useState } from 'react'
import { mongoApi } from './mongoApi'

const STATUS_LABELS = {
  pending: 'Pending review',
  approved: 'Approved',
  declined: 'Declined',
  expired: 'Expired',
  returned: 'Returned',
}

export default function ActivityPage() {
  const [rentals, setRentals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    mongoApi('/api/rentals/mine')
      .then((data) => setRentals(data.rentals))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="mongo-activity">
      <h1>Activity</h1>
      <p className="settings-copy">Everything you have rented, tracked in one place.</p>

      {error && <p className="settings-error">{error}</p>}
      {loading ? (
        <p className="settings-copy">Loading...</p>
      ) : rentals.length ? (
        <ul className="rental-list request-list">
          {rentals.map((rental) => (
            <li key={rental.id}>
              <strong>{rental.bookTitle}</strong>
              <span className={`request-status request-status-${rental.status}`}>
                {STATUS_LABELS[rental.status] || rental.status}
              </span>
              {rental.status === 'approved' && rental.deliveryAt && (
                <small>Delivery: {new Date(rental.deliveryAt).toLocaleString()}</small>
              )}
              {rental.status === 'pending' && <small>Cash on delivery - waiting for review</small>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="settings-copy">No orders yet - rent a book from Discover.</p>
      )}
    </div>
  )
}
