import { describe, expect, test, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import HomePage from '../HomePage'
import { apiFetch, publicApiFetch } from '../../../utils/apiClient'

vi.mock('../../../utils/apiClient', () => ({
  apiFetch: vi.fn(),
  publicApiFetch: vi.fn(),
}))

vi.mock('../../../context/NavigationContext', () => ({
  useNavigation: () => ({
    navigateTo: vi.fn(),
  }),
}))

vi.mock('../../../features/auth-firebase/firebaseConfig', () => ({
  auth: {
    currentUser: { uid: 'user-sync-1', email: 'reader@example.com' },
  },
}))

const mockAccount = {
  id: 'user-sync-1',
  role: 'customer',
  name: 'Sync Reader',
  email: 'reader@example.com',
}

describe('HomePage - Continue reading & listening synchronization with Bookshelf', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    publicApiFetch.mockResolvedValue({ books: [], items: [] })
  })

  test('only displays reading items that are currently in active shelf and not finished', async () => {
    apiFetch.mockResolvedValueOnce({
      progress: [
        {
          contentId: 'book-101',
          title: 'Active Adventure',
          percent: 35,
          type: 'ebook',
        },
        {
          contentId: 'book-102',
          title: 'Finished Classic',
          percent: 100,
          type: 'ebook',
        },
        {
          contentId: 'book-103',
          title: 'Closed Out Book',
          percent: 50,
          type: 'ebook',
        },
      ],
    })

    // book-101 is actively reading; book-102 is finished; book-103 was closed/removed from profile shelf
    const activeShelf = [
      { bookId: 'book-101', status: 'reading' },
      { bookId: 'book-102', status: 'finished' },
    ]

    render(
      <HomePage
        account={mockAccount}
        shelf={activeShelf}
        progress={{ 'book-101': 35 }}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Continue reading & listening')).toBeInTheDocument()
    })

    // Active Adventure should be shown
    expect(screen.getByText('Active Adventure')).toBeInTheDocument()

    // Finished and Closed Out books must NOT appear in Continue reading
    expect(screen.queryByText('Finished Classic')).not.toBeInTheDocument()
    expect(screen.queryByText('Closed Out Book')).not.toBeInTheDocument()
  })

  test('clicking the dismiss button removes the book from recent items and calls onRemoveShelfBook', async () => {
    apiFetch.mockResolvedValueOnce({
      progress: [
        {
          contentId: 'book-101',
          title: 'Active Adventure',
          percent: 35,
          type: 'ebook',
        },
      ],
    })

    const onRemoveShelfBook = vi.fn()
    const activeShelf = [{ bookId: 'book-101', status: 'reading' }]

    render(
      <HomePage
        account={mockAccount}
        shelf={activeShelf}
        progress={{ 'book-101': 35 }}
        onRemoveShelfBook={onRemoveShelfBook}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Active Adventure')).toBeInTheDocument()
    })

    const dismissBtn = screen.getByRole('button', { name: /Remove Active Adventure from reading shelf/i })
    expect(dismissBtn).toBeInTheDocument()
    fireEvent.click(dismissBtn)

    expect(onRemoveShelfBook).toHaveBeenCalledWith('book-101')
    expect(screen.queryByText('Active Adventure')).not.toBeInTheDocument()
  })
})
