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

  test('displays dialogue and white banner when conversation is closed, and allows starting new chat', async () => {
    apiFetch.mockImplementation((url) => {
      if (url.includes('pending-rating')) {
        return Promise.resolve({
          _id: 'conv-closed-1',
          closedBy: { name: 'Support Admin John' },
        })
      }
      if (url.includes('conversations/conv-closed-1')) {
        return Promise.resolve({
          _id: 'conv-closed-1',
          status: 'closed',
          messages: [
            { role: 'user', text: 'I need help with my purchase' },
            { role: 'admin', text: 'Hello! I have resolved your account issue.' },
          ],
        })
      }
      return Promise.resolve(null)
    })

    render(<HelpChatWidget />)

    // Verify messages from customer and admin are visible
    expect(await screen.findByText('I need help with my purchase')).toBeInTheDocument()
    expect(screen.getByText('Hello! I have resolved your account issue.')).toBeInTheDocument()
    expect(screen.getAllByText(/Support Admin/i).length).toBeGreaterThan(0)

    // Verify the white closed conversation banner in English
    expect(screen.getByText('Conversation Closed')).toBeInTheDocument()
    expect(
      screen.getByText(
        'This conversation has been closed. If you have further questions, feel free to start a new chat.'
      )
    ).toBeInTheDocument()

    // Verify "Start a new chat" button
    const newChatBtns = screen.getAllByRole('button', { name: /Start a new chat/i })
    expect(newChatBtns.length).toBeGreaterThan(0)

    // Click start a new chat
    fireEvent.click(newChatBtns[0])

    // Should return to fresh AI chat session
    expect(await screen.findByText(/Welcome to BookWorm Help/i)).toBeInTheDocument()
  })

  test('loads conversation when open-help-chat event is dispatched', async () => {
    apiFetch.mockImplementation((url) => {
      if (url.includes('pending-rating')) return Promise.resolve(null)
      if (url.includes('conversations/current')) {
        return Promise.resolve({ _id: 'conv-101', status: 'ai', messages: [] })
      }
      if (url.includes('conversations/conv-target-99')) {
        return Promise.resolve({
          _id: 'conv-target-99',
          status: 'escalated',
          messages: [
            { role: 'user', text: 'Previous question to admin' },
            { role: 'admin', text: 'Admin response from ticket' },
          ],
        })
      }
      return Promise.resolve(null)
    })

    render(<HelpChatWidget />)

    expect(await screen.findByText(/Welcome to BookWorm Help/i)).toBeInTheDocument()

    // Fire open-help-chat event as if user clicked notification
    fireEvent(
      window,
      new CustomEvent('open-help-chat', {
        detail: { conversationId: 'conv-target-99' },
      })
    )

    expect(await screen.findByText('Previous question to admin')).toBeInTheDocument()
    expect(screen.getByText('Admin response from ticket')).toBeInTheDocument()
  })
})
