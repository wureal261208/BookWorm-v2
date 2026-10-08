import { describe, expect, test, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ProfilePage from '../ProfilePage'
import { apiFetch, publicApiFetch } from '../../../utils/apiClient'

vi.mock('../../../utils/apiClient', () => ({
  apiFetch: vi.fn(),
  publicApiFetch: vi.fn(),
}))

const mockAccount = {
  id: 'usr-456',
  displayId: 'BW-1234',
  name: 'Jane Author',
  email: 'jane@example.com',
  role: 'customer',
}

const mockBooks = [
  {
    id: 'book-fav-1',
    _id: 'book-fav-1',
    title: 'Saved Fantasy Tale',
    author: 'Famous Author',
  },
]

describe('ProfilePage - Personal Bookshelf and Authored Deletion Flow', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()

    apiFetch.mockImplementation((url) => {
      if (url.includes('/api/users/me/shelf')) {
        return Promise.resolve({
          shelf: [{ bookId: 'book-fav-1', status: 'want_to_read' }],
        })
      }
      if (url.includes('/api/users/me/progress')) {
        return Promise.resolve({ progress: [{ contentId: 'book-fav-1', percent: 20 }] })
      }
      if (url.includes('/api/books/mine')) {
        return Promise.resolve({
          books: [
            {
              _id: 'authored-1',
              id: 'authored-1',
              title: 'My Rejected Manuscript',
              author: 'Jane Author',
              status: 'hidden',
              rejectionReason: 'Incomplete chapter text and low resolution cover',
            },
          ],
        })
      }
      return Promise.resolve({})
    })

    publicApiFetch.mockImplementation((url) => {
      if (url.includes('book-fav-1')) {
        return Promise.resolve({
          book: {
            id: 'book-fav-1',
            _id: 'book-fav-1',
            title: 'Saved Fantasy Tale',
            author: 'Famous Author',
          },
        })
      }
      return Promise.resolve({})
    })
  })

  test('keeps saved books in Want to read tab even when reading progress exists', async () => {
    render(
      <ProfilePage
        account={mockAccount}
        books={mockBooks}
        shelf={[{ bookId: 'book-fav-1', status: 'want_to_read' }]}
        favorites={['book-fav-1']}
        progress={{ 'book-fav-1': 20 }}
      />
    )

    const wantTab = screen.getByRole('tab', { name: /Want to read/i })
    expect(wantTab).toBeInTheDocument()
    fireEvent.click(wantTab)

    expect(screen.getAllByText('Saved Fantasy Tale').length).toBeGreaterThan(0)
  })

  test('displays admin rejection note and Delete button on Authored books', async () => {
    const onNavigate = vi.fn()
    render(
      <ProfilePage
        account={mockAccount}
        books={mockBooks}
        shelf={[]}
        progress={{}}
        onNavigate={onNavigate}
      />
    )

    const authoredTab = screen.getByRole('tab', { name: /Authored/i })
    fireEvent.click(authoredTab)

    expect(await screen.findByText('My Rejected Manuscript')).toBeInTheDocument()
    expect(screen.getByText('Rejected / Ignored')).toBeInTheDocument()
    expect(screen.getByText(/Incomplete chapter text and low resolution cover/i)).toBeInTheDocument()

    const deleteBtn = screen.getByRole('button', { name: /Delete/i })
    expect(deleteBtn).toBeInTheDocument()
    fireEvent.click(deleteBtn)

    expect(onNavigate).toHaveBeenCalledWith('write', { query: 'tab=mine' })
  })

  test('removes book from shelf when remove button is clicked', async () => {
    const onRemoveShelfBook = vi.fn()
    render(
      <ProfilePage
        account={mockAccount}
        books={mockBooks}
        shelf={[{ bookId: 'book-fav-1', status: 'want_to_read' }]}
        favorites={['book-fav-1']}
        progress={{}}
        onRemoveShelfBook={onRemoveShelfBook}
      />
    )

    const wantTab = screen.getByRole('tab', { name: /Want to read/i })
    fireEvent.click(wantTab)

    expect(screen.getAllByText('Saved Fantasy Tale').length).toBeGreaterThan(0)

    const removeBtn = screen.getByRole('button', { name: /Remove Saved Fantasy Tale from shelf/i })
    expect(removeBtn).toBeInTheDocument()
    fireEvent.click(removeBtn)

    expect(onRemoveShelfBook).toHaveBeenCalledWith('book-fav-1')
    expect(screen.queryByText('Saved Fantasy Tale')).not.toBeInTheDocument()
  })
})

