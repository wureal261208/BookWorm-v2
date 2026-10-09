import { useEffect, useRef, useState } from 'react'
import { publicApiFetch } from '../../utils/apiClient'
import { useNavigation } from '../../context/NavigationContext'

const STARTER_PROMPTS = [
  { label: 'Something adventurous', icon: 'bi-compass' },
  { label: 'A cozy mystery', icon: 'bi-cup-hot' },
  { label: 'Audiobook for a commute', icon: 'bi-headphones' },
  { label: 'Classic literature masterpiece', icon: 'bi-book' },
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

const WELCOME_MESSAGE = {
  role: 'assistant',
  content: "Hi! Tell me what kind of story you're in the mood for, and I'll pull some real picks from BookWorm's library.",
  suggestions: [],
  options: ['Something adventurous', 'A cozy mystery', 'Audiobook for a commute'],
}

// Shared by AiSuggestionsPage.jsx (full page) and the floating chat widget
// in AppShell.jsx - one implementation, two places it's mounted, so the
// actual chat logic (and any future fix to it) only lives once.
function AiChatPanel() {
  const { navigateTo } = useNavigation()
  const [messages, setMessages] = useState([WELCOME_MESSAGE])
  const [input, setInput] = useState('')
  const [inputHighlighted, setInputHighlighted] = useState(false)
  const [sending, setSending] = useState(false)
  const [thinkingIndex, setThinkingIndex] = useState(0)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  // Rotate thinking phrases every 1.4s while sending
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

  function handleSelectOption(option) {
    setInput(option)
    if (inputRef.current) {
      inputRef.current.focus()
      const len = option.length
      inputRef.current.setSelectionRange?.(len, len)
    }
  }

  function handleOtherClick() {
    setInput('')
    setInputHighlighted(true)
    setTimeout(() => setInputHighlighted(false), 2000)
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }

  async function sendMessage(text) {
    const trimmed = text.trim()
    if (!trimmed || sending) return

    const nextMessages = [...messages, { role: 'user', content: trimmed }]
    setMessages(nextMessages)
    setInput('')
    setSending(true)
    setError('')

    try {
      const data = await publicApiFetch('/api/content/ai-chat', {
        method: 'POST',
        body: { messages: nextMessages.map(({ role, content }) => ({ role, content })) },
      })
      setMessages([
        ...nextMessages,
        {
          role: 'assistant',
          content: data.reply,
          suggestions: data.suggestions || [],
          options: data.options || [],
        },
      ])
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  const lastAssistantIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return i
    }
    return -1
  })()

  const latestAssistantMessage = lastAssistantIndex >= 0 ? messages[lastAssistantIndex] : null

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

  const inputPlaceholderText = (() => {
    if (activeDockOptions.length > 0) {
      if (input.trim()) {
        return 'Press Enter or click Send to submit, or edit text here...'
      }
      return 'Pick an option above or type your own here... (Press Enter to send)'
    }
    return 'What are you in the mood to read or listen to? (Enter to send)'
  })()

  return (
    <div className="ai-chat-panel">
      <div className="ai-chat-messages">
        {messages.map((message, index) => {
          const isAssistant = message.role === 'assistant'
          const isLatestAssistant = index === lastAssistantIndex
          const quickReplies = message.options?.length > 0
            ? message.options
            : (isLatestAssistant && message.suggestions?.length > 0 ? DEFAULT_FOLLOW_UPS : [])

          return (
            <div className={`ai-chat-bubble ai-chat-bubble-${message.role}`} key={index}>
              <p>{message.content}</p>

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

              {/* Quick Replies for the latest assistant message */}
              {isAssistant && isLatestAssistant && quickReplies.length > 0 && (
                <div className="ai-chat-quick-replies-wrap">
                  <div className="ai-chat-quick-replies-header">
                    <i className="bi bi-chat-quote" />
                    <span>Quick suggestions (Click to load into chat bar):</span>
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
                      title="Type your own custom response"
                      type="button"
                    >
                      <i className="bi bi-pencil" />
                      <span>Other...</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Settled view for previous assistant turns with options */}
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
        })}

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
                Click to select, then press Enter or Send
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

        <form
          className={`ai-chat-input-row ${inputHighlighted ? 'input-highlighted' : ''}`}
          onSubmit={(event) => {
            event.preventDefault()
            sendMessage(input)
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
  )
}

export default AiChatPanel
