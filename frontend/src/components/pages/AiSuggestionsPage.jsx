import { useEffect, useRef, useState } from 'react'
import { auth } from '../../features/auth-firebase/firebaseConfig'
import { apiFetch } from '../../utils/apiClient'
import { useNavigation } from '../../context/NavigationContext'

const STARTER_PROMPTS = [
  { label: 'Something adventurous', icon: 'bi-compass' },
  { label: 'A cozy mystery', icon: 'bi-cup-hot' },
  { label: 'Audiobook for a commute', icon: 'bi-headphones' },
  { label: 'Classic literature masterpiece', icon: 'bi-book' },
  { label: 'Fast-paced psychological thriller', icon: 'bi-lightning' },
  { label: 'Short reads under 200 pages', icon: 'bi-clock-history' },
]

const THINKING_PHRASES = [
  'Worm is analyzing your reading taste...',
  'Worm is thinking...',
  'Worm is browsing library shelves...',
  'Worm is matching genres and authors...',
  'Worm is curating personalized book picks...',
  'Worm is discovering great stories for you...',
]

const DEFAULT_FOLLOW_UPS = [
  'Show audiobooks only',
  'More like the top pick',
  'Something faster paced',
  'Try a different genre',
]

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
  const [inputPlaceholder, setInputPlaceholder] = useState('What are you in the mood to read or listen to?')
  const [inputHighlighted, setInputHighlighted] = useState(false)
  const [sending, setSending] = useState(false)
  const [thinkingIndex, setThinkingIndex] = useState(0)
  const [error, setError] = useState('')
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  // Rotate lively thinking phrases every 1.4s while sending
  useEffect(() => {
    if (!sending) {
      setThinkingIndex(0)
      return undefined
    }
    const timer = setInterval(() => {
      setThinkingIndex((prev) => (prev + 1) % THINKING_PHRASES.length)
    }, 1400)
    return () => clearInterval(timer)
  }, [sending])

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
    messagesEndRef.current?.scrollIntoView?.({ block: 'end' })
  }, [messages.length, sending])

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
    setInputPlaceholder('What are you in the mood to read or listen to?')
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

  function handleOtherClick() {
    setInputPlaceholder('Type your own custom topic or question...')
    setInputHighlighted(true)
    setTimeout(() => setInputHighlighted(false), 2000)
    if (inputRef.current) {
      inputRef.current.focus()
      inputRef.current.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
    }
  }

  async function send(text) {
    const trimmed = text.trim()
    if (!trimmed || sending) return

    setSending(true)
    setError('')
    setInput('')
    setInputPlaceholder('What are you in the mood to read or listen to?')
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

  // Find index of the latest assistant message in the conversation
  const lastAssistantIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return i
    }
    return -1
  })()

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
            <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div className="skeleton-box" key={i} style={{ height: '36px', borderRadius: '6px' }} />
              ))}
            </div>
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
            <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '16px 0' }}>
              <div className="skeleton-box" style={{ width: '55%', height: '44px', borderRadius: '12px', marginLeft: 'auto' }} />
              <div className="skeleton-box" style={{ width: '75%', height: '70px', borderRadius: '12px' }} />
            </div>
          ) : messages.length === 0 ? (
            <div className="ai-chat-empty-intro">
              <div className="ai-chat-empty-icon">
                <i className="bi bi-stars" />
              </div>
              <h3>Explore BookWorm Library with AI</h3>
              <p className="empty-state">Tell me what kind of story you're in the mood for, or tap a quick suggestion below to start:</p>
              <div className="ai-chat-starters">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt.label}
                    className="ai-starter-btn"
                    disabled={sending}
                    onClick={() => send(prompt.label)}
                    type="button"
                  >
                    <i className={`bi ${prompt.icon}`} /> {prompt.label}
                  </button>
                ))}
                <button
                  className="ai-starter-btn ai-starter-btn-other"
                  disabled={sending}
                  onClick={handleOtherClick}
                  type="button"
                >
                  <i className="bi bi-pencil" /> Other topic...
                </button>
              </div>
            </div>
          ) : (
            messages.map((message, index) => {
              const isAssistant = message.role === 'assistant'
              const isLatestAssistant = index === lastAssistantIndex
              // Determine active quick replies: explicit options or follow-ups for recommendations
              const quickReplies = message.options?.length > 0
                ? message.options
                : (isLatestAssistant && message.suggestions?.length > 0 ? DEFAULT_FOLLOW_UPS : [])

              return (
                <div className={`ai-chat-bubble ai-chat-bubble-${message.role}`} key={index}>
                  <p>{message.text}</p>

                  {/* Suggestion cards (recommended titles) */}
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

                  {/* Active Guided Conversation / Quick Replies (for latest assistant turn) */}
                  {isAssistant && isLatestAssistant && quickReplies.length > 0 && (
                    <div className="ai-chat-quick-replies-wrap">
                      <div className="ai-chat-quick-replies-header">
                        <i className="bi bi-chat-quote" />
                        <span>Quick replies:</span>
                      </div>
                      <div className="ai-chat-quick-replies-list">
                        {quickReplies.map((option) => (
                          <button
                            className="ai-chat-quick-reply-btn"
                            disabled={sending}
                            key={option}
                            onClick={() => send(option)}
                            type="button"
                          >
                            <span>{option}</span>
                          </button>
                        ))}
                        <button
                          className="ai-chat-quick-reply-btn ai-chat-quick-reply-other"
                          disabled={sending}
                          onClick={handleOtherClick}
                          title="Type your own custom response"
                          type="button"
                        >
                          <i className="bi bi-pencil" />
                          <span>Other...</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Settled view for previous assistant turns that had options */}
                  {isAssistant && !isLatestAssistant && message.options?.length > 0 && (
                    <div className="ai-chat-options-settled">
                      {message.options.map((opt) => (
                        <span className="ai-chat-option-settled-pill" key={opt}>
                          {opt}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )}

          {/* Dynamic Thinking State: Worm is analyzing/thinking... */}
          {sending && (
            <div className="ai-chat-bubble ai-chat-bubble-assistant ai-thinking-bubble">
              <div className="ai-thinking-row">
                <span className="worm-thinking-icon">
                  <i className="bi bi-book-half" />
                </span>
                <span className="worm-thinking-text" key={thinkingIndex}>
                  {THINKING_PHRASES[thinkingIndex]}
                </span>
                <span aria-hidden="true" className="worm-typing-dots">
                  <span className="worm-dot" />
                  <span className="worm-dot" />
                  <span className="worm-dot" />
                </span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {error && <p className="admin-validation-error"><i className="bi bi-x-circle" /> {error}</p>}

        <form
          className={`ai-chat-input-row ${inputHighlighted ? 'input-highlighted' : ''}`}
          onSubmit={(event) => {
            event.preventDefault()
            send(input)
          }}
        >
          <input
            onChange={(event) => setInput(event.target.value)}
            placeholder={inputPlaceholder}
            ref={inputRef}
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
