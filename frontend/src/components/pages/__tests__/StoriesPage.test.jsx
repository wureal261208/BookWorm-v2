import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import StoriesPage from '../StoriesPage'
import { apiFetch, publicApiFetch } from '../../../utils/apiClient'

const mockNavigateTo = vi.fn()

vi.mock('../../../features/auth-firebase/firebaseConfig', () => ({
  auth: {
    currentUser: { uid: 'user-reader-1', email: 'reader@example.com' },
  },
}))

vi.mock('../../../utils/apiClient', () => ({
  apiFetch: vi.fn(),
  publicApiFetch: vi.fn(),
}))

vi.mock('../../../context/NavigationContext', () => ({
  useNavigation: () => ({
    navigateTo: mockNavigateTo,
  }),
}))

const mockStories = [
  {
    id: 'story-1',
    _id: 'story-1',
    title: 'Autumn Rain Reflections',
    content: 'The leaves began falling gently across the cobblestone pathway...',
    authorName: 'Hannah Vance',
    authorAvatar: '',
    tags: ['reflection', 'stories'],
    type: 'story',
    likesCount: 12,
    isLiked: false,
    views: 45,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'story-2',
    _id: 'story-2',
    title: 'Late Night Coffee Monologue',
    content: 'A brief voice note recorded while finishing chapter four.',
    authorName: 'Marcus Bell',
    authorAvatar: '',
    tags: ['audio', 'stories'],
    type: 'audio-story',
    audioUrl: 'https://example.com/audio/sample.webm',
    audioDuration: 75,
    likesCount: 8,
    isLiked: true,
    views: 30,
    createdAt: new Date().toISOString(),
  },
]

describe('StoriesPage - Community Stories and Voice Recordings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    publicApiFetch.mockResolvedValue({
      stories: mockStories,
      total: 2,
      page: 1,
      pages: 1,
    })
  })

  test('renders hero header, filters, search bar, and topics', async () => {
    render(<StoriesPage account={{ name: 'Reader' }} onToast={vi.fn()} />)

    expect(screen.getByText(/Stories & Voice Recordings/i)).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /All Stories/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Voice Recordings/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Written Stories/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Search by title, author, or keyword/i)).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Autumn Rain Reflections')).toBeInTheDocument()
      expect(screen.getByText('Late Night Coffee Monologue')).toBeInTheDocument()
    })
  })

  test('filters by type when clicking Voice Recordings tab', async () => {
    render(<StoriesPage account={{ name: 'Reader' }} onToast={vi.fn()} />)

    const voiceTab = screen.getByRole('tab', { name: /Voice Recordings/i })
    fireEvent.click(voiceTab)

    await waitFor(() => {
      expect(publicApiFetch).toHaveBeenCalledWith(expect.stringContaining('type=audio-story'))
    })
  })

  test('calls like API and updates like count on story like click', async () => {
    apiFetch.mockResolvedValueOnce({
      isLiked: true,
      likesCount: 13,
    })

    render(<StoriesPage account={{ name: 'Reader' }} onToast={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Autumn Rain Reflections')).toBeInTheDocument()
    })

    const likeButtons = screen.getAllByRole('button', { name: /Like story/i })
    fireEvent.click(likeButtons[0])

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/api/stories/story-1/like', { method: 'POST' })
    })
  })

  test('clicking on a story opens the story reader modal with full details', async () => {
    render(<StoriesPage account={{ name: 'Reader' }} onToast={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Autumn Rain Reflections')).toBeInTheDocument()
    })

    const title = screen.getByText('Autumn Rain Reflections')
    fireEvent.click(title)

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getAllByText(/The leaves began falling gently across the cobblestone pathway/i).length).toBeGreaterThanOrEqual(1)
    })

    const closeBtn = screen.getByRole('button', { name: /Close story/i })
    fireEvent.click(closeBtn)

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  test('Share a Story button navigates to write page with story tab', () => {
    render(<StoriesPage account={{ name: 'Reader' }} onToast={vi.fn()} />)

    const shareBtn = screen.getByRole('button', { name: /Share a Story & Voice/i })
    fireEvent.click(shareBtn)

    expect(mockNavigateTo).toHaveBeenCalledWith('write', { query: 'tab=story' })
  })

  test('submitting a comment in story modal calls POST /api/stories/:id/comments and renders comment', async () => {
    publicApiFetch.mockImplementation((url) => {
      if (url.includes('/comments')) {
        return Promise.resolve({
          comments: [
            {
              id: 'c-1',
              _id: 'c-1',
              authorName: 'Luna Lovegood',
              text: 'Very poetic and atmospheric!',
              createdAt: new Date().toISOString(),
            },
          ],
        })
      }
      return Promise.resolve({
        stories: mockStories,
        total: 2,
        page: 1,
        pages: 1,
      })
    })

    apiFetch.mockResolvedValueOnce({
      comment: {
        id: 'c-2',
        _id: 'c-2',
        authorName: 'Alex Reader',
        text: 'I loved reading this piece.',
        createdAt: new Date().toISOString(),
      },
      commentsCount: 2,
    })

    render(<StoriesPage account={{ name: 'alex.reader@domain.com', uid: 'user-reader-1' }} onToast={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Autumn Rain Reflections')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Autumn Rain Reflections'))

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('Community Comments')).toBeInTheDocument()
      expect(screen.getByText('Very poetic and atmospheric!')).toBeInTheDocument()
    })

    const commentInput = screen.getByRole('textbox', { name: /Write a comment/i })
    fireEvent.change(commentInput, { target: { value: 'I loved reading this piece.' } })

    const postBtn = screen.getByRole('button', { name: /Post Comment/i })
    fireEvent.click(postBtn)

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/stories/story-1/comments',
        expect.objectContaining({
          method: 'POST',
          body: { text: 'I loved reading this piece.' },
        })
      )
      expect(screen.getByText('I loved reading this piece.')).toBeInTheDocument()
    })
  })
})
