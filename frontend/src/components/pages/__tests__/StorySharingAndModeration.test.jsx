import { describe, expect, test, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import WritePage from '../WritePage'
import HomePage from '../HomePage'
import { apiFetch, publicApiFetch } from '../../../utils/apiClient'

vi.mock('../../../features/auth-firebase/firebaseConfig', () => ({
  auth: {
    currentUser: { uid: 'user-writer', email: 'writer@example.com' },
  },
}))

vi.mock('../../../utils/apiClient', () => ({
  apiFetch: vi.fn(),
  publicApiFetch: vi.fn(),
}))

vi.mock('../../../context/NavigationContext', () => ({
  useNavigation: () => ({
    navigateTo: vi.fn(),
  }),
}))

describe('Story Sharing & Community Voices Flow', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()

    publicApiFetch.mockImplementation((url) => {
      if (url.includes('/api/stories')) {
        return Promise.resolve({
          stories: [
            {
              id: 'story-home-1',
              _id: 'story-home-1',
              title: 'My Rainy Afternoon',
              content: 'Listening to rain while reading a favorite classic.',
              authorName: 'Alex',
              authorAvatar: '',
              tags: ['stories'],
              type: 'audio-story',
              audioUrl: '/uploads/rain.webm',
              audioDuration: 30,
              likesCount: 5,
              views: 24,
              createdAt: new Date().toISOString(),
            },
          ],
        })
      }
      if (url.includes('/api/books')) {
        return Promise.resolve({
          books: [
            {
              id: 'book-home-1',
              _id: 'book-home-1',
              title: 'Echoes of the Valley',
              author: 'Community Writer',
              status: 'published',
              createdByRole: 'customer',
              category: 'Fiction',
            },
          ],
        })
      }
      return Promise.resolve({ items: [] })
    })

    apiFetch.mockImplementation((url) => {
      if (url.includes('/api/stories')) {
        return Promise.resolve({
          stories: [],
          story: { id: 'new-story', title: 'New Story' },
        })
      }
      if (url.includes('/api/books/mine')) {
        return Promise.resolve({ books: [] })
      }
      return Promise.resolve({})
    })
  })

  test('WritePage renders Share a Story & Voice studio by default', () => {
    render(<WritePage account={{ name: 'Alex' }} />)

    expect(screen.getByRole('tab', { name: /Share a Story & Voice/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Write a Book/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /My Submissions/i })).toBeInTheDocument()

    expect(screen.getByPlaceholderText(/e\.g\. A rainy day reflection/i)).toBeInTheDocument()
    expect(screen.getByText(/Voice Recording Studio/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Start recording voice/i })).toBeInTheDocument()
  })

  test('Submitting a story calls POST /api/stories', async () => {
    render(<WritePage account={{ name: 'Alex' }} />)

    const titleInput = screen.getByPlaceholderText(/e\.g\. A rainy day reflection/i)
    const contentInput = screen.getByPlaceholderText(/Share your thoughts, experiences/i)

    fireEvent.change(titleInput, { target: { value: 'My First Audio Story' } })
    fireEvent.change(contentInput, { target: { value: 'This is my audio reflection text.' } })

    const publishBtn = screen.getByRole('button', { name: /Share story to community/i })
    fireEvent.click(publishBtn)

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/stories',
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  test('HomePage displays People share their own stories & audio section and community books section', async () => {
    render(
      <HomePage
        account={{ name: 'Alex', role: 'customer' }}
        books={[]}
        favorites={[]}
      />
    )

    expect(await screen.findByText(/People share their own stories & audio/i)).toBeInTheDocument()
    expect(screen.getAllByText('#stories').length).toBeGreaterThanOrEqual(1)
    expect(await screen.findByText('My Rainy Afternoon')).toBeInTheDocument()

    expect(await screen.findByText(/People share their own books/i)).toBeInTheDocument()
    expect(screen.getByText('#ebooks')).toBeInTheDocument()
    expect(screen.getByText('#audiobooks')).toBeInTheDocument()
  })
})
