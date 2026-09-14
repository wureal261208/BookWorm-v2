// Shared shell for pages that are just a nav stop for now (Community,
// Write) - a real page, not a modal or a dead link, so the nav item feels
// intentional rather than broken, but with no functionality to fake yet.
// Each of those pages can grow its own real content later without needing
// to touch this file - they'd just stop rendering ComingSoonPage.
function ComingSoonPage({ eyebrow, title, description, icon = 'bi-hourglass-split' }) {
  return (
    <div className="coming-soon-page">
      <section className="page-title">
        <p className="mono-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </section>
      <div className="coming-soon-panel">
        <i className={`bi ${icon}`} />
        <p>Coming soon</p>
        {description && <small>{description}</small>}
      </div>
    </div>
  )
}

export default ComingSoonPage
