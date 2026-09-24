import { useState } from 'react'
import { publicApiFetch } from '../../utils/apiClient'
import { useNavigation } from '../../context/NavigationContext'

const STARTER_PROMPTS = ['Something adventurous', 'A cozy mystery', 'A great audiobook for a commute', 'Classic literature']

const WELCOME_MESSAGE = {
  role: 'assistant',
  content: "Hi! Tell me what kind of story you're in the mood for, and I'll pull some real picks from BookWorm's library.",
  suggestions: [],
}

// Shared by AiSuggestionsPage.jsx (full page) and the floating chat widget
// in AppShell.jsx - one implementation, two places it's mounted, so the
// actual chat logic (and any future fix to it) only lives once.
//
// Every suggestion card here is a real Content document the backend looked
// up by _id (see backend/controllers/contentChatController.js) - the model
// is only ever shown a real candidate list and told to pick from it, never
// asked to invent a title, so there's nothing to fake-personalize here.
function AiChatPanel() {
  const { navigateTo } = useNavigation()
  const [messages, setMessages] = useState([WELCOME_MESSAGE])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

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
      setMessages([...nextMessages, { role: 'assistant', content: data.reply, suggestions: data.suggestions || [] }])
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="ai-chat-panel">
      <div className="ai-chat-messages">
        {messages.map((message, index) => (
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
          </div>
        ))}
        {sending && (
          <div className="ai-chat-bubble ai-chat-bubble-assistant">
            <p><span className="admin-spin-small" /> Thinking...</p>
          </div>
        )}
      </div>

      {error && <p className="admin-validation-error"><i className="bi bi-x-circle" /> {error}</p>}

      {messages.length <= 1 && (
        <div className="ai-chat-starters">
          {STARTER_PROMPTS.map((prompt) => (
            <button key={prompt} onClick={() => sendMessage(prompt)} type="button">
              {prompt}
            </button>
          ))}
        </div>
      )}

      <form
        className="ai-chat-input-row"
        onSubmit={(event) => {
          event.preventDefault()
          sendMessage(input)
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
  )
}

export default AiChatPanel
