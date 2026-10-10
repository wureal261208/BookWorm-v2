import { describe, expect, test, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CommunityPage from '../CommunityPage'
import WritePage from '../WritePage'
import { apiFetch } from '../../../utils/apiClient'

const mockNavigateTo = vi.fn()
vi.mock('../../../context/NavigationContext', () => ({
  useNavigation: () => ({
    navigateTo: mockNavigateTo,
  }),
}))

vi.mock('../../../features/auth-firebase/firebaseConfig', () => ({
  auth: {
    currentUser: { uid: 'user-789', email: 'creator@example.com' },
  },
}))

vi.mock('../../../utils/apiClient', () => ({
  apiFetch: vi.fn(),
  publicApiFetch: vi.fn().mockResolvedValue({}),
}))

describe('Community Page — Coming Soon Showcase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('renders Coming Soon header, upcoming feature teasers, and quick action buttons', () => {
    render(<CommunityPage />)

    expect(screen.getByRole('heading', { name: /Community Hub — Coming Soon/i })).toBeInTheDocument()
    expect(screen.getByText(/Reader Book Clubs/i)).toBeInTheDocument()
    expect(screen.getByText(/Community Discussions/i)).toBeInTheDocument()
    expect(screen.getByText(/Reading Challenges/i)).toBeInTheDocument()
    expect(screen.getByText(/Voice Lounges & Live Reads/i)).toBeInTheDocument()

    const writeStoryBtn = screen.getByRole('button', { name: /Write a Story/i })
    fireEvent.click(writeStoryBtn)
    expect(mockNavigateTo).toHaveBeenCalledWith('write', { query: 'tab=story' })

    const writeBookBtn = screen.getByRole('button', { name: /Write a Book/i })
    fireEvent.click(writeBookBtn)
    expect(mockNavigateTo).toHaveBeenCalledWith('write', { query: 'tab=book' })
  })
})

describe('WritePage — Enhanced Navigation, Validation & My Submissions', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    window.history.pushState({}, '', '/write?tab=write')

    apiFetch.mockImplementation((url, options) => {
      if (url.includes('/api/books/mine')) {
        return Promise.resolve({
          books: [
            {
              id: 'book-cover-1',
              _id: 'book-cover-1',
              title: 'Novel With Cover',
              author: 'Jane Author',
              coverUrl: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c',
              status: 'published',
            },
            {
              id: 'book-cover-none',
              _id: 'book-cover-none',
              title: 'Novel Without Cover',
              author: 'John Writer',
              coverUrl: '',
              status: 'draft',
            },
          ],
        })
      }
      if (url.includes('/api/stories/mine')) {
        return Promise.resolve({
          stories: [],
        })
      }
      return Promise.resolve({ success: true })
    })
  })

  test('provides mode selector dropdown and switches between creation modes', () => {
    render(<WritePage account={{ name: 'Jane Author' }} />)

    const select = screen.getByLabelText(/Select creation mode/i)
    expect(select).toBeInTheDocument()

    fireEvent.change(select, { target: { value: 'story' } })
    expect(screen.getByPlaceholderText(/e\.g\. A rainy day reflection/i)).toBeInTheDocument()

    fireEvent.change(select, { target: { value: 'write' } })
    expect(screen.getByLabelText(/Book title/i)).toBeInTheDocument()
  })

  test('validates required fields with modern alerts and triggers toast upon successful book submission', async () => {
    const mockToast = vi.fn()
    render(<WritePage account={{ name: 'Jane Author' }} onToast={mockToast} />)

    // Clear title to trigger validation
    const titleInput = screen.getByLabelText(/Book title/i)
    fireEvent.change(titleInput, { target: { value: '' } })

    const submitBtn = screen.getByRole('button', { name: /Submit for review/i })
    const form = submitBtn.closest('form')
    fireEvent.submit(form)

    expect(await screen.findByText(/Title and author are required/i)).toBeInTheDocument()

    // Fill valid data (cover remains empty - optional!)
    fireEvent.change(titleInput, { target: { value: 'My Masterpiece' } })
    const chapterContent = screen.getByPlaceholderText(/Write this chapter here/i)
    fireEvent.change(chapterContent, { target: { value: 'Once upon a time in a quiet bookstore...' } })

    apiFetch.mockResolvedValueOnce({ success: true, book: { id: 'book-123' } })

    fireEvent.submit(form)

    await vi.waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'success',
          message: expect.stringMatching(/Submitted! An admin will review your book/i),
        })
      )
    })
  })

  test('renders book cover frame with "None" placeholder when book has no cover image', async () => {
    window.history.pushState({}, '', '/write?tab=mine')
    render(<WritePage account={{ name: 'Jane Author' }} />)

    // Switch to books subtab if not already
    const booksSubTab = screen.getByRole('button', { name: /Books/i })
    fireEvent.click(booksSubTab)

    expect(await screen.findByText('Novel With Cover')).toBeInTheDocument()
    expect(screen.getByText('Novel Without Cover')).toBeInTheDocument()

    // Check for the "None" cover placeholder for the book without a cover image
    const nonePlaceholders = screen.getAllByText('None')
    expect(nonePlaceholders.length).toBeGreaterThanOrEqual(1)

    // Check that the book with cover displays its image
    const coverImage = screen.getByAltText('Novel With Cover')
    expect(coverImage).toHaveAttribute('src', 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c')
  })
})
