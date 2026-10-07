import { describe, expect, test, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import HelpChatWidget from '../HelpChatWidget'

vi.mock('../../../features/auth-firebase/firebaseConfig', () => ({
  auth: {
    currentUser: { uid: 'usr-123', email: 'reader@example.com' },
  },
}))

vi.mock('../../../utils/apiClient', () => ({
  apiFetch: vi.fn(),
  publicApiFetch: vi.fn(),
}))

import { apiFetch, publicApiFetch } from '../../../utils/apiClient'

describe('HelpChatWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiFetch.mockImplementation((url) => {
      if (url.includes('pending-rating')) return Promise.resolve(null)
      if (url.includes('conversations/current')) {
        return Promise.resolve({
          _id: 'conv-101',
          status: 'ai',
          messages: [],
        })
      }
      return Promise.resolve({})
    })
  })

  test('renders chat subheader, live status badge, and welcome hint with #Contact with admin', async () => {
    render(<HelpChatWidget />)

    expect(await screen.findByText('BookWorm AI Assistant')).toBeInTheDocument()
    expect(screen.getByText('Contact admin')).toBeInTheDocument()
    expect(screen.getByText(/Welcome to BookWorm Help/i)).toBeInTheDocument()
    expect(screen.getAllByText(/#Contact with admin/i).length).toBeGreaterThan(0)
  })

  test('displays quick action chips including #Contact with admin', async () => {
    render(<HelpChatWidget />)

    expect(await screen.findByRole('button', { name: /#Contact with admin/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /How to download books\?/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reading goals guide/i })).toBeInTheDocument()
  })

  test('clicking #Contact with admin chip triggers escalation with human support message', async () => {
    apiFetch.mockImplementation((url, opts) => {
      if (url.includes('pending-rating')) return Promise.resolve(null)
      if (url.includes('conversations/current/messages')) {
        return Promise.resolve({
          status: 'escalated',
          conversationId: 'conv-101',
          newMessages: [
            {
              role: 'system',
              text: 'You have requested human support (#Contact with admin). You are now connected with our support team - an admin will reply here soon.',
              createdAt: new Date().toISOString(),
            },
          ],
        })
      }
      if (url.includes('conversations/current')) {
        return Promise.resolve({ _id: 'conv-101', status: 'ai', messages: [] })
      }
      return Promise.resolve({})
    })

    render(<HelpChatWidget />)

    const contactChip = await screen.findByRole('button', { name: /#Contact with admin/i })
    fireEvent.click(contactChip)

    expect(await screen.findByText(/Support Ticket Active/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Human Support/i).length).toBeGreaterThan(0)
    expect(apiFetch).toHaveBeenCalledWith(
      '/api/support/conversations/current/messages',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          text: '#Contact with admin',
          escalate: true,
        }),
      })
    )
  })

  test('typing regular message gets AI response and displays typing indicator while sending', async () => {
    let resolveReply
    const slowReplyPromise = new Promise((resolve) => {
      resolveReply = resolve
    })

    apiFetch.mockImplementation((url) => {
      if (url.includes('pending-rating')) return Promise.resolve(null)
      if (url.includes('conversations/current/messages')) return slowReplyPromise
      if (url.includes('conversations/current')) {
        return Promise.resolve({ _id: 'conv-101', status: 'ai', messages: [] })
      }
      return Promise.resolve({})
    })

    render(<HelpChatWidget />)

    const input = await screen.findByLabelText(/Chat input/i)
    fireEvent.change(input, { target: { value: 'How many chapters are there?' } })

    const sendBtn = screen.getByLabelText(/Send message/i)
    fireEvent.click(sendBtn)

    // Should display the user message and typing indicator
    expect(screen.getByText('How many chapters are there?')).toBeInTheDocument()
    expect(screen.getByLabelText(/BookWorm is typing/i)).toBeInTheDocument()

    // Resolve reply
    resolveReply({
      status: 'ai',
      conversationId: 'conv-101',
      newMessages: [
        {
          role: 'assistant',
          text: 'Most books have 10-15 chapters.',
          createdAt: new Date().toISOString(),
        },
      ],
    })

    expect(await screen.findByText('Most books have 10-15 chapters.')).toBeInTheDocument()
  })
})
