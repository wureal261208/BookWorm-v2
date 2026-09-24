import AiChatPanel from '../content/AiChatPanel'

// The actual chat logic/UI lives in AiChatPanel.jsx (shared with the
// floating chat widget in AppShell.jsx) - this page is just that panel
// given a full page to live on, with its own heading.
function AiSuggestionsPage() {
  return (
    <div className="ai-suggestions-page">
      <div className="section-heading">
        <div>
          <p className="mono-eyebrow">Chat with BookWorm</p>
          <h2>AI Suggestions</h2>
        </div>
        <span>Tell me what you're after - I'll pick real titles from the library, not generic guesses.</span>
      </div>

      <AiChatPanel />
    </div>
  )
}

export default AiSuggestionsPage
