import { useEffect, useRef, useState } from 'react'
import { auth } from '../../features/auth-firebase/firebaseConfig'
import { apiFetch } from '../../utils/apiClient'
import { useNavigation } from '../../context/NavigationContext'

const STARTER_PROMPTS = ['Something adventurous', 'A cozy mystery', 'A great audiobook for a commute', 'Classic literature']

// Claude-style layout: a sidebar of past conversations (fetched once, see
// loadConversations) and a main pane where only the message list scrolls -
// the input row stays fixed at the bottom regardless of scroll position
// (see the CSS grid on .ai-suggestions-layout/.ai-suggestions-main).
// Every conversation belongs to exactly one account (see
// backend/controllers/aiSuggestionsController.js's ownership checks on
// every route) - that's what "history" safely means here, so this whole
// page requires login rather than falling back to a stateless anonymous
// chat with nothing to show in a sidebar.
function AiSuggestionsPage() {
  const { navigateTo } = useNavigation()
  const isGuest = !auth.currentUser
  const [conversations, setConversations] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [messages, setMessages] = useState([])
  const [loadingList, setLoadingList] = useState(true)
  const [loadingConversation, setLoadingConversation] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const messagesEndRef = useRef(null)

  useEffect(() => {
    if (isGuest) {
      setLoadingList(false)
      return
    }
    apiFetch('/api/ai-suggestions/conversations')
      .then((data) => setConversations(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message))
      .finally(() => setLoadingList(false))
  }, [isGuest])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  function openConversation(id) {
    setActiveId(id)
    setLoadingConversation(true)
    setError('')
    apiFetch(`/api/ai-suggestions/conversations/${id}`)
      .then((data) => setMessages(data.messages || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoadingConversation(false))
  }

  function startNewChat() {
    setActiveId(null)
    setMessages([])
    setError('')
  }

  async function deleteConversation(id, event) {
    event.stopPropagation()
    try {
      await apiFetch(`/api/ai-suggestions/conversations/${id}`, { method: 'DELETE' })
      setConversations((current) => current.filter((conversation) => conversation.id !== id))
      if (activeId === id) startNewChat()
    } catch (err) {
      setError(err.message)
    }
  }

  async function send(text) {
    const trimmed = text.trim()
    if (!trimmed || sending) return

    setSending(true)
    setError('')
    setInput('')
    // Optimistic - show the visitor's own message immediately rather than
    // waiting on the AI round trip before anything appears.
    setMessages((current) => [...current, { role: 'user', text: trimmed }])

    try {
      const data = activeId
        ? await apiFetch(`/api/ai-suggestions/conversations/${activeId}/messages`, { method: 'POST', body: { text: trimmed } })
        : await apiFetch('/api/ai-suggestions/conversations', { method: 'POST', body: { text: trimmed } })

      setMessages(data.messages)
      if (!activeId) {
        setActiveId(data._id)
        setConversations((current) => [{ id: data._id, title: data.title, updatedAt: data.updatedAt }, ...current])
      } else {
        setConversations((current) =>
          current.map((conversation) => (conversation.id === activeId ? { ...conversation, updatedAt: data.updatedAt } : conversation)),
        )
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  if (isGuest) {
    return (
      <div className="ai-suggestions-page">
        <div className="section-heading">
          <div>
            <p className="mono-eyebrow">Chat with BookWorm</p>
            <h2>AI Suggestions</h2>
          </div>
        </div>
        <p className="empty-state">Log in to chat and save your suggestion history.</p>
      </div>
    )
  }

  return (
    <div className="ai-suggestions-layout">
      <aside className="ai-suggestions-sidebar">
        <button className="primary-button" onClick={startNewChat} type="button">
          <i className="bi bi-plus-lg" /> New chat
        </button>
        <div className="ai-suggestions-history">
          {loadingList ? (
            <p className="empty-state">Loading...</p>
          ) : conversations.length ? (
            conversations.map((conversation) => (
              <button
                className={`ai-suggestions-history-item ${conversation.id === activeId ? 'active' : ''}`}
                key={conversation.id}
                onClick={() => openConversation(conversation.id)}
                type="button"
              >
                <span>{conversation.title || 'New chat'}</span>
                <i aria-label="Delete conversation" className="bi bi-trash" onClick={(event) => deleteConversation(conversation.id, event)} />
              </button>
            ))
          ) : (
            <p className="empty-state">No conversations yet.</p>
          )}
        </div>
      </aside>

      <div className="ai-suggestions-main">
        <div className="ai-chat-messages">
          {loadingConversation ? (
            <p className="empty-state">Loading...</p>
          ) : messages.length === 0 ? (
            <>
              <p className="empty-state">Tell me what kind of story you're in the mood for, and I'll pull real picks from BookWorm's library.</p>
              <div className="ai-chat-starters">
                {STARTER_PROMPTS.map((prompt) => (
                  <button key={prompt} onClick={() => send(prompt)} type="button">
                    {prompt}
                  </button>
                ))}
              </div>
            </>
          ) : (
            messages.map((message, index) => (
              <div className={`ai-chat-bubble ai-chat-bubble-${message.role}`} key={index}>
                <p>{message.text}</p>
                {message.suggestions?.length > 0 && (
                  <div className="ai-chat-suggestions">
                    {message.suggestions.map((item) => (
                      <button
                        className="ai-chat-suggestion-card"
                        key={item.id}
                        onClick={() => navigateTo(item.type === 'ebook' ? 'read' : 'listen', { query: `id=${item.id}` })}
                        type="button"
                      >
                        <span className={`ai-chat-tag ai-chat-tag-${item.type}`}>{item.type === 'ebook' ? 'Ebook' : 'Audiobook'}</span>
                        <strong>{item.title}</strong>
                        <span>{item.author}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
          {sending && (
            <div className="ai-chat-bubble ai-chat-bubble-assistant">
              <p><span className="admin-spin-small" /> Thinking...</p>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {error && <p className="admin-validation-error"><i className="bi bi-x-circle" /> {error}</p>}

        <form
          className="ai-chat-input-row"
          onSubmit={(event) => {
            event.preventDefault()
            send(input)
          }}
        >
          <input
            onChange={(event) => setInput(event.target.value)}
            placeholder="What are you in the mood to read or listen to?"
            type="text"
            value={input}
          />
          <button className="primary-button" disabled={!input.trim() || sending} type="submit">
            <i className="bi bi-send" />
          </button>
        </form>
      </div>
    </div>
  )
}

export default AiSuggestionsPage
