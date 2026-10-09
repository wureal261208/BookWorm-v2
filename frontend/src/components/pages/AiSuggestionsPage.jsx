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
  const [inputHighlighted, setInputHighlighted] = useState(false)
  const [sending, setSending] = useState(false)
  const [thinkingIndex, setThinkingIndex] = useState(0)
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null) // { type: 'single' | 'all', conversation?: { id, title } } | null
  const [deleting, setDeleting] = useState(false)
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

  // Close confirmation modal on Escape key
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && deleteTarget && !deleting) {
        setDeleteTarget(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [deleteTarget, deleting])

  function openConversation(id) {
    setActiveId(id)
    setLoadingConversation(true)
    setError('')
    setInput('')
    apiFetch(`/api/ai-suggestions/conversations/${id}`)
      .then((data) => setMessages(data.messages || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoadingConversation(false))
  }

  function startNewChat() {
    setActiveId(null)
    setMessages([])
    setError('')
    setInput('')
  }

  function requestDeleteConversation(conversation, event) {
    event?.stopPropagation?.()
    setDeleteTarget({ type: 'single', conversation })
  }

  function requestClearAll() {
    setDeleteTarget({ type: 'all' })
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    setError('')

    try {
      if (deleteTarget.type === 'single') {
        const id = deleteTarget.conversation.id
        await apiFetch(`/api/ai-suggestions/conversations/${id}`, { method: 'DELETE' })
        setConversations((current) => current.filter((c) => c.id !== id))
        if (activeId === id) startNewChat()
      } else if (deleteTarget.type === 'all') {
        await apiFetch('/api/ai-suggestions/conversations', { method: 'DELETE' })
        setConversations([])
        startNewChat()
      }
      setDeleteTarget(null)
    } catch (err) {
      setError(err.message || 'Could not delete conversation')
    } finally {
      setDeleting(false)
    }
  }

  // Instant send when an option button is selected (no need to press Enter or Send)
  function handleSelectOption(option) {
    if (!option || sending) return
    send(option)
  }

  // Focus and highlight custom input for free-form query ("Other")
  function handleOtherClick() {
    setInput('')
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

  const latestAssistantMessage = lastAssistantIndex >= 0 ? messages[lastAssistantIndex] : null
  const activeConversation = conversations.find((c) => c.id === activeId) || null

  // Active options to present docked directly on the chat bar:
  // Shows latest assistant's clarifying options or recommendation follow-ups
  const activeDockOptions = (() => {
    if (!latestAssistantMessage) return []
    if (latestAssistantMessage.options?.length > 0) {
      return latestAssistantMessage.options
    }
    if (latestAssistantMessage.suggestions?.length > 0) {
      return DEFAULT_FOLLOW_UPS
    }
    return []
  })()

  // Dynamic placeholder guiding the user
  const inputPlaceholderText = (() => {
    if (activeDockOptions.length > 0) {
      if (input.trim()) {
        return 'Press Enter or click Send to submit, or edit text here...'
      }
      return 'Pick an option above or type your own here... (Press Enter to send)'
    }
    return 'What are you in the mood to read or listen to? (Enter to send)'
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
              <div
                className={`ai-suggestions-history-item ${conversation.id === activeId ? 'active' : ''}`}
                key={conversation.id}
              >
                <button
                  className="ai-suggestions-history-item-btn"
                  onClick={() => openConversation(conversation.id)}
                  type="button"
                >
                  <span>{conversation.title || 'New chat'}</span>
                </button>
                <button
                  aria-label={`Delete ${conversation.title || 'conversation'}`}
                  className="ai-suggestions-history-delete-btn"
                  onClick={(event) => requestDeleteConversation(conversation, event)}
                  title="Delete conversation"
                  type="button"
                >
                  <i aria-hidden="true" className="bi bi-trash" />
                </button>
              </div>
            ))
          ) : (
            <p className="empty-state">No conversations yet.</p>
          )}
        </div>
        {conversations.length > 0 && (
          <div className="ai-suggestions-sidebar-footer">
            <button
              className="ai-clear-history-btn"
              onClick={requestClearAll}
              type="button"
            >
              <i className="bi bi-trash" />
              <span>Clear all history</span>
            </button>
          </div>
        )}
      </aside>

      <div className="ai-suggestions-main">
        {activeId && (
          <div className="ai-chat-header-bar">
            <div className="ai-chat-header-info">
              <span className="mono-eyebrow">Active conversation</span>
              <h3 className="ai-chat-header-title">{activeConversation?.title || 'Chat conversation'}</h3>
            </div>
            <button
              className="ghost-button ai-chat-delete-btn"
              onClick={() => requestDeleteConversation({ id: activeId, title: activeConversation?.title })}
              type="button"
              title="Delete this conversation"
            >
              <i className="bi bi-trash" />
              <span>Delete chat</span>
            </button>
          </div>
        )}

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
              <p className="empty-state">Select a topic below to load it into the chat bar, or type your own request:</p>
              <div className="ai-chat-starters">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt.label}
                    className={`ai-starter-btn ${input.trim() === prompt.label ? 'active' : ''}`}
                    disabled={sending}
                    onClick={() => handleSelectOption(prompt.label)}
                    type="button"
                  >
                    <i className={`bi ${prompt.icon}`} />
                    <span>{prompt.label}</span>
                    {input.trim() === prompt.label && <i className="bi bi-check2" />}
                  </button>
                ))}
                <button
                  className="ai-starter-btn ai-starter-btn-other"
                  disabled={sending}
                  onClick={handleOtherClick}
                  type="button"
                >
                  <i className="bi bi-pencil" />
                  <span>Other topic...</span>
                </button>
              </div>
            </div>
          ) : (
            messages.map((message, index) => {
              const isAssistant = message.role === 'assistant'
              const isLatestAssistant = index === lastAssistantIndex
              const quickReplies = message.options?.length > 0
                ? message.options
                : (isLatestAssistant && message.suggestions?.length > 0 ? DEFAULT_FOLLOW_UPS : [])

              return (
                <div className={`ai-chat-bubble ai-chat-bubble-${message.role}`} key={index}>
                  <p>{message.text}</p>

                  {/* Suggestion cards (recommended titles) */}
                  {message.suggestions?.length > 0 && (
                    <div className="ai-chat-suggestions">
                      <div className="ai-suggestions-grid-header">
                        <i className="bi bi-bookmark-check" />
                        <span>Recommended titles - Click to read or listen:</span>
                      </div>
                      <div className="ai-suggestions-cards-list">
                        {message.suggestions.map((item) => {
                          const isEbook = item.type === 'ebook'
                          return (
                            <div
                              className="ai-chat-suggestion-card"
                              key={item.id}
                              onClick={() => navigateTo(isEbook ? 'read' : 'listen', { query: `id=${item.id}` })}
                            >
                              <div className="ai-suggestion-cover-wrap">
                                {item.cover_image ? (
                                  <img
                                    alt={item.title}
                                    className="ai-suggestion-cover"
                                    loading="lazy"
                                    src={item.cover_image}
                                  />
                                ) : (
                                  <div className="ai-suggestion-cover-fallback">
                                    <i className={`bi ${isEbook ? 'bi-book' : 'bi-headphones'}`} />
                                  </div>
                                )}
                              </div>

                              <div className="ai-suggestion-meta">
                                <div className="ai-suggestion-badge-row">
                                  <span className={`ai-chat-tag ai-chat-tag-${item.type}`}>
                                    <i className={`bi ${isEbook ? 'bi-book-half' : 'bi-headphones'}`} />
                                    {isEbook ? 'Ebook' : 'Audiobook'}
                                  </span>
                                </div>
                                <strong className="ai-suggestion-title" title={item.title}>
                                  {item.title}
                                </strong>
                                <span className="ai-suggestion-author">
                                  {item.author || 'Unknown author'}
                                </span>
                              </div>

                              <div className="ai-suggestion-actions" onClick={(e) => e.stopPropagation()}>
                                <button
                                  className="ai-book-action-btn ai-book-action-primary"
                                  onClick={() => navigateTo(isEbook ? 'read' : 'listen', { query: `id=${item.id}` })}
                                  title={isEbook ? 'Read now' : 'Listen now'}
                                  type="button"
                                >
                                  <i className={`bi ${isEbook ? 'bi-book-half' : 'bi-headphones'}`} />
                                  <span>{isEbook ? 'Read now' : 'Listen now'}</span>
                                </button>
                                <button
                                  className="ai-book-action-btn ai-book-action-secondary"
                                  onClick={() => navigateTo('detail', { query: `id=${item.id}` })}
                                  title="View details"
                                  type="button"
                                >
                                  <i className="bi bi-info-circle" />
                                  <span>Details</span>
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Active Guided Quick Replies inside latest assistant bubble */}
                  {isAssistant && isLatestAssistant && quickReplies.length > 0 && (
                    <div className="ai-chat-quick-replies-wrap">
                      <div className="ai-chat-quick-replies-header">
                        <i className="bi bi-chat-quote" />
                        <span>Quick suggestions (Tap to ask immediately):</span>
                      </div>
                      <div className="ai-chat-quick-replies-list">
                        {quickReplies.map((option) => {
                          const isSelected = input.trim() === option.trim()
                          return (
                            <button
                              className={`ai-chat-quick-reply-btn ${isSelected ? 'active' : ''}`}
                              disabled={sending}
                              key={option}
                              onClick={() => handleSelectOption(option)}
                              type="button"
                            >
                              <span>{option}</span>
                              {isSelected && <i className="bi bi-check2" />}
                            </button>
                          )
                        })}
                        <button
                          className="ai-chat-quick-reply-btn ai-chat-quick-reply-other"
                          disabled={sending}
                          onClick={handleOtherClick}
                          title="Type your own custom response in the chat bar below"
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

        {/* Docked Suggestion Buttons Directly Above the Chat Bar */}
        <div className="ai-chat-bottom-dock">
          {!sending && activeDockOptions.length > 0 && (
            <div className="ai-chat-quick-dock">
              <div className="ai-chat-quick-dock-header">
                <span className="ai-chat-quick-dock-label">
                  <i className="bi bi-lightbulb" /> Suggested choices:
                </span>
                <span className="ai-chat-quick-dock-hint">
                  Tap any option to ask immediately
                </span>
              </div>
              <div aria-label="Suggested reply options" className="ai-chat-quick-dock-chips" role="group">
                {activeDockOptions.map((option) => {
                  const isSelected = input.trim() === option.trim()
                  return (
                    <button
                      className={`ai-chat-dock-chip ${isSelected ? 'active' : ''}`}
                      disabled={sending}
                      key={option}
                      onClick={() => handleSelectOption(option)}
                      type="button"
                    >
                      <span>{option}</span>
                      {isSelected && <i className="bi bi-check2" />}
                    </button>
                  )
                })}
                <button
                  className="ai-chat-dock-chip ai-chat-dock-chip-other"
                  disabled={sending}
                  onClick={handleOtherClick}
                  title="Type your own custom request in the input below"
                  type="button"
                >
                  <i className="bi bi-pencil" />
                  <span>Other (type below)...</span>
                </button>
              </div>
            </div>
          )}

          {/* Chat Input Bar - Also serves as the "Other / Custom" input */}
          <form
            className={`ai-chat-input-row ${inputHighlighted ? 'input-highlighted' : ''}`}
            onSubmit={(event) => {
              event.preventDefault()
              send(input)
            }}
          >
            <input
              disabled={sending}
              onChange={(event) => setInput(event.target.value)}
              placeholder={inputPlaceholderText}
              ref={inputRef}
              type="text"
              value={input}
            />
            <button
              aria-label="Send message"
              className="primary-button"
              disabled={!input.trim() || sending}
              title="Send message (Enter)"
              type="submit"
            >
              <i className="bi bi-send" />
            </button>
          </form>
        </div>
      </div>

      {/* Confirmation Modal for deleting conversation or clearing history */}
      {deleteTarget && (
        <div
          aria-labelledby="delete-dialog-title"
          aria-modal="true"
          className="reader-modal-backdrop admin-book-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleting) setDeleteTarget(null)
          }}
          role="dialog"
        >
          <div
            className="admin-book-modal ai-delete-confirm-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '440px', width: '92%' }}
          >
            <header className="admin-book-modal-header">
              <div>
                <p className="mono-eyebrow">Confirm Deletion</p>
                <h2 id="delete-dialog-title">
                  {deleteTarget.type === 'all' ? 'Clear all chat history' : 'Delete conversation'}
                </h2>
              </div>
              <button
                aria-label="Close"
                className="admin-book-modal-close"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
                type="button"
              >
                <i className="bi bi-x-lg" />
              </button>
            </header>

            <div className="admin-book-modal-body" style={{ padding: '16px 20px' }}>
              <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.6', color: 'var(--app-text)' }}>
                {deleteTarget.type === 'all' ? (
                  <>
                    Are you sure you want to permanently delete <strong>all chat conversations</strong>? All past recommendations and messages will be removed.
                  </>
                ) : (
                  <>
                    Are you sure you want to delete <strong>"{deleteTarget.conversation?.title || 'this conversation'}"</strong>? All messages in this chat will be permanently removed.
                  </>
                )}
              </p>
              <p style={{ margin: '8px 0 0', fontSize: '13px', color: 'var(--app-muted)' }}>
                This action cannot be undone.
              </p>
            </div>

            <footer className="admin-book-modal-footer">
              <button
                className="ghost-button"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="danger-button"
                disabled={deleting}
                onClick={confirmDelete}
                type="button"
              >
                <i className="bi bi-trash" style={{ marginRight: '6px' }} />
                {deleting ? 'Deleting...' : (deleteTarget.type === 'all' ? 'Clear all history' : 'Delete conversation')}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  )
}

export default AiSuggestionsPage
