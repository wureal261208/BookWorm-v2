import { useNavigation } from '../../context/NavigationContext'

function CommunityPage() {
  const { navigateTo } = useNavigation()

  const upcomingFeatures = [
    {
      icon: 'bi-people-fill',
      title: 'Reader Book Clubs',
      badge: 'Interactive',
      description:
        'Join curated book clubs, participate in monthly reading selections, and share perspectives with readers who love the same genres.',
    },
    {
      icon: 'bi-chat-dots-fill',
      title: 'Community Discussions',
      badge: 'Chapter Talks',
      description:
        'Engage in deep chapter-by-chapter discussions, character debates, and thoughtful literary analyses in a friendly, moderated space.',
    },
    {
      icon: 'bi-trophy-fill',
      title: 'Reading Challenges',
      badge: 'Milestones',
      description:
        'Set personal reading targets, track your annual book counts, and celebrate reading streaks with milestone badges and rewards.',
    },
    {
      icon: 'bi-broadcast',
      title: 'Voice Lounges & Live Reads',
      badge: 'Audio First',
      description:
        'Tune into live author readings, audio story showcases, and spoken-word gatherings hosted by passionate community storytellers.',
    },
  ]

  return (
    <div className="community-page community-coming-soon-container">
      {/* Hero Header */}
      <section className="community-hero-section">
        <div className="community-hero-badge">
          <i className="bi bi-stars" />
          <span>In Active Development</span>
        </div>
        <h1 className="community-hero-title">Community Hub — Coming Soon</h1>
        <p className="community-hero-subtitle">
          We are crafting an inspiring social space for book lovers, authors, and storytellers to connect, exchange ideas, and read together.
        </p>
      </section>

      {/* Feature Preview Grid */}
      <section className="community-features-preview" aria-label="Upcoming community features">
        <div className="section-heading-centered">
          <p className="mono-eyebrow">Sneak Peek</p>
          <h2>What's on the horizon</h2>
        </div>

        <div className="community-feature-cards-grid">
          {upcomingFeatures.map((item) => (
            <div className="community-feature-card" key={item.title}>
              <div className="community-card-icon-wrapper">
                <i className={`bi ${item.icon}`} />
              </div>
              <div className="community-card-content">
                <div className="community-card-header">
                  <h3>{item.title}</h3>
                  <span className="community-card-badge">{item.badge}</span>
                </div>
                <p>{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Interactive Callout Banner */}
      <section className="community-cta-banner">
        <div className="community-cta-content">
          <div className="community-cta-icon">
            <i className="bi bi-pencil-square" />
          </div>
          <div>
            <h3>Share your voice with the community today</h3>
            <p>
              While full social clubs are underway, you can already publish stories, record voice notes, and submit full-length books to our catalog!
            </p>
          </div>
        </div>
        <div className="community-cta-actions">
          <button
            className="primary-button community-action-btn"
            onClick={() => navigateTo('write', { query: 'tab=story' })}
            type="button"
          >
            <i className="bi bi-mic" /> Write a Story
          </button>
          <button
            className="ghost-button community-action-btn"
            onClick={() => navigateTo('write', { query: 'tab=book' })}
            type="button"
          >
            <i className="bi bi-book" /> Write a Book
          </button>
          <button
            className="ghost-button community-action-btn"
            onClick={() => navigateTo('books')}
            type="button"
          >
            <i className="bi bi-compass" /> Explore Library
          </button>
        </div>
      </section>
    </div>
  )
}

export default CommunityPage
