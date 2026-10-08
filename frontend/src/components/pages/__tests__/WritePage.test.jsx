import { describe, expect, test, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import WritePage from '../WritePage'
import { apiFetch } from '../../../utils/apiClient'

vi.mock('../../../features/auth-firebase/firebaseConfig', () => ({
  auth: {
    currentUser: { uid: 'user-123', email: 'author@example.com' },
  },
}))

vi.mock('../../../utils/apiClient', () => ({
  apiFetch: vi.fn(),
  publicApiFetch: vi.fn().mockResolvedValue({}),
}))

describe('WritePage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    window.history.pushState({}, '', '/write?tab=mine')

    apiFetch.mockImplementation((url, options) => {
      if (url.includes('/api/books/mine')) {
        if (options?.method === 'DELETE') {
          return Promise.resolve({ success: true })
        }
        return Promise.resolve({
          books: [
            {
              id: 'book-mine-1',
              _id: 'book-mine-1',
              title: 'My Community Novel',
              author: 'Jane Author',
              status: 'hidden',
              rejectionReason: 'Please fix typo in chapter title',
            },
          ],
        })
      }
      return Promise.resolve({})
    })
  })

  test('activates My books tab from URL query tab=mine and displays admin note', async () => {
    render(<WritePage account={{ name: 'Jane Author' }} />)

    expect(await screen.findByText('My Community Novel')).toBeInTheDocument()
    expect(screen.getByText('Rejected / Ignored')).toBeInTheDocument()
    expect(screen.getByText(/Please fix typo in chapter title/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Delete/i })).toBeInTheDocument()
  })

  test('clicking Delete opens modal and confirming triggers DELETE api request', async () => {
    render(<WritePage account={{ name: 'Jane Author' }} />)

    const deleteBtn = await screen.findByRole('button', { name: /Delete/i })
    fireEvent.click(deleteBtn)

    expect(screen.getByRole('heading', { name: 'Delete book' })).toBeInTheDocument()
    expect(screen.getByText(/Are you sure you want to permanently delete/i)).toBeInTheDocument()

    const confirmDeleteBtn = screen.getByRole('button', { name: /^Delete book$/i })
    fireEvent.click(confirmDeleteBtn)

    expect(apiFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/books/book-mine-1/mine'),
      expect.objectContaining({ method: 'DELETE' })
    )
  })
})
