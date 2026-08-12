import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import NotificationBell from './NotificationBell'

export default function Layout({ children }) {
  const { logout, user } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/mongo-app')
  }

  return (
    <div className="mongo-app">
      <header className="mongo-header">
        <Link className="mongo-brand" to="/mongo-app">
          BookWorm <span>MongoDB demo</span>
        </Link>
        <nav className="mongo-nav">
          <Link to="/mongo-app">Discover</Link>
          {user && <Link to="/mongo-app/activity">Activity</Link>}
          {user?.role === 'admin' && <Link to="/mongo-app/admin/books">Push Book</Link>}
        </nav>
        <div className="mongo-header-actions">
          {user ? (
            <>
              <NotificationBell />
              <span className="mongo-user-chip">{user.name}</span>
              <button className="ghost-button" onClick={handleLogout} type="button">Logout</button>
            </>
          ) : (
            <Link className="primary-button" to="/mongo-app/login">Login</Link>
          )}
        </div>
      </header>
      <main className="mongo-main">{children}</main>
    </div>
  )
}
