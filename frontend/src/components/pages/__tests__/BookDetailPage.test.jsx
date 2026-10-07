import { describe, expect, test, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import BookDetailPage from '../BookDetailPage'

vi.mock('../../../utils/apiClient', () => ({
  apiFetch: vi.fn().mockResolvedValue({}),
  publicApiFetch: vi.fn().mockImplementation((url) => {
    if (url.includes('/comments')) {
      return Promise.resolve({
        comments: [
          {
            id: 'c1',
            text: 'Tuyệt tác kinh điển không thể bỏ qua!',
            createdAt: new Date().toISOString(),
            author: { id: 'u1', name: 'Minh Thư', role: 'customer' },
          },
        ],
      })
    }
    if (url.includes('/api/books') && url.includes('category=')) {
      return Promise.resolve({
        books: [
          {
            _id: 'rel-1',
            id: 'rel-1',
            title: 'Hounds of Baskerville',
            author: 'Arthur Conan Doyle',
            category: 'Mystery',
            views: 4500,
          },
          {
            _id: 'rel-2',
            id: 'rel-2',
            title: 'A Study in Scarlet',
            author: 'Arthur Conan Doyle',
            category: 'Mystery',
            views: 2800,
          },
        ],
      })
    }
    if (url.includes('/api/content') && url.includes('type=audiobook')) {
      return Promise.resolve({
        items: [
          {
            _id: 'rel-audio-1',
            id: 'rel-audio-1',
            title: 'Frankenstein (Audiobook)',
            author: 'Mary Shelley',
            type: 'audiobook',
            category: 'Gothic',
            views: 7200,
          },
        ],
      })
    }
    return Promise.resolve({})
  }),
}))

const mockAccount = {
  id: 'usr-123',
  name: 'Alex Reader',
  email: 'alex@example.com',
  role: 'customer',
}

const mockBook = {
  _id: 'b-sherlock',
  id: 'b-sherlock',
  title: 'Sherlock Holmes',
  author: 'Arthur Conan Doyle',
  category: 'Mystery',
  views: 12000,
  chapters: [
    { number: 1, title: 'Chapter 1: A Scandal in Bohemia' },
  ],
}

const mockAudiobook = {
  _id: 'b-audio-dracula',
  id: 'b-audio-dracula',
  title: 'Dracula Audiobook',
  author: 'Bram Stoker',
  type: 'audiobook',
  category: 'Gothic',
  views: 9500,
  chapters: [
    { number: 1, title: 'Chapter 1: Jonathan Harker Journal' },
  ],
}

describe('BookDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('renders book detail page and displays hero information', () => {
    const onRead = vi.fn()
    render(
      <MemoryRouter>
        <BookDetailPage
          account={mockAccount}
          book={mockBook}
          books={[mockBook]}
          onRead={onRead}
        />
      </MemoryRouter>
    )

    expect(screen.getByText('Sherlock Holmes', { selector: '.detail-title' })).toBeInTheDocument()
    expect(screen.getAllByText(/Arthur Conan Doyle/i).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /Read/i })).toBeInTheDocument()
  })

  test('switches to Comments tab and displays reader-style comments section with formatting tools', async () => {
    render(
      <MemoryRouter>
        <BookDetailPage
          account={mockAccount}
          book={mockBook}
          books={[mockBook]}
          onRead={vi.fn()}
        />
      </MemoryRouter>
    )

    const commentsTab = screen.getByRole('button', { name: /Comments/i })
    fireEvent.click(commentsTab)

    expect(await screen.findByText('Reader comments')).toBeInTheDocument()
    expect(screen.getByText('Community discussion')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /In đậm/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /In nghiêng/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Trích dẫn/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Gạch đầu dòng/i })).toBeInTheDocument()
    expect(await screen.findByText('Tuyệt tác kinh điển không thể bỏ qua!')).toBeInTheDocument()
  })

  test('renders More books recommendations based on category and views', async () => {
    render(
      <MemoryRouter>
        <BookDetailPage
          account={mockAccount}
          book={mockBook}
          books={[mockBook]}
          onRead={vi.fn()}
        />
      </MemoryRouter>
    )

    // Should fetch and display similar books
    const matches = await screen.findAllByText('Hounds of Baskerville')
    expect(matches.length).toBeGreaterThan(0)
    expect(screen.getByText(/Thể loại: Mystery · Nhiều lượt xem nhất/i)).toBeInTheDocument()
  })

  test('handles audiobook detail page with audiobook recommendations and listen button', async () => {
    const onListen = vi.fn()
    render(
      <MemoryRouter>
        <BookDetailPage
          account={mockAccount}
          book={mockAudiobook}
          books={[mockAudiobook]}
          onListen={onListen}
        />
      </MemoryRouter>
    )

    expect(screen.getByText('Dracula Audiobook', { selector: '.detail-title' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Listen/i })).toBeInTheDocument()

    // More books for audiobook
    const audioMatches = await screen.findAllByText(/Frankenstein \(Audiobook\)/i)
    expect(audioMatches.length).toBeGreaterThan(0)
    expect(screen.getByText(/Audiobooks cùng thể loại bạn có thể thích/i)).toBeInTheDocument()
  })
})
