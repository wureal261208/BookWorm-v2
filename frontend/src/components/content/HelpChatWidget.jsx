import { useEffect, useRef, useState } from 'react'
import { auth } from '../../features/auth-firebase/firebaseConfig'
import { apiFetch, publicApiFetch } from '../../utils/apiClient'

const POLL_INTERVAL_MS = 6000

// The floating chat bubble's actual content - separate from the AI
// Suggestions page's book-recommendation chat (AiSuggestionsPage.jsx).
// Single-use per open, per Wun's call: a plain AI-only conversation never
// carries over between opens (this component only mounts while the bubble
// is open, so a fresh instance is a fresh conversation). The one exception
// is a conversation a human admin is actively handling ('escalated') -
// that DOES resume on reopen and polls for new admin replies while open,
// because losing track of an active support conversation would defeat the
// point of escalating it in the first place. A closed, rated-or-not
// conversation always starts fresh - see getPendingRating below for the
// one thing it's still used for (asking for a rating once).
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

  // Guests skip straight to a blank chat - no account, so no pending
  // rating and no escalated conversation to resume.
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
            setMessages(conversation.messages)
            setStatus(conversation.status)
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

  // Polls for admin replies while an escalated conversation is open - no
  // websocket in this app, so a short interval is the simplest way for a
  // reply to show up without the visitor having to send another message.
  useEffect(() => {
    if (phase !== 'chat' || status !== 'escalated' || !conversationId) return undefined

    const interval = setInterval(() => {
      apiFetch(`/api/support/conversations/${conversationId}`)
        .then((conversation) => {
          setMessages(conversation.messages)
          setStatus(conversation.status)
        })
        .catch(() => {
          // A transient poll failure isn't worth surfacing as an error -
          // it'll just try again next tick.
        })
    }, POLL_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [phase, status, conversationId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  async function submitRating() {
    if (!ratingValue) return
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

  async function send() {
    const text = input.trim()
    if (!text || sending) return

    setSending(true)
    setError('')
    setInput('')
    const nextMessages = [...messages, { role: 'user', text }]
    setMessages(nextMessages)

    try {
      if (isGuest) {
        const data = await publicApiFetch('/api/support/guest-chat', {
          method: 'POST',
          body: { messages: nextMessages.map((message) => ({ role: message.role === 'user' ? 'user' : 'assistant', content: message.text })) },
        })
        setMessages([...nextMessages, { role: 'assistant', text: data.reply }])
      } else {
        const data = await apiFetch('/api/support/conversations/current/messages', { method: 'POST', body: { text } })
        setMessages([...nextMessages, ...data.newMessages])
        setStatus(data.status)
        if (data.conversationId) setConversationId(data.conversationId)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  if (phase === 'loading') return <div className="help-chat-widget"><p>Loading...</p></div>

  if (phase === 'rating') {
    return (
      <div className="help-chat-widget help-chat-rating">
        <p>
          Your conversation with <strong>{pendingRating.closedBy?.name || 'our support team'}</strong> has ended. How would you rate the help you
          received?
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
            Submit
          </button>
          <button className="ghost-button" onClick={() => setPhase('chat')} type="button">
            Skip
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="help-chat-widget">
      <div className="ai-chat-messages">
        {messages.length === 0 && <p className="empty-state">Hi! Ask us anything about BookWorm.</p>}
        {messages.map((message, index) => (
          <div
            className={`ai-chat-bubble ${
              message.role === 'user'
                ? 'ai-chat-bubble-user'
                : message.role === 'system'
                  ? 'ai-chat-bubble-system'
                  : message.role === 'admin'
                    ? 'ai-chat-bubble-admin'
                    : 'ai-chat-bubble-assistant'
            }`}
            key={index}
          >
            {message.role === 'admin' && <span className="ai-chat-role-label">Support</span>}
            <p>{message.text}</p>
          </div>
        ))}
        {status === 'escalated' && <p className="help-chat-status">Waiting for an admin to reply...</p>}
        <div ref={messagesEndRef} />
      </div>

      {error && <p className="admin-validation-error"><i className="bi bi-x-circle" /> {error}</p>}

      <form
        className="ai-chat-input-row"
        onSubmit={(event) => {
          event.preventDefault()
          send()
        }}
      >
        <input onChange={(event) => setInput(event.target.value)} placeholder="Type a message..." type="text" value={input} />
        <button className="primary-button" disabled={!input.trim() || sending} type="submit">
          <i className="bi bi-send" />
        </button>
      </form>
    </div>
  )
}

export default HelpChatWidget
