export function buildRentalRecord(book, now = new Date()) {
  const rentalDurationDays = 7
  const startDate = new Date(now)
  const expiresAt = new Date(startDate)
  expiresAt.setDate(startDate.getDate() + rentalDurationDays)

  return {
    id: book.id,
    title: book.title,
    author: book.author || '',
    rentedAt: startDate.toISOString(),
    expiresAt: expiresAt.toISOString(),
    status: 'active',
    days: rentalDurationDays,
  }
}

export function getRentalStatus(rental, now = new Date()) {
  if (!rental) return 'inactive'
  return new Date(rental.expiresAt) <= now ? 'expired' : 'active'
}

export function formatRentalExpiry(rental, now = new Date()) {
  const status = getRentalStatus(rental, now)
  if (status === 'expired') return 'Expired'

  return `Ends ${new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(rental.expiresAt))}`
}

export function getRentalLabel(rental, now = new Date()) {
  return getRentalStatus(rental, now) === 'active' ? 'Rented' : 'Expired'
}

export function formatDeliveryDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
