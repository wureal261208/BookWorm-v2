import { useEffect, useRef, useState } from 'react'
import { getInitials, getCover, getAuthor } from '../../utils/bookUtils'
import { publicApiFetch } from '../../utils/apiClient'
import logo from '../../assets/logo.jpg'
import { useNavigation } from '../../context/NavigationContext'
import { hasAccess, normalizeRole } from '../../data/bookData'

// Wattpad-style top nav: logo click already goes home (see handleLogoClick
// below), so there's no separate "Home" link - just Browse/Community/Write
// plus whatever staff-only links apply. "Browse" reuses the existing
// Discover page/route as-is (same subject/category filtering, same
// pagination) - it's a relabel for the nav, not a second page to maintain.
const navItems = [
  { id: 'discover', label: 'Browse', icon: 'bi-compass' },
  { id: 'community', label: 'Community', icon: 'bi-people' },
  { id: 'write', label: 'Write', icon: 'bi-pencil-square', private: true },
  { id: 'profile', label: 'Profile', icon: 'bi-person-circle', private: true },
  { id: 'admin', label: 'Management', icon: 'bi-shield-lock', admin: true },
]
const managementNavIds = ['profile', 'admin']

const themeOrder = ['light', 'dark']
const themeIcons = { light: 'bi-sun', dark: 'bi-moon' }
const themeNextLabel = { light: 'Switch to Dark theme', dark: 'Switch to Light theme' }

function AppShell({
  account,
  children,
  managedBooks = [],
  notifications = [],
  onAuth,
  onGuest,
  onHeaderSearch,
  onLogout,
  onMarkAllNotificationsRead,
  onNotificationClick,
  setWebsiteTheme,
  staff = [],
  websiteTheme = 'light',
}) {
  const { activePage, isPageLoading, navigateTo } = useNavigation()



  const [rememberedAdminAccess, setRememberedAdminAccess] = useState(false)
  const normalizedRole = normalizeRole(account?.role)
  const isGuest = normalizedRole === 'guest'
  const isAdmin = hasAccess(normalizedRole, 'employee')
  const isAdminPage = activePage === 'admin'
  const canShowAdminNav = isAdmin || isAdminPage || rememberedAdminAccess
  const isManagementNavContext = canShowAdminNav && managementNavIds.includes(activePage)
  const displayName = account?.name || 'None Account'
  const unreadNotificationItems = isGuest ? [] : notifications.filter((item) => !item.read)
  const unreadNotifications = unreadNotificationItems.length

  const [showNotifications, setShowNotifications] = useState(false)
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const notificationRef = useRef(null)
  const visibleNavItems = navItems.filter((item) => {
    if (isManagementNavContext && !managementNavIds.includes(item.id)) return false
    if (item.admin && !canShowAdminNav) return false
    if (item.private && isGuest) return false
    return true
  })

  // Safety net alongside the explicit close-on-click handlers below (nav
  // item click, search submit, backdrop click) - covers navigation that
  // doesn't go through any of those, like the browser's own back/forward
  // buttons, so the mobile menu never gets left open over a new page.
  useEffect(() => {
    setIsMobileNavOpen(false)
  }, [activePage])

  useEffect(() => {
    let isCurrent = true

    if (isGuest) {
      if (rememberedAdminAccess) {
        queueMicrotask(() => {
          if (isCurrent) setRememberedAdminAccess(false)
        })
      }
      return () => {
        isCurrent = false
      }
    }

    if ((isAdmin || isAdminPage) && !rememberedAdminAccess) {
      queueMicrotask(() => {
        if (isCurrent) setRememberedAdminAccess(true)
      })
    }

    return () => {
      isCurrent = false
    }
  }, [isAdmin, isAdminPage, isGuest, rememberedAdminAccess])

  useEffect(() => {
    if (!showNotifications) return

    function handleOutsideClick(event) {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setShowNotifications(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [showNotifications])

  function handleLogoClick() {
    navigateTo('home')
  }

  return (
    <div className={`book-app app-theme-${websiteTheme}${isAdminPage ? ' book-app-admin-locked' : ''}`}>
      {!isAdminPage && (
      <header className="site-header">
        <button className="brand-button" onClick={handleLogoClick} type="button">
          <img src={logo} alt="BookWorm logo" />
          <span>BookWorm</span>
        </button>

        <button
          aria-expanded={isMobileNavOpen}
          aria-label={isMobileNavOpen ? 'Close menu' : 'Open menu'}
          className="mobile-nav-toggle"
          onClick={() => setIsMobileNavOpen((value) => !value)}
          type="button"
        >
          <i className={`bi ${isMobileNavOpen ? 'bi-x-lg' : 'bi-list'}`} />
        </button>

        <div className={`main-nav-group${isMobileNavOpen ? ' open' : ''}`}>
          <nav className="main-nav" aria-label="Main navigation">
            {visibleNavItems.map((item) => {
              if (item.admin && !canShowAdminNav) return null
              if (item.private && isGuest) return null

              return (
                <button
                  className={activePage === item.id ? 'active' : ''}
                  key={item.id}
                  onClick={() => {
                    setIsMobileNavOpen(false)
                    navigateTo(item.id)
                  }}
                  type="button"
                >
                  <i className={`bi ${item.icon}`} />
                  {item.label}
                </button>
              )
            })}
          </nav>

          <HeaderSearch onSearch={(term) => { setIsMobileNavOpen(false); onHeaderSearch?.(term) }} />
        </div>

        {isMobileNavOpen && <button aria-label="Close menu" className="mobile-nav-backdrop" onClick={() => setIsMobileNavOpen(false)} type="button" />}

        <div className="header-account">
          {!isGuest && (
            <div className="mongo-notification" ref={notificationRef} style={{ position: 'relative' }}>
              <button
                aria-label={`Notifications${unreadNotifications ? ` (${unreadNotifications} unread)` : ''}`}
                className="notification-bell"
                onClick={() => setShowNotifications((value) => !value)}
                title="Notifications"
                type="button"
              >
                <i className="bi bi-bell" />
                {unreadNotifications > 0 && <span className="notification-badge">{unreadNotifications}</span>}
              </button>
              {showNotifications && (
                <div className="mongo-notification-dropdown">
                  <div className="notification-dropdown-header">
                    <strong>Notifications</strong>
                    {unreadNotificationItems.length > 0 && (
                      <button
                        className="notification-mark-all"
                        onClick={() => onMarkAllNotificationsRead?.()}
                        type="button"
                      >
                        Mark all as read
                      </button>
                    )}
                  </div>
                  {unreadNotificationItems.length ? (
                    <ul className="notification-list">
                      {unreadNotificationItems.map((item) => (
                        <li key={item.id}>
                          <button
                            className="unread"
                            onClick={() => {
                              setShowNotifications(false)
                              onNotificationClick?.(item)
                            }}
                            type="button"
                          >
                            <i className="bi bi-envelope" />
                            <span className="notification-item-body">
                              <strong>{item.title}</strong>
                              <em>{item.message}</em>
                              <small>{formatNotificationTime(item.createdAt)}</small>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="notification-empty">
                      <i className="bi bi-bell-slash" />
                      <p>No new notifications right now.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {typeof setWebsiteTheme === 'function' && (
            <div className="quick-theme-toggle">
              <button
                aria-label={themeNextLabel[websiteTheme] || 'Switch theme'}
                onClick={() => {
                  const nextIndex = (themeOrder.indexOf(websiteTheme) + 1) % themeOrder.length
                  setWebsiteTheme(themeOrder[nextIndex])
                }}
                title={themeNextLabel[websiteTheme] || 'Switch theme'}
                type="button"
              >
                <i className={`bi ${themeIcons[websiteTheme] || 'bi-sun'}`} />
              </button>
            </div>
          )}
          <button className="header-random-button" onClick={() => navigateTo('random')} type="button">
            <i className="bi bi-shuffle" />
            <span>Random book</span>
          </button>
          <button className="avatar-chip" onClick={() => (isGuest ? onAuth() : navigateTo('profile'))} type="button">
            <span>
              {account?.avatar ? <img src={account.avatar} alt="" /> : getInitials(displayName)}
            </span>
            <strong>{displayName}</strong>
          </button>
          {isGuest ? (
            <>
              <button className="ghost-button" onClick={onGuest} type="button">
                None account
              </button>
              <button className="primary-button" onClick={onAuth} type="button">
                Login
              </button>
            </>
          ) : (
            <button className="ghost-button" onClick={() => setShowLogoutConfirm(true)} type="button">
              Logout
            </button>
          )}
        </div>
      </header>
      )}

      {showLogoutConfirm && (
        <div
          aria-labelledby="shell-confirm-logout-title"
          aria-modal="true"
          className="reader-modal-backdrop admin-ban-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowLogoutConfirm(false)
          }}
          role="dialog"
        >
          <div className="admin-ban-modal">
            <button aria-label="Close" className="admin-book-modal-close" onClick={() => setShowLogoutConfirm(false)} type="button">
              <i className="bi bi-x-lg" />
            </button>
            <p className="mono-eyebrow">Log out</p>
            <h2 id="shell-confirm-logout-title">Leave BookWorm?</h2>
            <p className="form-note">You'll need to log back in to pick up where you left off.</p>

            <div className="admin-form-actions">
              <button className="ghost-button" onClick={() => setShowLogoutConfirm(false)} type="button">Stay signed in</button>
              <button
                className="danger-button"
                onClick={() => {
                  setShowLogoutConfirm(false)
                  onLogout()
                }}
                type="button"
              >
                <i className="bi bi-box-arrow-right" />
                Log out
              </button>
            </div>
          </div>
        </div>
      )}

      <main className={isAdminPage ? 'admin-page-shell' : 'page-shell'}>{children}</main>
      {!isAdminPage && <ChatWidgetPlaceholder />}
      {!isAdminPage && <footer className="site-footer">
        <section className="footer-brand">
          <div className="footer-logo">
            <img src={logo} alt="BookWorm logo" />
          </div>
          <div>
            <strong>BookWorm</strong>
            <p>A focused digital library for keeping books, comments, and checkpoints in one quiet place.</p>
          </div>
        </section>
        <section className="footer-columns">
          <nav aria-label="Footer navigation">
            <span>Explore</span>
            {!['admin', 'profile'].includes(activePage) && (
              <>
                <button className="footer-link" onClick={() => navigateTo('home')} type="button">Home</button>
                <button className="footer-link" onClick={() => navigateTo('discover')} type="button">Discover</button>
              </>
            )}
            {!isGuest && <button onClick={() => navigateTo('profile')} type="button">Profile</button>}
            {canShowAdminNav && <button onClick={() => navigateTo('admin')} type="button">Management</button>}
          </nav>
          <div>
            <span>Reader tools</span>
            <p>Checkpoint sync</p>
            <p>Personal notes - Coming soon</p>
            <p>Community comments</p>
          </div>
        </section>
      </footer>}
      {isPageLoading && (
        <div className="route-loader" role="status">
          <img src={logo} alt="BookWorm logo" />
          <span>Opening page...</span>
        </div>
      )}
    </div>
  )
}

// Wattpad-style persistent header search: type to see live suggestions
// (from admin-published books only - GET /api/books already filters to
// status: 'published'), press Enter or click a result to jump to Browse
// with that search applied. Loading state while a request is in flight,
// and an explicit "no results" message rather than just an empty box.
export function HeaderSearch({ onSearch }) {
  const [term, setTerm] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const boxRef = useRef(null)

  useEffect(() => {
    const trimmed = term.trim()
    if (trimmed.length < 2) {
      setResults([])
      setLoading(false)
      return undefined
    }

    let ignore = false
    setLoading(true)
    const timeout = setTimeout(() => {
      publicApiFetch(`/api/books?limit=6&q=${encodeURIComponent(trimmed)}`)
        .then((data) => {
          if (!ignore) setResults(Array.isArray(data.books) ? data.books : [])
        })
        .catch(() => {
          if (!ignore) setResults([])
        })
        .finally(() => {
          if (!ignore) setLoading(false)
        })
    }, 300)

    return () => {
      ignore = true
      clearTimeout(timeout)
    }
  }, [term])

  useEffect(() => {
    if (!isOpen) return undefined
    function handleOutsideClick(event) {
      if (boxRef.current && !boxRef.current.contains(event.target)) setIsOpen(false)
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [isOpen])

  function submit(nextTerm = term) {
    const trimmed = nextTerm.trim()
    if (!trimmed) return
    setIsOpen(false)
    onSearch?.(trimmed)
  }

  return (
    <div className="header-search" ref={boxRef}>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <i className="bi bi-search" />
        <input
          aria-label="Search books"
          onChange={(event) => {
            setTerm(event.target.value)
            setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Search books..."
          type="text"
          value={term}
        />
      </form>

      {isOpen && term.trim().length >= 2 && (
        <div className="header-search-dropdown">
          <div className="header-search-results">
            {loading ? (
              <p><span className="admin-spin-small" /> Searching...</p>
            ) : results.length ? (
              results.map((book) => (
                <button key={book.id || book._id} onClick={() => submit(book.title)} type="button">
                  <img alt="" src={getCover(book)} />
                  <span className="header-search-result-text">
                    <strong>{book.title}</strong>
                    <small>{getAuthor(book)}</small>
                  </span>
                </button>
              ))
            ) : (
              <p className="header-search-empty">No results found.</p>
            )}
          </div>
          <button className="header-search-submit" onClick={() => submit()} type="button">
            Enter to search
          </button>
        </div>
      )}
    </div>
  )
}

function formatNotificationTime(isoString) {
  if (!isoString) return ''
  const diffMs = Date.now() - new Date(isoString).getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(isoString).toLocaleDateString()
}

// Layout/placeholder only, per Wun's request - a real chatbox will be
// wired into this slot later. Clicking it just shows a small "coming
// soon" bubble instead of pretending to open a working chat.
function ChatWidgetPlaceholder() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="chat-widget">
      {isOpen && (
        <div className="chat-widget-panel" role="dialog" aria-label="Chat">
          <div className="chat-widget-panel-header">
            <strong>BookWorm Support</strong>
            <button aria-label="Close chat" onClick={() => setIsOpen(false)} type="button">
              <i className="bi bi-x-lg" />
            </button>
          </div>
          <div className="chat-widget-panel-body">
            <i className="bi bi-chat-dots" />
            <p>Live chat is coming soon.</p>
          </div>
        </div>
      )}
      <button
        aria-label="Chat with BookWorm"
        className="chat-widget-bubble"
        onClick={() => setIsOpen((value) => !value)}
        type="button"
      >
        <i className={`bi ${isOpen ? 'bi-x-lg' : 'bi-chat-dots-fill'}`} />
      </button>
    </div>
  )
}

export default AppShell
