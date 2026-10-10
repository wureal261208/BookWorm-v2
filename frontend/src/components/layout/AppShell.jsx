import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getCover, getInitials } from '../../utils/bookUtils'
import HelpChatWidget from '../content/HelpChatWidget'
import { publicApiFetch } from '../../utils/apiClient'
import logo from '../../assets/logo.jpg'
import { useNavigation } from '../../context/NavigationContext'
import { useAudioPlayer } from '../../context/AudioPlayerContext'
import GlobalMiniPlayer from '../player/GlobalMiniPlayer'
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
  { id: 'audiobooks', label: 'Audio', icon: 'bi-headphones', target: 'books', query: 'type=audiobook' },
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
  const { isPlayerVisible } = useAudioPlayer()
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

  // Lock body scroll and handle Escape key and screen resize when mobile nav is open
  useEffect(() => {
    if (!isMobileNavOpen) return

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsMobileNavOpen(false)
      }
    }

    const handleResize = () => {
      if (window.innerWidth > 900) {
        setIsMobileNavOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleResize)

    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleResize)
    }
  }, [isMobileNavOpen])

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
    setIsMobileNavOpen(false)
    navigateTo('home')
  }

  return (
    <div className={`book-app app-theme-${websiteTheme}${isAdminPage ? ' book-app-admin-locked' : ''}`}>
      {!isAdminPage && (
      <header className={`site-header${isMobileNavOpen ? ' mobile-open' : ''}`}>
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
          {unreadNotifications > 0 && !isMobileNavOpen && (
            <span className="mobile-toggle-badge" aria-label={`${unreadNotifications} unread notifications`} />
          )}
        </button>

        <div className={`main-nav-group${isMobileNavOpen ? ' open' : ''}`}>
          {/* Mobile Profile / Account Mini-Card */}
          <div className="mobile-drawer-account">
            {isGuest ? (
              <div className="mobile-drawer-guest-card">
                <div className="mobile-guest-header">
                  <div className="mobile-guest-avatar">
                    <i className="bi bi-person-circle" />
                  </div>
                  <div className="mobile-guest-info">
                    <strong>Guest Reader</strong>
                    <span>Sign in to save books & progress</span>
                  </div>
                </div>
                <div className="mobile-guest-actions">
                  <button
                    className="primary-button"
                    onClick={() => {
                      setIsMobileNavOpen(false)
                      onAuth()
                    }}
                    type="button"
                  >
                    Login / Sign up
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => {
                      setIsMobileNavOpen(false)
                      onGuest()
                    }}
                    type="button"
                  >
                    Browse as guest
                  </button>
                </div>
              </div>
            ) : (
              <div className="mobile-drawer-user-card">
                <button
                  className="mobile-user-profile-btn"
                  onClick={() => {
                    setIsMobileNavOpen(false)
                    navigateTo('profile')
                  }}
                  type="button"
                >
                  <div className="mobile-user-avatar">
                    {account?.avatar ? <img src={account.avatar} alt="" /> : getInitials(displayName)}
                  </div>
                  <div className="mobile-user-meta">
                    <strong>{displayName}</strong>
                    <span>{account?.email || (isAdmin ? 'Admin / Staff' : 'Reader Account')}</span>
                  </div>
                  <i className="bi bi-chevron-right mobile-profile-arrow" />
                </button>

                <div className="mobile-user-quick-bar">
                  <button
                    className="ghost-button mobile-quick-btn"
                    onClick={() => {
                      setIsMobileNavOpen(false)
                      navigateTo('profile')
                    }}
                    type="button"
                  >
                    <i className="bi bi-person-gear" />
                    <span>Profile</span>
                  </button>
                  <button
                    className="ghost-button mobile-quick-btn"
                    onClick={() => {
                      setIsMobileNavOpen(false)
                      setShowNotifications(true)
                    }}
                    type="button"
                  >
                    <i className="bi bi-bell" />
                    <span>Notifications</span>
                    {unreadNotifications > 0 && <span className="notification-badge mini">{unreadNotifications}</span>}
                  </button>
                </div>
              </div>
            )}
          </div>

          <HeaderSearch onSearch={(term) => { setIsMobileNavOpen(false); onHeaderSearch?.(term) }} />

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
                      setIsMobileNavOpen(false)
                      navigateTo('write', { query: 'tab=story' })
                    }}
                    type="button"
                  >
                    <i className="bi bi-mic" />
                    <span>Write a story</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowWriteMenu(false)
                      setIsMobileNavOpen(false)
                      navigateTo('write', { query: 'tab=book' })
                    }}
                    type="button"
                  >
                    <i className="bi bi-book" />
                    <span>Write a book</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowWriteMenu(false)
                      setIsMobileNavOpen(false)
                      navigateTo('write', { query: 'tab=mine' })
                    }}
                    type="button"
                  >
                    <i className="bi bi-collection" />
                    <span>My submissions</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Mobile Drawer Footer Actions (Theme + Logout) */}
          <div className="mobile-drawer-footer">
            {typeof setWebsiteTheme === 'function' && (
              <button
                className="mobile-drawer-theme-btn"
                onClick={() => {
                  const nextIndex = (themeOrder.indexOf(websiteTheme) + 1) % themeOrder.length
                  setWebsiteTheme(themeOrder[nextIndex])
                }}
                type="button"
              >
                <i className={`bi ${themeIcons[websiteTheme] || 'bi-sun'}`} />
                <span>Theme: {websiteTheme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
                <small className="mobile-theme-hint">(Switch)</small>
              </button>
            )}

            {!isGuest && (
              <button
                className="danger-button mobile-drawer-logout-btn"
                onClick={() => {
                  setIsMobileNavOpen(false)
                  setShowLogoutConfirm(true)
                }}
                type="button"
              >
                <i className="bi bi-box-arrow-right" />
                Log out
              </button>
            )}
          </div>
        </div>

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
                            <i className={`bi ${item.conversationId || item.title?.toLowerCase().includes('support') ? 'bi-chat-dots-fill' : 'bi-envelope'}`} />
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

      {isMobileNavOpen && !isAdminPage && (
        <button
          aria-label="Close menu"
          className="mobile-nav-backdrop"
          onClick={() => setIsMobileNavOpen(false)}
          tabIndex={-1}
          type="button"
        />
      )}

      {showLogoutConfirm && (
        <div
          aria-labelledby="shell-confirm-logout-title"
          aria-modal="true"
          className="confirmation-dialog-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowLogoutConfirm(false)
          }}
          role="dialog"
        >
          <div className="confirmation-dialog-card">
            <button aria-label="Close" className="confirmation-dialog-close" onClick={() => setShowLogoutConfirm(false)} type="button">
              <i className="bi bi-x-lg" />
            </button>
            <div className="confirmation-dialog-icon warning">
              <i className="bi bi-box-arrow-right" />
            </div>
            <div className="confirmation-dialog-header">
              <span className="confirmation-dialog-eyebrow">Account</span>
              <h2 id="shell-confirm-logout-title">Leave BookWorm?</h2>
            </div>
            <div className="confirmation-dialog-body">
              <p>You'll need to log back in to pick up where you left off.</p>
            </div>

            <div className="confirmation-dialog-footer">
              <button className="ghost-button confirmation-cancel-btn" onClick={() => setShowLogoutConfirm(false)} type="button">Stay signed in</button>
              <button
                className="danger-button confirmation-confirm-btn"
                onClick={() => {
                  setShowLogoutConfirm(false)
                  onLogout()
                }}
                type="button"
              >
                <i className="bi bi-box-arrow-right" />
                <span>Log out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <main className={`${isAdminPage ? 'admin-page-shell' : `page-shell page-shell-${activePage || 'default'}`}${isPlayerVisible && !isAdminPage ? ' has-mini-player' : ''}`}>{children}</main>
      {!isAdminPage && <GlobalMiniPlayer />}
      {!isAdminPage && <ChatWidget isPlayerVisible={isPlayerVisible} />}
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
                  <img alt="" loading="lazy" src={getCover(item)} />
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

// A help/support chat now (was a "coming soon" placeholder, then briefly
// the book-recommendation chat) - see HelpChatWidget.jsx for the actual
// logic: AI answers first, escalates to a human admin after enough
// unresolved messages. Book recommendations live on the AI Suggestions
// page instead (AiSuggestionsPage.jsx) - this bubble is for "how do I..."
// questions, not "what should I read".
function ChatWidget({ isPlayerVisible = false }) {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    function handleOpenChat() {
      setIsOpen(true)
    }
    window.addEventListener('open-help-chat', handleOpenChat)
    return () => window.removeEventListener('open-help-chat', handleOpenChat)
  }, [])

  return (
    <div className={`chat-widget ${isPlayerVisible ? 'docked-above-player' : ''} ${isOpen ? 'chat-widget-open' : ''}`}>
      {isOpen && (
        <div className="chat-widget-panel" role="dialog" aria-label="BookWorm Help Chat">
          <div className="chat-widget-panel-header">
            <div className="chat-widget-panel-header-title">
              <i className="bi bi-chat-heart-fill" />
              <strong>BookWorm Help</strong>
            </div>
            <button aria-label="Close chat" onClick={() => setIsOpen(false)} type="button">
              <i className="bi bi-x-lg" />
            </button>
          </div>
          <div className="chat-widget-panel-body">
            <HelpChatWidget />
          </div>
        </div>
      )}
      <button
        aria-label={isOpen ? 'Close BookWorm Help' : 'Open BookWorm Help'}
        className={`chat-widget-bubble ${isOpen ? 'is-open' : ''}`}
        onClick={() => setIsOpen((value) => !value)}
        type="button"
      >
        <i className={`bi ${isOpen ? 'bi-x-lg' : 'bi-chat-dots-fill'}`} />
        <span className="chat-widget-bubble-label">{isOpen ? 'Close' : 'Help'}</span>
      </button>
    </div>
  )
}

export default AppShell
