import { useEffect, useRef, useState } from 'react'
import { auth } from '../../features/auth-firebase/firebaseConfig'
import { apiFetch } from '../../utils/apiClient'

// The floating chat bubble's actual content - separate from the AI
// Suggestions page's book-recommendation chat (AiSuggestionsPage.jsx). This
// one is a support/help conversation: the AI answers first, and after a
// few unresolved messages a human admin takes over (see
// backend/controllers/supportController.js for the exact threshold). Once
// an admin closes it, it goes blank here and the next message starts a
// fresh conversation - that's just what GET current naturally returns
// once the old one is 'closed' server-side, nothing special needed here.
function HelpChatWidget() {
  const isGuest = !auth.currentUser
  const [conversation, setConversation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const messagesEndRef = useRef(null)

  useEffect(() => {
    if (isGuest) {
      setLoading(false)
      return
    }
    let ignore = false
    apiFetch('/api/support/conversations/current')
      .then((data) => {
        if (!ignore) setConversation(data)
      })
      .catch((err) => {
        if (!ignore) setError(err.message)
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [isGuest])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' })
  }, [conversation?.messages?.length])

  async function send() {
    const text = input.trim()
    if (!text || sending) return

    setSending(true)
    setError('')
    setInput('')
    try {
      const data = await apiFetch('/api/support/conversations/current/messages', { method: 'POST', body: { text } })
      setConversation(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  if (isGuest) {
    return (
      <div className="help-chat-widget">
        <p className="empty-state">Log in to chat with support.</p>
      </div>
    )
  }

  if (loading) return <div className="help-chat-widget"><p>Loading...</p></div>

  const messages = conversation?.messages || []
  const isEscalated = conversation?.status === 'escalated'

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
        {isEscalated && <p className="help-chat-status">Waiting for an admin to reply...</p>}
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
