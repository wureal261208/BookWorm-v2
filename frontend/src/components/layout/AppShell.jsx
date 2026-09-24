import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getInitials } from '../../utils/bookUtils'
import AiChatPanel from '../content/AiChatPanel'
import { publicApiFetch } from '../../utils/apiClient'
import logo from '../../assets/logo.jpg'
import { useNavigation } from '../../context/NavigationContext'
import { hasAccess, normalizeRole } from '../../data/bookData'

// Ebooks/Audiobooks both point at the same /books page (see BooksPage.jsx -
// one page for every category/type, not a separate route per type) with a
// different `type` query param, via `target` + `query`. `id` stays unique
// per item for React keys and for the active-tab check below, which is why
// it's not just "books" for both. "Write" used to be a top-level item here
// - it's now a dropdown next to the search box instead (see writeMenuRef
// below). "Profile" also used to be its own pill here - removed as
// redundant now that the avatar chip next to Login/Logout already opens it.
const navItems = [
  { id: 'ebooks', label: 'Ebooks', icon: 'bi-book', target: 'books', query: 'type=ebook' },
  { id: 'audiobooks', label: 'Audiobooks', icon: 'bi-headphones', target: 'books', query: 'type=audiobook' },
  { id: 'ai-suggestions', label: 'AI Suggestions', icon: 'bi-stars' },
  { id: 'community', label: 'Community', icon: 'bi-people' },
  { id: 'admin', label: 'Management', icon: 'bi-shield-lock', admin: true },
]
// Only 'admin' now - Profile no longer has its own pill, so there's nothing
// left to swap the main nav out for while just viewing your own profile.
const managementNavIds = ['admin']

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
  // Only used to tell the Ebooks tab apart from the Audiobooks tab (both
  // point at activePage === 'books') - not used for navigation itself,
  // navigateTo's own `query` option handles that.
  const [searchParams] = useSearchParams()
  const activeBooksType = searchParams.get('type')

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
  const [showWriteMenu, setShowWriteMenu] = useState(false)
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const notificationRef = useRef(null)
  const writeMenuRef = useRef(null)
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

  useEffect(() => {
    if (!showWriteMenu) return

    function handleOutsideClick(event) {
      if (writeMenuRef.current && !writeMenuRef.current.contains(event.target)) {
        setShowWriteMenu(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [showWriteMenu])

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

              const targetPage = item.target || item.id
              const expectedType = item.query?.startsWith('type=') ? item.query.slice(5) : null
              const isActive =
                activePage === targetPage && (expectedType === null || activeBooksType === expectedType)

              return (
                <button
                  className={isActive ? 'active' : ''}
                  key={item.id}
                  onClick={() => {
                    setIsMobileNavOpen(false)
                    navigateTo(targetPage, item.query ? { query: item.query } : undefined)
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

          {!isGuest && (
            <div className="write-menu" ref={writeMenuRef} style={{ position: 'relative' }}>
              <button
                aria-expanded={showWriteMenu}
                aria-haspopup="true"
                className="ghost-button write-menu-toggle"
                onClick={() => setShowWriteMenu((value) => !value)}
                type="button"
              >
                <i className="bi bi-pencil-square" />
                <span>Write</span>
                <i className="bi bi-chevron-down" />
              </button>
              {showWriteMenu && (
                <div className="write-menu-dropdown">
                  <button
                    onClick={() => {
                      setShowWriteMenu(false)
                      navigateTo('write')
                    }}
                    type="button"
                  >
                    <i className="bi bi-pencil-square" />
                    Write a story
                  </button>
                </div>
              )}
            </div>
          )}
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
          <button className="avatar-chip" onClick={() => (isGuest ? onAuth() : navigateTo('profile'))} type="button">
            <span>
              {account?.avatar ? <img src={account.avatar} alt="" /> : getInitials(displayName)}
            </span>
            <strong>{displayName}</strong>
          </button>
          {isGuest ? (
            <>
              <button aria-label="Continue without an account" className="ghost-button guest-preview-button" onClick={onGuest} type="button">
                <i className="bi bi-person" />
                <span>None account</span>
              </button>
              <button className="primary-button" onClick={onAuth} type="button">
                Login
              </button>
            </>
          ) : (
            <button aria-label="Log out" className="ghost-button header-logout-button" onClick={() => setShowLogoutConfirm(true)} type="button">
              <i className="bi bi-box-arrow-right" />
              <span>Logout</span>
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
      {!isAdminPage && <ChatWidget />}
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
// Searches the Content collection (GET /api/content already filters to
// status: 'published') - both ebooks and audiobooks, tagged so it's clear
// which is which. Press Enter or click a result to jump to /books with
// that search applied (see App.jsx's handleHeaderSearch - Discover, which
// this used to jump to, is gone). Loading state while a request is in
// flight, and an explicit "no results" message rather than just an empty
// box.
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
      publicApiFetch(`/api/content?limit=6&search=${encodeURIComponent(trimmed)}`)
        .then((data) => {
          if (!ignore) setResults(Array.isArray(data?.items) ? data.items : [])
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
              results.map((item) => (
                <button key={item._id} onClick={() => submit(item.title)} type="button">
                  <img alt="" src={item.cover_image || ''} />
                  <span className="header-search-result-text">
                    <strong>{item.title}</strong>
                    <small>
                      <span className={`ai-chat-tag ai-chat-tag-${item.type}`}>{item.type === 'ebook' ? 'Ebook' : 'Audiobook'}</span>{' '}
                      {item.author}
                    </small>
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

// Real AI chat now (was a "coming soon" placeholder) - same AiChatPanel
// used by the full AI Suggestions page, just popped open from a floating
// bubble instead of given a whole page. See AiChatPanel.jsx for the actual
// chat logic; this is only the bubble/panel chrome around it.
function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="chat-widget">
      {isOpen && (
        <div className="chat-widget-panel" role="dialog" aria-label="Chat">
          <div className="chat-widget-panel-header">
            <strong>BookWorm AI</strong>
            <button aria-label="Close chat" onClick={() => setIsOpen(false)} type="button">
              <i className="bi bi-x-lg" />
            </button>
          </div>
          <div className="chat-widget-panel-body">
            <AiChatPanel />
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
