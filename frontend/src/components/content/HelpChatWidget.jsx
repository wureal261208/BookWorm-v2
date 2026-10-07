import { useEffect, useRef, useState } from 'react'
import { auth } from '../../features/auth-firebase/firebaseConfig'
import { apiFetch, publicApiFetch } from '../../utils/apiClient'

const POLL_INTERVAL_MS = 6000

const QUICK_ACTIONS = [
  { label: '#Contact with admin', icon: 'bi-headset', query: '#Contact with admin' },
  { label: 'How to download books?', icon: 'bi-download', query: 'How do I download or read books on BookWorm?' },
  { label: 'Reading goals guide', icon: 'bi-flag', query: 'How do I set and track my annual reading goal?' },
  { label: 'Audiobook player tips', icon: 'bi-headphones', query: 'How do I listen to audiobooks and change playback speed?' },
]

function formatMessageTime(date = new Date()) {
  try {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function HelpChatWidget() {
  const isGuest = !auth.currentUser
  const [phase, setPhase] = useState('loading') // 'loading' | 'rating' | 'chat'
  const [pendingRating, setPendingRating] = useState(null)
  const [ratingValue, setRatingValue] = useState(0)
  const [submittingRating, setSubmittingRating] = useState(false)
  const [conversationId, setConversationId] = useState(null)
  const [messages, setMessages] = useState([])
  const [status, setStatus] = useState('ai')
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const messagesEndRef = useRef(null)

  // Initial load
  useEffect(() => {
    if (isGuest) {
      setPhase('chat')
      return
    }

    let ignore = false
    apiFetch('/api/support/conversations/pending-rating')
      .then((rating) => {
        if (ignore) return
        if (rating) {
          setPendingRating(rating)
          setPhase('rating')
          return
        }
        return apiFetch('/api/support/conversations/current').then((conversation) => {
          if (ignore) return
          if (conversation) {
            setConversationId(conversation._id)
            setMessages(conversation.messages || [])
            setStatus(conversation.status || 'ai')
          }
          setPhase('chat')
        })
      })
      .catch((err) => {
        if (!ignore) {
          setError(err.message)
          setPhase('chat')
        }
      })

    return () => {
      ignore = true
    }
  }, [isGuest])

  // Polling for admin replies when escalated
  useEffect(() => {
    if (phase !== 'chat' || status !== 'escalated' || !conversationId) return undefined

    const interval = setInterval(() => {
      apiFetch(`/api/support/conversations/${conversationId}`)
        .then((conversation) => {
          if (conversation) {
            setMessages(conversation.messages || [])
            setStatus(conversation.status || 'escalated')
          }
        })
        .catch(() => {})
    }, POLL_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [phase, status, conversationId])

  // Scroll to bottom on new message or when typing starts
  useEffect(() => {
    if (typeof messagesEndRef.current?.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [messages.length, sending])

  async function submitRating() {
    if (!ratingValue || !pendingRating?._id) return
    setSubmittingRating(true)
    try {
      await apiFetch(`/api/support/conversations/${pendingRating._id}/rate`, { method: 'POST', body: { rating: ratingValue } })
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmittingRating(false)
      setPhase('chat')
    }
  }

  async function send(overrideText) {
    const text = (overrideText || input).trim()
    if (!text || sending) return

    setSending(true)
    setError('')
    if (!overrideText) setInput('')

    const userMsg = { role: 'user', text, createdAt: new Date().toISOString() }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)

    try {
      if (isGuest) {
        const data = await publicApiFetch('/api/support/guest-chat', {
          method: 'POST',
          body: { messages: nextMessages.map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })) },
        })
        setMessages([...nextMessages, { role: 'assistant', text: data.reply, createdAt: new Date().toISOString() }])
      } else {
        const isContactAdmin = /^\s*#?\s*contact\s+(with\s+)?admin\b/i.test(text)
        const data = await apiFetch('/api/support/conversations/current/messages', {
          method: 'POST',
          body: { text, escalate: isContactAdmin },
        })
        const newItems = (data.newMessages || []).map((m) => ({ ...m, createdAt: m.createdAt || new Date().toISOString() }))
        setMessages([...nextMessages, ...newItems])
        setStatus(data.status || 'ai')
        if (data.conversationId) setConversationId(data.conversationId)
      }
    } catch (err) {
      setError(err.message || 'Failed to send message.')
    } finally {
      setSending(false)
    }
  }

  if (phase === 'loading') {
    return (
      <div className="help-chat-widget">
        <div className="help-chat-loading-state">
          <span className="admin-spin-small" />
          <p>Connecting to BookWorm Help...</p>
        </div>
      </div>
    )
  }

  if (phase === 'rating') {
    return (
      <div className="help-chat-widget help-chat-rating">
        <div className="help-chat-rating-card">
          <i className="bi bi-chat-heart-fill rating-heart-icon" />
          <p>
            Your conversation with <strong>{pendingRating.closedBy?.name || 'our support team'}</strong> has ended. How would you rate your experience?
          </p>
          <div className="help-chat-rating-stars">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                aria-label={`${value} star${value === 1 ? '' : 's'}`}
                className={value <= ratingValue ? 'active' : ''}
                key={value}
                onClick={() => setRatingValue(value)}
                type="button"
              >
                <i className={`bi ${value <= ratingValue ? 'bi-star-fill' : 'bi-star'}`} />
              </button>
            ))}
          </div>
          <div className="admin-row-actions">
            <button className="primary-button" disabled={!ratingValue || submittingRating} onClick={submitRating} type="button">
              {submittingRating ? 'Submitting...' : 'Submit review'}
            </button>
            <button className="ghost-button" onClick={() => setPhase('chat')} type="button">
              Skip
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="help-chat-widget">
      {/* Dynamic Subheader with Live Status & Quick Handoff */}
      <div className="help-chat-subheader">
        <div className="help-chat-status-pill">
          <span className={`status-dot ${status === 'escalated' ? 'status-dot-human' : 'status-dot-ai'}`} />
          <span className="status-label">
            {status === 'escalated' ? 'Human Support' : 'BookWorm AI Assistant'}
          </span>
        </div>
        {status !== 'escalated' && !isGuest && (
          <button
            className="help-chat-escalate-trigger"
            onClick={() => send('#Contact with admin')}
            title="Type #Contact with admin to connect with support"
            type="button"
          >
            <i className="bi bi-headset" />
            <span>Contact admin</span>
          </button>
        )}
      </div>

      {/* Messages Scroll Area */}
      <div className="ai-chat-messages" role="log" aria-live="polite">
        {messages.length === 0 && (
          <div className="help-chat-welcome-box">
            <div className="welcome-avatar-icon">
              <i className="bi bi-stars" />
            </div>
            <strong>Welcome to BookWorm Help</strong>
            <p>Ask anything about reading, finding books, or your account.</p>
            <p className="welcome-hint">
              <i className="bi bi-info-circle" /> Need a human? Type <code>#Contact with admin</code> anytime.
            </p>
          </div>
        )}

        {messages.map((message, index) => {
          const isUser = message.role === 'user'
          const isAdmin = message.role === 'admin'
          const isSystem = message.role === 'system'

          return (
            <div
              className={`ai-chat-bubble ${
                isUser
                  ? 'ai-chat-bubble-user'
                  : isSystem
                  ? 'ai-chat-bubble-system'
                  : isAdmin
                  ? 'ai-chat-bubble-admin'
                  : 'ai-chat-bubble-assistant'
              }`}
              key={message._id || index}
            >
              {!isUser && !isSystem && (
                <span className="ai-chat-role-label">
                  <i className={`bi ${isAdmin ? 'bi-person-badge-fill' : 'bi-robot'}`} />
                  {isAdmin ? ' Support Admin' : ' BookWorm AI'}
                </span>
              )}

              {isSystem ? (
                <div className="system-notice-content">
                  <i className="bi bi-shield-check" />
                  <span>{message.text}</span>
                </div>
              ) : (
                <p>{message.text}</p>
              )}

              <span className="ai-chat-timestamp">
                {formatMessageTime(message.createdAt)}
              </span>
            </div>
          )
        })}

        {/* Animated Typing Indicator */}
        {sending && (
          <div className="ai-chat-bubble ai-chat-bubble-assistant ai-typing-bubble" aria-label="BookWorm is typing...">
            <span className="ai-chat-role-label">
              <i className="bi bi-robot" /> BookWorm AI
            </span>
            <div className="typing-dots-wrap">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          </div>
        )}

        {status === 'escalated' && (
          <div className="help-chat-escalated-alert">
            <div className="escalated-pulse-icon">
              <i className="bi bi-headset" />
            </div>
            <div>
              <strong>Support Ticket Active</strong>
              <p>An admin has been notified and will reply right here soon.</p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Action Suggestion Chips */}
      {status !== 'escalated' && messages.length <= 4 && (
        <div className="help-chat-chips-row" aria-label="Suggested questions">
          {QUICK_ACTIONS.map((action, i) => (
            <button
              className="help-chat-action-chip"
              disabled={sending}
              key={i}
              onClick={() => send(action.query)}
              type="button"
            >
              <i className={`bi ${action.icon}`} />
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="admin-validation-error">
          <i className="bi bi-exclamation-circle" /> {error}
        </p>
      )}

      {/* Input Row */}
      <form
        className="ai-chat-input-row"
        onSubmit={(event) => {
          event.preventDefault()
          send()
        }}
      >
        <input
          aria-label="Chat input"
          disabled={sending}
          onChange={(event) => setInput(event.target.value)}
          placeholder={status === 'escalated' ? 'Send a reply to support admin...' : 'Ask a question or #Contact with admin...'}
          type="text"
          value={input}
        />
        <button
          aria-label="Send message"
          className="primary-button help-chat-send-btn"
          disabled={!input.trim() || sending}
          type="submit"
        >
          <i className={sending ? 'bi bi-arrow-repeat spin' : 'bi bi-send-fill'} />
        </button>
      </form>
    </div>
  )
}

export default HelpChatWidget
