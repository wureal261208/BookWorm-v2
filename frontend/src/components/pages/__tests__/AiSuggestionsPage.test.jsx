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

  test('clicking a starter button populates input and submitting sends message', async () => {
    let sentBody
    apiFetch.mockImplementation((url, options) => {
      if (url === '/api/ai-suggestions/conversations' && options?.method === 'POST') {
        sentBody = options.body
        return Promise.resolve({
          _id: 'conv-test-1',
          title: options.body.text,
          updatedAt: new Date().toISOString(),
          messages: [
            { role: 'user', text: options.body.text },
            {
              role: 'assistant',
              text: 'What kind of mood are you looking for?',
              options: ['Lighthearted & fun', 'Dark & intense'],
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
    const input = screen.getByRole('textbox')

    // Clicking button populates the chat input
    fireEvent.click(starterBtn)
    expect(input.value).toBe('Something adventurous')

    // Submitting with Enter / Send button
    fireEvent.submit(input.closest('form'))

    await waitFor(() => {
      expect(sentBody).toEqual({ text: 'Something adventurous' })
    })

    // Verify AI response rendered
    expect(await screen.findByText('What kind of mood are you looking for?')).toBeInTheDocument()

    // Verify options are docked on the chat bar
    expect(screen.getByText(/Suggested choices:/i)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Lighthearted & fun/i }).length).toBeGreaterThan(0)
  })

  test('selecting a docked option button loads it into chat bar, then submitting sends it', async () => {
    apiFetch.mockImplementation((url, options) => {
      if (url === '/api/ai-suggestions/conversations' && options?.method === 'POST') {
        return Promise.resolve({
          _id: 'conv-test-1',
          title: options.body.text,
          updatedAt: new Date().toISOString(),
          messages: [
            { role: 'user', text: options.body.text },
            {
              role: 'assistant',
              text: 'What kind of mood?',
              options: ['Lighthearted & fun', 'Dark & intense'],
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

    // Trigger initial message
    const starterBtn = await screen.findByRole('button', { name: /Something adventurous/i })
    const input = screen.getByRole('textbox')
    fireEvent.click(starterBtn)
    fireEvent.submit(input.closest('form'))

    // Wait for options to appear
    await screen.findByText('What kind of mood?')

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
            { role: 'assistant', text: 'Great picks for fun!' },
          ],
        })
      }
      return Promise.resolve({})
    })

    // Click the docked chip option
    const optionBtns = screen.getAllByRole('button', { name: /Lighthearted & fun/i })
    fireEvent.click(optionBtns[0])

    // Verify input contains the chosen option
    expect(input.value).toBe('Lighthearted & fun')

    // Press Enter or click Send to submit
    fireEvent.submit(input.closest('form'))

    await waitFor(() => {
      expect(followUpSentBody).toEqual({ text: 'Lighthearted & fun' })
    })
  })

  test('clicking "Other (type below)..." clears option and focuses input for custom typing', async () => {
    render(<AiSuggestionsPage />)

    const input = await screen.findByRole('textbox')
    const otherBtn = screen.getByRole('button', { name: /Other topic\.\.\./i })

    fireEvent.click(otherBtn)

    expect(document.activeElement).toBe(input)
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

    const input = await screen.findByRole('textbox')
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
