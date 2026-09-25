import { useEffect, useRef, useState } from 'react'
import { auth } from '../../features/auth-firebase/firebaseConfig'
import { apiFetch, publicApiFetch } from '../../utils/apiClient'

// The floating chat bubble's actual content - separate from the AI
// Suggestions page's book-recommendation chat (AiSuggestionsPage.jsx).
// Single-use per open, per Wun's call: this component only ever mounts
// while the bubble is open (see AppShell.jsx's `{isOpen && <ChatWidget/>}`
// wrapping it), so a fresh component instance - fresh state, no history
// fetch - is exactly what "reset every time you open it" means here. No
// history is loaded even for a logged-in visitor with a real pending
// conversation; only what accrues during this one open session is shown.
//
// Guests get a fully stateless AI-only reply (see backend's
// POST /api/support/guest-chat - nothing written to Mongo, no escalation,
// since there's no account to notify later). A logged-in visitor still
// goes through the persisted, escalatable conversation - AI answers first,
// and after enough unresolved messages a human admin takes over (see
// backend/controllers/supportController.js) - it's just that this widget
// never shows them anything from before this open.
function HelpChatWidget() {
  const isGuest = !auth.currentUser
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('ai')
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

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
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
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
