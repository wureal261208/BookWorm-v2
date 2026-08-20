import { useEffect, useState } from 'react'
import { getInitials } from '../../utils/bookUtils'
import logo from '../../assets/logo.jpg'
import { useNavigation } from '../../context/NavigationContext'
import { hasAccess, normalizeRole } from '../../data/bookData'

const navItems = [
  { id: 'home', label: 'Home', icon: 'bi-house' },
  { id: 'discover', label: 'Discover', icon: 'bi-compass' },
  { id: 'requests', label: 'Rent a book', icon: 'bi-bag-plus', private: true },
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
  onLogout,
  onOpenRequests,
  rentalRequests = [],
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
  const unreadNotifications = isGuest
    ? 0
    : notifications.filter((item) => item.targetEmail === account?.email && !item.read).length

  // staff[].email is masked by the backend - match by the trusted Mongo id instead.
  const myStaffRecord = staff.find((item) => item.id === account?.id)
  const myShelfSection = myStaffRecord?.section === 'rent' ? 'rent' : myStaffRecord?.section === 'read' ? 'read' : null
  const isEmployeeOnly = normalizedRole === 'employee'

  const pendingRentalRequests = isAdmin ? rentalRequests.filter((item) => item.status === 'pending') : []
  const recentPushedBooks = isAdmin
    ? [...managedBooks]
        .filter((book) => !isEmployeeOnly || !myShelfSection || (book.access === 'rent' ? 'rent' : 'read') === myShelfSection)
        .sort((a, b) => getBookPushTimestamp(b.id) - getBookPushTimestamp(a.id))
        .slice(0, 4)
    : []
  const staffNotificationCount = pendingRentalRequests.length + recentPushedBooks.length
  const [showStaffNotifications, setShowStaffNotifications] = useState(false)
  const visibleNavItems = navItems.filter((item) => {
    if (isManagementNavContext && !managementNavIds.includes(item.id)) return false
    if (item.admin && !canShowAdminNav) return false
    if (item.private && isGuest) return false
    return true
  })

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

  function handleLogoClick() {
    navigateTo('home')
  }

  return (
    <div className={`book-app app-theme-${websiteTheme}`}>
      <header className="site-header">
        <button className="brand-button" onClick={handleLogoClick} type="button">
          <img src={logo} alt="BookWorm logo" />
          <span>BookWorm</span>
        </button>

        <nav className="main-nav" aria-label="Main navigation">
          {visibleNavItems.map((item) => {
            if (item.admin && !canShowAdminNav) return null
            if (item.private && isGuest) return null

            return (
              <button
                className={activePage === item.id ? 'active' : ''}
                key={item.id}
                onClick={() => navigateTo(item.id)}
                type="button"
              >
                <i className={`bi ${item.icon}`} />
                {item.label}
              </button>
            )
          })}
        </nav>

        <div className="header-account">
          {!isGuest && isAdmin && (
            <div className="mongo-notification" style={{ position: 'relative' }}>
              <button
                aria-label={`Notifications${staffNotificationCount ? ` (${staffNotificationCount})` : ''}`}
                className="notification-bell"
                onClick={() => setShowStaffNotifications((value) => !value)}
                title="Rental requests and push activity"
                type="button"
              >
                <i className="bi bi-bell" />
                {staffNotificationCount > 0 && <span className="notification-badge">{staffNotificationCount}</span>}
              </button>
              {showStaffNotifications && (
                <div className="mongo-notification-dropdown">
                  <strong>Rental requests</strong>
                  {pendingRentalRequests.length ? (
                    <ul>
                      {pendingRentalRequests.slice(0, 4).map((request) => (
                        <li key={request.id}>
                          <button
                            onClick={() => {
                              setShowStaffNotifications(false)
                              navigateTo('admin')
                            }}
                            type="button"
                          >
                            <i className="bi bi-bag-check" />
                            <span>{request.customerName} wants to rent "{request.bookTitle}" - needs confirmation.</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="settings-copy">No pending rental requests.</p>
                  )}

                  <strong style={{ marginTop: 10 }}>
                    {isEmployeeOnly && myShelfSection ? `Recently pushed to ${myShelfSection === 'rent' ? 'To Rent' : 'To Read'}` : 'Recently pushed books'}
                  </strong>
                  {recentPushedBooks.length ? (
                    <ul>
                      {recentPushedBooks.map((book) => (
                        <li key={book.id}>
                          <button
                            onClick={() => {
                              setShowStaffNotifications(false)
                              navigateTo('admin')
                            }}
                            type="button"
                          >
                            <i className="bi bi-journal-plus" />
                            <span>
                              "{book.title}" pushed to {book.access === 'rent' ? 'To Rent' : 'To Read'}.
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="settings-copy">No recent push activity.</p>
                  )}
                </div>
              )}
            </div>
          )}
          {!isGuest && !isAdmin && (
            <button
              aria-label={`Notifications${unreadNotifications ? ` (${unreadNotifications} unread)` : ''}`}
              className="notification-bell"
              onClick={() => (onOpenRequests ? onOpenRequests() : navigateTo('requests'))}
              title="Rental requests and notifications"
              type="button"
            >
              <i className="bi bi-bell" />
              {unreadNotifications > 0 && <span className="notification-badge">{unreadNotifications}</span>}
            </button>
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
              <button className="ghost-button" onClick={onGuest} type="button">
                None account
              </button>
              <button className="primary-button" onClick={onAuth} type="button">
                Login
              </button>
            </>
          ) : (
            <button className="ghost-button" onClick={onLogout} type="button">
              Logout
            </button>
          )}
        </div>
      </header>

      <main className="page-shell">{children}</main>
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

function getBookPushTimestamp(id) {
  const match = /^managed-(\d+)$/.exec(id || '')
  return match ? Number(match[1]) : 0
}

export default AppShell
