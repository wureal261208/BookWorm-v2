import { describe, expect, test, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AiSuggestionsPage from '../AiSuggestionsPage'
import { apiFetch } from '../../../utils/apiClient'

vi.mock('../../../features/auth-firebase/firebaseConfig', () => ({
  auth: {
    currentUser: { uid: 'reader-123', email: 'reader@bookworm.test' },
  },
}))

vi.mock('../../../utils/apiClient', () => ({
  apiFetch: vi.fn(),
  publicApiFetch: vi.fn().mockResolvedValue({}),
}))

vi.mock('../../../context/NavigationContext', () => ({
  useNavigation: () => ({
    navigateTo: vi.fn(),
  }),
}))

describe('AiSuggestionsPage - Guided Quick Replies & Dynamic Thinking', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiFetch.mockImplementation((url) => {
      if (url.includes('/api/ai-suggestions/conversations')) {
        return Promise.resolve([])
      }
      return Promise.resolve({})
    })
  })

  test('renders empty state with starter prompts and "Other topic..." button', async () => {
    render(<AiSuggestionsPage />)

    expect(await screen.findByText('Explore BookWorm Library with AI')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Something adventurous/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /A cozy mystery/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Other topic\.\.\./i })).toBeInTheDocument()
  })

  test('clicking "Other topic..." or "Other..." focuses and updates input placeholder', async () => {
    render(<AiSuggestionsPage />)

    const otherBtn = await screen.findByRole('button', { name: /Other topic\.\.\./i })
    const input = screen.getByPlaceholderText(/What are you in the mood to read or listen to\?/i)

    fireEvent.click(otherBtn)

    expect(screen.getByPlaceholderText(/Type your own custom topic or question\.\.\./i)).toBeInTheDocument()
    expect(document.activeElement).toBe(input)
  })

  test('renders assistant message with Quick Replies and clicking a quick reply sends message', async () => {
    let messageSentResolve
    const messageSentPromise = new Promise((resolve) => {
      messageSentResolve = resolve
    })

    apiFetch.mockImplementation((url, options) => {
      if (url === '/api/ai-suggestions/conversations' && options?.method === 'POST') {
        messageSentResolve(options.body)
        return Promise.resolve({
          _id: 'conv-test-1',
          title: options.body.text,
          updatedAt: new Date().toISOString(),
          messages: [
            { role: 'user', text: options.body.text },
            {
              role: 'assistant',
              text: 'What kind of mood are you looking for?',
              options: ['Lighthearted & fun', 'Dark & intense', 'Thought-provoking'],
              suggestions: [],
            },
          ],
        })
      }
      if (url.includes('/api/ai-suggestions/conversations')) {
        return Promise.resolve([])
      }
      return Promise.resolve({})
    })

    render(<AiSuggestionsPage />)

    const starterBtn = await screen.findByRole('button', { name: /Something adventurous/i })
    fireEvent.click(starterBtn)

    // Wait for assistant reply to render
    expect(await screen.findByText('What kind of mood are you looking for?')).toBeInTheDocument()

    // Verify Quick Replies container and chips
    expect(screen.getByText(/Quick replies:/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Lighthearted & fun/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Dark & intense/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Other\.\.\./i })).toBeInTheDocument()

    // Test clicking an option sends that option
    let followUpSentBody
    apiFetch.mockImplementation((url, options) => {
      if (url.includes('/messages') && options?.method === 'POST') {
        followUpSentBody = options.body
        return Promise.resolve({
          _id: 'conv-test-1',
          title: 'Adventures',
          updatedAt: new Date().toISOString(),
          messages: [
            { role: 'user', text: 'Something adventurous' },
            { role: 'assistant', text: 'What kind of mood?' },
            { role: 'user', text: 'Lighthearted & fun' },
            { role: 'assistant', text: 'Here are some adventurous reads!' },
          ],
        })
      }
      return Promise.resolve({})
    })

    fireEvent.click(screen.getByRole('button', { name: /Lighthearted & fun/i }))

    await waitFor(() => {
      expect(followUpSentBody).toEqual({ text: 'Lighthearted & fun' })
    })
  })

  test('displays lively thinking state "Worm is..." when request is in flight', async () => {
    let resolvePost
    const hangingPromise = new Promise((resolve) => {
      resolvePost = resolve
    })

    apiFetch.mockImplementation((url, options) => {
      if (options?.method === 'POST') {
        return hangingPromise
      }
      return Promise.resolve([])
    })

    render(<AiSuggestionsPage />)

    const input = await screen.findByPlaceholderText(/What are you in the mood to read or listen to\?/i)
    fireEvent.change(input, { target: { value: 'Recommend historical fiction' } })
    fireEvent.submit(input.closest('form'))

    // While in flight, Worm thinking bubble must be shown
    expect(screen.getByText(/Worm is/i)).toBeInTheDocument()

    // Finish request
    resolvePost({
      _id: 'conv-test-2',
      title: 'Historical fiction',
      updatedAt: new Date().toISOString(),
      messages: [
        { role: 'user', text: 'Recommend historical fiction' },
        { role: 'assistant', text: 'Great picks for historical fiction!' },
      ],
    })

    await waitFor(() => {
      expect(screen.queryByText(/Worm is analyzing/i)).not.toBeInTheDocument()
    })
  })
})
