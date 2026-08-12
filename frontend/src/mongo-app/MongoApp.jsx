import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext'
import Layout from './Layout'
import LoginPage from './LoginPage'
import DiscoverPage from './DiscoverPage'
import BookDetailPage from './BookDetailPage'
import ActivityPage from './ActivityPage'
import AdminBooksPage from './AdminBooksPage'

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <p className="settings-copy mongo-loading">Loading...</p>
  if (!user) return <Navigate replace to="/mongo-app/login" />
  return children
}

function RequireAdmin({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <p className="settings-copy mongo-loading">Loading...</p>
  if (!user || user.role !== 'admin') return <Navigate replace to="/mongo-app" />
  return children
}

function MongoAppRoutes() {
  return (
    <Layout>
      <Routes>
        <Route element={<DiscoverPage />} index />
        <Route element={<LoginPage />} path="login" />
        <Route element={<BookDetailPage />} path="book/:id" />
        <Route
          element={(
            <RequireAuth>
              <ActivityPage />
            </RequireAuth>
          )}
          path="activity"
        />
        <Route
          element={(
            <RequireAdmin>
              <AdminBooksPage />
            </RequireAdmin>
          )}
          path="admin/books"
        />
      </Routes>
    </Layout>
  )
}

export default function MongoApp() {
  return (
    <AuthProvider>
      <MongoAppRoutes />
    </AuthProvider>
  )
}
