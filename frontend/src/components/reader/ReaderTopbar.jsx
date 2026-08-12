import logo from '../../assets/logo.jpg'

function ReaderTopbar({ activeBook, favorites, onBack, onDiscover, onFavorite, onHome }) {
  return (
    <header className="reader-topbar reader-navbar">
      <button className="brand-button reader-brand-button" onClick={onHome} type="button">
        <img src={logo} alt="BookWorm logo" />
        <span>BookWorm</span>
      </button>
      <nav className="main-nav reader-nav" aria-label="Reader navigation">
        <button className="active" onClick={onBack} type="button">
          <i className="bi bi-arrow-left" />
          Back to detail
        </button>
        <button onClick={onHome} type="button">
          <i className="bi bi-house" />
          Home
        </button>
        <button onClick={onDiscover} type="button">
          <i className="bi bi-compass" />
          Discover
        </button>
      </nav>
      <div className="reader-title-block">
        <p className="mono-eyebrow">Now reading</p>
        <h1>{activeBook.title}</h1>
      </div>
      <button className="ghost-button" onClick={() => onFavorite(activeBook.id)} type="button">
        <i className={`bi ${favorites.includes(activeBook.id) ? 'bi-bookmark-fill' : 'bi-bookmark'}`} />
        Bookmark
      </button>
    </header>
  )
}

export default ReaderTopbar
