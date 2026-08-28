import { lazy, Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  updateProfile,
} from 'firebase/auth'
import AuthPage from './components/auth/AuthPage'
import AppShell from './components/layout/AppShell'
import { apiFetch, publicApiFetch } from './utils/apiClient'
import {
  hasAccess,
  normalizeRole,
} from './data/bookData'
import { NavigationProvider } from './context/NavigationContext'
import { auth } from './features/auth-firebase/firebaseConfig'
import { getAuthor, getCategory, getReaderUrl } from './utils/bookUtils'
import {
  globalDataDefaults,
  migrateLegacyComments,
  saveBookComment,
  saveGlobalData,
  saveUserData,
  stableStringify,
  subscribeComments,
  subscribeGlobalData,
  subscribeUserData,
  userDataDefaults,
} from './utils/firebaseData'
import logo from './assets/logo.jpg'
import './App.css'

const AdminPage = lazy(() => import('./components/pages/AdminPage'))
const BookDetailPage = lazy(() => import('./components/pages/BookDetailPage'))
const DiscoverPage = lazy(() => import('./components/pages/DiscoverPage'))
const HomePage = lazy(() => import('./components/pages/HomePage'))
const ProfilePage = lazy(() => import('./components/pages/ProfilePage'))
const ReaderPage = lazy(() => import('./components/pages/ReaderPage'))

const emptyAuthForm = { name: '', email: '', password: '' }
const emptyAdminBook = {
  title: '',
  author: '',
  category: '',
  description: '',
  subjects: '',
  language: 'en',
  status: 'draft',
  readerUrl: '',
  cover: '',
  // Set when the form was filled from the Gutenberg catalog (book_metadata);
  // null for a manually typed book. Sent to the backend so the pushed Book
  // stays linked to its catalog entry.
  sourceEtextNumber: null,
}
const guestAccount = { id: 'guest', name: 'None Account', email: 'guest@bookworm.local', role: 'guest' }
const SEARCH_HISTORY_LIMIT = 8
const PAGE_PATHS = {
  home: '/',
  discover: '/discover',
  detail: '/book',
  reader: '/reader',
  profile: '/profile',
  requests: '/requests',
  admin: '/admin',
  auth: '/auth',
}
const PATH_PAGES = Object.fromEntries(Object.entries(PAGE_PATHS).map(([page, path]) => [path, page]))
const pageInitialState = {
  activePage: getPageFromPath(typeof window === 'undefined' ? '/' : window.location.pathname),
  isPageLoading: false,
}

function pageReducer(state, action) {
  if (action.type === 'start') return { ...state, isPageLoading: true }
  if (action.type === 'finish') return { activePage: action.page, isPageLoading: false }
  if (action.type === 'instant') return { activePage: action.page, isPageLoading: false }
  return state
}

function App() {
  const location = useLocation()
  const routerNavigate = useNavigate()
  const [account, setAccount] = useState(guestAccount)
  const [authError, setAuthError] = useState('')
  const [authErrorField, setAuthErrorField] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [authMode, setAuthMode] = useState('login')
  const [authReady, setAuthReady] = useState(false)
  const [toast, setToast] = useState(null)
  const [banNotice, setBanNotice] = useState(null)
  const [pageState, dispatchPage] = useReducer(pageReducer, pageInitialState)
  const routeTimerRef = useRef(null)
  const [books, setBooks] = useState([])
  const [, setBooksLoading] = useState(false)
  const [managedBooks, setManagedBooks] = useState([])
  const [managedBooksError, setManagedBooksError] = useState('')
  const [favorites, setFavorites] = useState(userDataDefaults.favorites)
  const [history, setHistory] = useState(userDataDefaults.history)
  const [readingActivity, setReadingActivity] = useState(userDataDefaults.readingActivity)
  const [viewCounts, setViewCounts] = useState(globalDataDefaults.viewCounts)
  const [bookReaders, setBookReaders] = useState(globalDataDefaults.bookReaders)
  const [progress, setProgress] = useState(userDataDefaults.progress)
  const [checkpoints, setCheckpoints] = useState(userDataDefaults.checkpoints)
  const [notes, setNotes] = useState(userDataDefaults.notes)
  const [highlights, setHighlights] = useState(userDataDefaults.highlights)
  const [comments, setComments] = useState(globalDataDefaults.comments)
  const [searchHistory, setSearchHistory] = useState(userDataDefaults.searchHistory)
  const [staff, setStaff] = useState([])
  const [accountSettings, setAccountSettings] = useState(userDataDefaults.accountSettings)
  const [selectedBook, setSelectedBook] = useState(null)
  const [readerStartPage, setReaderStartPage] = useState(null)
  const [query, setQuery] = useState('')
  const [topic, setTopic] = useState('all')
  const [readerTheme, setReaderTheme] = useState(userDataDefaults.readerTheme)
  const [readerFontSize, setReaderFontSize] = useState(userDataDefaults.readerFontSize)
  const [websiteTheme, setWebsiteTheme] = useState(userDataDefaults.websiteTheme)
  const [authForm, setAuthForm] = useState(emptyAuthForm)
  const [adminBook, setAdminBook] = useState(emptyAdminBook)
  const [notifications, setNotifications] = useState([])
  const [globalDataReady, setGlobalDataReady] = useState(false)
  const [userDataReady, setUserDataReady] = useState(false)
  const accountSettingsRef = useRef(accountSettings)
  const globalDataSnapshotRef = useRef('')
  const userDataSnapshotRef = useRef('')
  const pendingFavoriteUpdatesRef = useRef([])
  const syncErrorRef = useRef('')
  const migratedLegacyCommentsRef = useRef(false)
  const activePage = pageState.activePage

  // Role is resolved from the backend (verified Firebase ID token -> profile
  // stored in MongoDB), never from the Firestore `staff` array directly -
  // that array is only readable/writable by the backend now, but the app
  // still shouldn't trust client-visible data for something as sensitive as
  // "is this person an admin". Any failure to reach the backend defaults to
  // 'customer' (fail closed): worse case an admin briefly can't reach
  // /admin, never the other way around. Also carries `id` (Mongo _id) and
  // `displayId` (AD-000001 / 000001 style ID) - matching against the /api/users
  // list has to use this Mongo id, not the Firebase uid, and not email
  // (masked in list responses).
  const resolveTrustedProfile = useCallback(async () => {
    try {
      const data = await apiFetch('/api/users/me')
      return {
        role: normalizeRole(data.user?.role) || 'customer',
        id: data.user?.id || '',
        displayId: data.user?.displayId || '',
      }
    } catch (error) {
      console.warn('Could not verify account role from server, defaulting to customer:', error.message)
      // The backend's ban check (middleware/auth.js `protect`) returns a
      // specific "Your account has been banned... Reason: ..." message -
      // surface that verbatim in the ban popup instead of a generic toast.
      const banMessage = /banned/i.test(error.message || '') ? error.message : ''
      return { role: 'customer', id: '', displayId: '', banMessage }
    }
  }, [])

  const scrollToTopForPage = useCallback((page) => {
    if (typeof window === 'undefined') return

    if (['home', 'discover', 'profile'].includes(page)) {
      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' })
    }
  }, [])

  const navigateTo = useCallback((page, options = {}) => {
    const nextPage = PAGE_PATHS[page] ? page : 'home'
    const nextPath = PAGE_PATHS[nextPage]
    window.clearTimeout(routeTimerRef.current)

    const openRoute = () => {
      if (window.location.pathname !== nextPath) {
        routerNavigate(nextPath, { replace: Boolean(options.replace) })
      }
    }

    if (options.instant) {
      dispatchPage({ type: 'instant', page: nextPage })
      openRoute()
      scrollToTopForPage(nextPage)
      return
    }

    dispatchPage({ type: 'start' })
    routeTimerRef.current = window.setTimeout(() => {
      openRoute()
      dispatchPage({ type: 'finish', page: nextPage })
      scrollToTopForPage(nextPage)
    }, 420)
  }, [routerNavigate, scrollToTopForPage])

  const handleDataSyncError = useCallback((error, source = 'unknown') => {
    console.error(`[Firestore sync error @ ${source}]`, error?.code, error?.message, error)

    const message =
      error?.code === 'permission-denied'
        ? 'Firebase Firestore denied this data sync. Check Firestore rules for BookWorm.'
        : 'Could not sync BookWorm data to Firebase. Please check the Firestore setup.'

    if (syncErrorRef.current === message) return
    syncErrorRef.current = message
    setToast({ type: 'error', message })
  }, [])

  const userData = useMemo(
    () => ({
      favorites,
      history,
      readingActivity,
      progress,
      checkpoints,
      notes,
      highlights,
      searchHistory,
      accountSettings,
      websiteTheme,
      readerTheme,
      readerFontSize,
    }),
    [
      accountSettings,
      checkpoints,
      favorites,
      highlights,
      history,
      notes,
      progress,
      readerFontSize,
      readerTheme,
      readingActivity,
      searchHistory,
      websiteTheme,
    ],
  )

  useEffect(() => {
    return () => window.clearTimeout(routeTimerRef.current)
  }, [])

  useEffect(() => {
    const nextPage = getPageFromPath(location.pathname)
    if (nextPage === activePage) return

    window.clearTimeout(routeTimerRef.current)
    dispatchPage({ type: 'instant', page: nextPage })
    scrollToTopForPage(nextPage)
  }, [activePage, location.pathname, scrollToTopForPage])

  useEffect(() => {
    accountSettingsRef.current = accountSettings
  }, [accountSettings])

  // Managers/employees/customers used to come from the same demo global-data
  // stub as comments/notifications (see utils/firebaseData.js) - that stub
  // always returned an empty list for these, which is why "Users" looked
  // empty even with real accounts in Mongo. This is the real fetch.
  const refreshStaffDirectory = useCallback(async () => {
    if (!hasAccess(account.role, 'manager')) return
    try {
      const data = await apiFetch('/api/users')
      setStaff(Array.isArray(data.users) ? data.users : [])
    } catch (error) {
      handleDataSyncError(error, 'refresh-staff-directory')
    }
  }, [account.role, handleDataSyncError])

  useEffect(() => {
    refreshStaffDirectory()
  }, [refreshStaffDirectory])

  // Notifications now come straight from Mongo (see notificationController.js)
  // instead of the firebaseData stub - refetched on login/logout and after
  // marking one as read.
  const refreshNotifications = useCallback(async () => {
    if (account.role === 'guest') {
      setNotifications([])
      return
    }
    try {
      const data = await apiFetch('/api/notifications')
      setNotifications(Array.isArray(data.notifications) ? data.notifications : [])
    } catch (error) {
      handleDataSyncError(error, 'refresh-notifications')
    }
  }, [account.role, handleDataSyncError])

  useEffect(() => {
    refreshNotifications()
  }, [refreshNotifications])

  useEffect(() => {
    return subscribeGlobalData(
      (data) => {
        const nextData = {
          viewCounts: data.viewCounts || {},
          bookReaders: data.bookReaders || {},
        }

        globalDataSnapshotRef.current = stableStringify(nextData)
        setViewCounts(nextData.viewCounts)
        setBookReaders(nextData.bookReaders)
        if (data.comments && Object.keys(data.comments).length) {
          setComments((current) => mergeCommentMaps(data.comments, current))
          if (!migratedLegacyCommentsRef.current) {
            migratedLegacyCommentsRef.current = true
            migrateLegacyComments(data.comments).catch((error) => handleDataSyncError(error, 'migrate-legacy-comments'))
          }
        }
        setGlobalDataReady(true)
      },
      (error) => {
        setGlobalDataReady(true)
        handleDataSyncError(error, 'subscribe-global-data')
      },
    )
  }, [handleDataSyncError])

  useEffect(() => {
    return subscribeComments(
      (nextComments) => {
        setComments((current) => mergeCommentMaps(current, nextComments))
      },
      handleDataSyncError,
    )
  }, [handleDataSyncError])

  useEffect(() => {
    if (account.role === 'guest') {
      let isCurrent = true
      queueMicrotask(() => {
        if (!isCurrent) return
        setFavorites(userDataDefaults.favorites)
        setHistory(userDataDefaults.history)
        setReadingActivity(userDataDefaults.readingActivity)
        setProgress(userDataDefaults.progress)
        setCheckpoints(userDataDefaults.checkpoints)
        setNotes(userDataDefaults.notes)
        setHighlights(userDataDefaults.highlights)
        setSearchHistory(userDataDefaults.searchHistory)
        setAccountSettings(userDataDefaults.accountSettings)
        setWebsiteTheme(userDataDefaults.websiteTheme)
        setReaderTheme(userDataDefaults.readerTheme)
        setReaderFontSize(userDataDefaults.readerFontSize)
        setUserDataReady(false)
        userDataSnapshotRef.current = ''
      })
      return () => {
        isCurrent = false
      }
    }

    queueMicrotask(() => {
      setUserDataReady(false)
    })

    return subscribeUserData(
      account.id,
      (data) => {
        const savedData = {
          favorites: data.favorites || [],
          history: data.history || [],
          readingActivity: data.readingActivity || {},
          progress: data.progress || {},
          checkpoints: data.checkpoints || {},
          notes: data.notes || {},
          highlights: data.highlights || {},
          searchHistory: data.searchHistory || [],
          accountSettings: data.accountSettings || {},
          websiteTheme: data.websiteTheme || userDataDefaults.websiteTheme,
          readerTheme: data.readerTheme || userDataDefaults.readerTheme,
          readerFontSize: data.readerFontSize || userDataDefaults.readerFontSize,
        }
        const pendingFavoriteUpdates = pendingFavoriteUpdatesRef.current
        const nextData = {
          ...savedData,
          favorites: applyFavoriteUpdates(savedData.favorites, pendingFavoriteUpdates),
        }

        userDataSnapshotRef.current = stableStringify(savedData)
        pendingFavoriteUpdatesRef.current = []
        setFavorites(nextData.favorites)
        setHistory(nextData.history)
        setReadingActivity(nextData.readingActivity)
        setProgress(nextData.progress)
        setCheckpoints(nextData.checkpoints)
        setNotes(nextData.notes)
        setHighlights(nextData.highlights)
        setSearchHistory(nextData.searchHistory)
        setAccountSettings(nextData.accountSettings)
        setWebsiteTheme(nextData.websiteTheme)
        setReaderTheme(nextData.readerTheme)
        setReaderFontSize(nextData.readerFontSize)
        setUserDataReady(true)
      },
      (error) => {
        setUserDataReady(true)
        handleDataSyncError(error, 'subscribe-user-data')
      },
    )
  }, [account.id, account.role, handleDataSyncError])

  useEffect(() => {
    if (account.role === 'guest' || !userDataReady) return

    const savedSettings = accountSettings[account.id] || accountSettings[account.email] || {}
    const nextName = savedSettings.displayName || account.name
    const nextAvatar = savedSettings.avatar || account.avatar || ''
    const shouldUpdateName = nextName && nextName !== account.name
    const shouldUpdateAvatar = nextAvatar !== (account.avatar || '')

    if (shouldUpdateName || shouldUpdateAvatar) {
      queueMicrotask(() => {
        setAccount((current) => ({ ...current, name: nextName, avatar: nextAvatar }))
      })
    }
  }, [account.avatar, account.email, account.id, account.name, account.role, accountSettings, userDataReady])

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      const currentRoute = getPageFromPath(window.location.pathname)

      if (!user) {
        setAccount(guestAccount)
        if (currentRoute === 'profile' || currentRoute === 'admin') {
          navigateTo('home', { instant: true, replace: true })
        }
        setAuthReady(true)
        return
      }

      const email = user.email?.toLowerCase() || ''

      const savedSettings = accountSettingsRef.current[user.uid] || accountSettingsRef.current[email] || {}
      if (savedSettings.websiteTheme) setWebsiteTheme(savedSettings.websiteTheme)
      const trustedProfile = await resolveTrustedProfile()

      // A banned/restricted account still holds a valid Firebase session
      // token for up to an hour, but the backend rejects every API call for
      // it (see middleware/auth.js `protect`) - resolveTrustedProfile falls
      // back to 'customer' + no id on any such failure, so this is also the
      // fail-closed path for "couldn't verify, don't trust this session".
      if (!trustedProfile.id) {
        await signOut(auth)
        if (trustedProfile.banMessage) {
          setBanNotice(trustedProfile.banMessage)
        } else {
          setToast({ type: 'error', message: "We couldn't verify this account. If it was banned or restricted, contact a manager or admin." })
        }
        setAuthReady(true)
        return
      }

      const nextAccount = {
        id: trustedProfile.id,
        firebaseUid: user.uid,
        displayId: trustedProfile.displayId,
        name: savedSettings.displayName || user.displayName || email.split('@')[0] || 'Reader',
        email,
        avatar: savedSettings.avatar || user.photoURL || '',
        role: trustedProfile.role,
      }

      setAccount(nextAccount)
      const canAccessAdmin = hasAccess(nextAccount.role, 'employee')

      if (currentRoute === 'auth') {
        navigateTo(canAccessAdmin ? 'admin' : 'home', { instant: true, replace: true })
      } else if (currentRoute === 'admin' && !canAccessAdmin) {
        navigateTo('home', { instant: true, replace: true })
      }
      setAuthReady(true)
    })

    return unsubscribe
  }, [navigateTo, resolveTrustedProfile])

  useEffect(() => {
    if (account.role === 'guest' || !account.email) return

    let isCurrent = true
    resolveTrustedProfile().then((next) => {
      if (!isCurrent) return
      if (next.banMessage) {
        signOut(auth)
        setBanNotice(next.banMessage)
        return
      }
      if (next.role === account.role) return
      setAccount((current) => ({ ...current, role: next.role, displayId: next.displayId || current.displayId }))
    })

    return () => {
      isCurrent = false
    }
  }, [account.email, account.role, resolveTrustedProfile])

  useEffect(() => {
    if (!['admin', 'manager', 'employee'].includes(account.role)) {
      queueMicrotask(() => setManagedBooks([]))
      return
    }

    let ignore = false
    apiFetch('/api/books/mine')
      .then((data) => {
        if (!ignore) setManagedBooks(Array.isArray(data.books) ? data.books : [])
      })
      .catch((error) => {
        if (!ignore) setManagedBooksError(error.message)
      })

    return () => {
      ignore = true
    }
  }, [account.email, account.role])

  useEffect(() => {
    let ignore = false

    async function loadBooks() {
      setBooksLoading(true)
      try {
        const pageRequests = [1, 2, 3].map(async (page) => {
          const data = await publicApiFetch(`/api/books?limit=32&page=${page}`).catch(() => ({ books: [] }))
          return Array.isArray(data.books) ? data.books : []
        })

        const pages = await Promise.all(pageRequests)
        const combinedBooks = pages.flat()

        if (!ignore) {
          setBooks(combinedBooks)
        }
      } catch {
        if (!ignore) setBooks([])
      } finally {
        if (!ignore) setBooksLoading(false)
      }
    }

    loadBooks()
    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    if (!globalDataReady) return

    const nextGlobalData = {
      viewCounts,
      bookReaders,
    }
    const nextSnapshot = stableStringify(nextGlobalData)
    if (nextSnapshot === globalDataSnapshotRef.current) return

    globalDataSnapshotRef.current = nextSnapshot
    saveGlobalData(nextGlobalData).catch((error) => handleDataSyncError(error, 'save-global-data'))
  }, [bookReaders, globalDataReady, handleDataSyncError, viewCounts])

  useEffect(() => {
    if (account.role === 'guest' || !userDataReady) return

    const nextSnapshot = stableStringify(userData)
    if (nextSnapshot === userDataSnapshotRef.current) return

    userDataSnapshotRef.current = nextSnapshot
    saveUserData(account.id, userData).catch((error) => handleDataSyncError(error, 'save-user-data'))
  }, [account.id, account.role, handleDataSyncError, userData, userDataReady])

  const publishedManagedBooks = useMemo(
    () => managedBooks.filter((book) => (book.status || 'published') === 'published'),
    [managedBooks],
  )
  const allBooks = useMemo(() => [...publishedManagedBooks, ...books], [books, publishedManagedBooks])
  const topics = useMemo(() => ['all', ...new Set(allBooks.map(getCategory).slice(0, 12))], [allBooks])
  const filteredBooks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return allBooks.filter((book) => {
      const matchesQuery =
        !normalizedQuery ||
        book.title.toLowerCase().includes(normalizedQuery) ||
        getAuthor(book).toLowerCase().includes(normalizedQuery)
      const matchesTopic = topic === 'all' || getCategory(book) === topic

      return matchesQuery && matchesTopic
    })
  }, [allBooks, query, topic])

  const handleAuth = useCallback(async (event) => {
    event.preventDefault()
    setAuthError('')
    setAuthErrorField('')
    setAuthLoading(true)

    const email = authForm.email.trim().toLowerCase()
    const password = authForm.password
    if (!email || !password) {
      setAuthError('Please enter your email and password.')
      setAuthErrorField(!email ? 'email' : 'password')
      setAuthLoading(false)
      return
    }

    try {
      if (authMode === 'signup') {
        const credential = await createUserWithEmailAndPassword(auth, email, password)
        const displayName = authForm.name.trim() || email.split('@')[0]
        await updateProfile(credential.user, { displayName })
        setAuthForm(emptyAuthForm)
        setToast({ type: 'success', message: 'Account created successfully.' })
        return
      }

      await signInWithEmailAndPassword(auth, email, password)

      setAuthForm(emptyAuthForm)
      setToast({ type: 'success', message: 'Login successful. Welcome back.' })
    } catch (error) {
      const nextError = getAuthMessage(error.code)
      setAuthError(nextError.message)
      setAuthErrorField(nextError.field)
    } finally {
      setAuthLoading(false)
    }
  }, [authForm.email, authForm.name, authForm.password, authMode])

  function updateAuthMode(nextMode) {
    setAuthMode(nextMode)
    setAuthError('')
    setAuthErrorField('')
  }

  async function handleLogout() {
    await signOut(auth)
    setAccount(guestAccount)
    navigateTo('home', { instant: true })
    setSelectedBook(null)
  }

  async function updateAccountProfile({ avatar, displayName }) {
    const trimmedName = displayName.trim()
    if (!auth.currentUser || !trimmedName) return

    const nextSettings = {
      ...(accountSettings[account.id] || {}),
      avatar,
      displayName: trimmedName,
      websiteTheme,
    }

    await updateProfile(auth.currentUser, { displayName: trimmedName })

    setAccount((current) => ({ ...current, avatar, name: trimmedName }))
    setAccountSettings((current) => ({ ...current, [account.id]: nextSettings }))
    setToast({ type: 'success', message: 'Account profile updated.' })
  }

  // Old/New/Confirm change from inside Profile - distinct from the "forgot
  // password" email link, which stays login-page-only (see handleForgotPassword
  // below). Firebase requires re-proving the current password before it will
  // accept a new one (reauthenticateWithCredential), which is also our "is
  // the old password actually correct" check - no separate backend call
  // needed for that part. The backend call after is just to record the change
  // and email a notice; if that fails, the password change itself has
  // already succeeded, so we don't treat it as an error.
  async function changeAccountPassword({ oldPassword, newPassword }) {
    if (!auth.currentUser?.email) throw new Error('No signed-in account.')

    const credential = EmailAuthProvider.credential(auth.currentUser.email, oldPassword)
    await reauthenticateWithCredential(auth.currentUser, credential)
    await updatePassword(auth.currentUser, newPassword)

    try {
      await apiFetch('/api/users/me/password-changed', { method: 'POST' })
    } catch (error) {
      console.warn('Password changed, but the confirmation email could not be recorded/sent:', error.message)
    }

    setToast({ type: 'success', message: 'Password updated. A confirmation email has been sent.' })
  }

  async function handleForgotPassword(email) {
    const normalizedEmail = email.trim().toLowerCase()
    await sendPasswordResetEmail(auth, normalizedEmail)
    setToast({ type: 'success', message: `Password reset email sent to ${normalizedEmail}.` })
  }

  function updateWebsiteTheme(nextTheme) {
    setWebsiteTheme(nextTheme)
    if (account.role !== 'guest') {
      setAccountSettings((current) => ({
        ...current,
        [account.id]: {
          ...(current[account.id] || {}),
          avatar: account.avatar || '',
          displayName: account.name,
          websiteTheme: nextTheme,
        },
      }))
    }
  }

  function goGuest() {
    setAccount(guestAccount)
    navigateTo('home', { instant: true })
  }

  function goAuth() {
    setAuthMode('login')
    navigateTo('auth')
  }

  function rememberSearchTerm(term) {
    const normalizedTerm = term.trim()
    if (!normalizedTerm) return

    setSearchHistory((current) => [
      normalizedTerm,
      ...current.filter((item) => item.toLowerCase() !== normalizedTerm.toLowerCase()),
    ].slice(0, SEARCH_HISTORY_LIMIT))
  }

  function handleSearchSubmit(term) {
    setQuery(term)
    rememberSearchTerm(term)
  }

  function recordBookView(book) {
    setViewCounts((current) => ({ ...current, [book.id]: (current[book.id] || 0) + 1 }))
    setBookReaders((current) => {
      const accountKey = getAccountKey(account)
      const readers = current[book.id] || []
      if (readers.includes(accountKey)) return current
      return { ...current, [book.id]: [...readers, accountKey] }
    })
  }

  function openDetail(book) {
    setSelectedBook(book)
    recordBookView(book)
    navigateTo('detail')
  }

  function openBook(book, startPage = null) {
    setSelectedBook(book)
    setReaderStartPage(startPage)
    navigateTo('reader')
    if (account.role !== 'guest') {
      setHistory((current) => [book.id, ...current.filter((id) => id !== book.id)].slice(0, 20))
      recordReadingDay()
    }
    if (activePage !== 'detail') recordBookView(book)
  }

  function openChapter(book, chapter) {
    if (account.role === 'guest' && chapter.number > 3) {
      setToast({ type: 'error', message: 'BookWorm membership is required to read beyond chapter 3.' })
      return
    }

    openBook(book, chapter.startPage)
  }

  function recordReadingDay() {
    const accountKey = getAccountKey(account)
    const today = new Date().toISOString().slice(0, 10)
    setReadingActivity((current) => {
      const days = current[accountKey] || []
      return days.includes(today) ? current : { ...current, [accountKey]: [today, ...days].slice(0, 90) }
    })
  }

  function addComment(bookId, text) {
    const trimmedText = text.trim()
    if (!trimmedText) return

    const accountKey = getAccountKey(account)
    const nextComment = {
      id: `${bookId}-${accountKey}-comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      author: account.role === 'guest' ? getGuestCommentName(bookId, comments[bookId]?.length || 0) : account.name,
      role: account.role === 'guest' ? 'guest' : 'member',
      accountId: accountKey,
      text: trimmedText,
      createdAt: new Date().toISOString(),
    }

    setComments((current) => ({
      ...current,
      [bookId]: [nextComment, ...(current[bookId] || [])].slice(0, 30),
    }))
    saveBookComment(bookId, nextComment).catch((error) => handleDataSyncError(error, 'save-book-comment'))
  }

  function toggleFavorite(bookId) {
    if (!bookId) return

    if (account.role === 'guest') {
      setToast({ type: 'error', message: 'Login to save books to your shelf.' })
      navigateTo('auth')
      return
    }

    const action = favorites.includes(bookId) ? 'remove' : 'add'
    if (!userDataReady) {
      pendingFavoriteUpdatesRef.current = [...pendingFavoriteUpdatesRef.current, { action, bookId }]
      setToast({ type: 'success', message: 'Bookmark updated. It will sync when your shelf is ready.' })
    }

    setFavorites((current) => applyFavoriteUpdates(current, [{ action, bookId }]))
  }

  async function markNotificationRead(notificationId) {
    try {
      await apiFetch(`/api/notifications/${notificationId}/read`, { method: 'PATCH' })
    } catch (error) {
      handleDataSyncError(error, 'mark-notification-read')
      return
    }
    setNotifications((current) => current.map((item) => (
      item.id === notificationId ? { ...item, read: true } : item
    )))
  }

  async function banUser(id, { days, reason }) {
    try {
      await apiFetch(`/api/users/${id}/ban`, { method: 'PATCH', body: { days, reason } })
      await refreshStaffDirectory()
      setToast({ type: 'success', message: days > 0 ? `Customer banned for ${days} day(s).` : 'Customer banned permanently.' })
      return true
    } catch (error) {
      setToast({ type: 'error', message: error.message })
      return false
    }
  }

  async function unbanUser(id) {
    try {
      await apiFetch(`/api/users/${id}/unban`, { method: 'PATCH' })
      await refreshStaffDirectory()
      setToast({ type: 'success', message: 'Customer unbanned.' })
      return true
    } catch (error) {
      setToast({ type: 'error', message: error.message })
      return false
    }
  }

  async function addManagedBook(event) {
    event.preventDefault()
    const validationErrors = validateAdminBook(adminBook, managedBooks)
    if (validationErrors.length) {
      setToast({ type: 'error', message: validationErrors.slice(0, 2).join(' ') })
      return false
    }

    const record = createAdminBookRecord(adminBook)
    setManagedBooksError('')
    try {
      const { book } = adminBook.id
        ? await apiFetch(`/api/books/${adminBook.id}`, { method: 'PUT', body: record })
        : await apiFetch('/api/books', { method: 'POST', body: record })

      setManagedBooks((current) => {
        const exists = current.some((item) => item.id === book.id)
        return exists ? current.map((item) => (item.id === book.id ? book : item)) : [book, ...current]
      })
      setAdminBook(emptyAdminBook)
      setToast({ type: 'success', message: book.status === 'published' ? 'Book published to the main site.' : 'Book saved in Admin.' })
      return true
    } catch (error) {
      setManagedBooksError(error.message)
      setToast({ type: 'error', message: error.message })
      return false
    }
  }

  async function removeManagedBook(id) {
    if (!id) {
      setToast({ type: 'error', message: 'This book has no id yet - refresh the admin book list and try again.' })
      return
    }
    try {
      await apiFetch(`/api/books/${id}`, { method: 'DELETE' })
      setManagedBooks((current) => current.filter((book) => book.id !== id))
    } catch (error) {
      // The backend already returned 404 because the book is already gone
      // from MongoDB (e.g. deleted directly in Compass/mongosh, or this row
      // was stale leftover state) - the goal (book removed) is already true,
      // so just drop the stale row instead of leaving it stuck with an error.
      if (/not found/i.test(error.message)) {
        setManagedBooks((current) => current.filter((book) => book.id !== id))
        setToast({ type: 'success', message: 'That book was already removed from the database - cleared it from this list too.' })
        return
      }
      setToast({ type: 'error', message: error.message })
    }
  }

  function editManagedBook(book) {
    setAdminBook({
      ...emptyAdminBook,
      ...book,
      author: getAuthor(book),
      category: getCategory(book),
      // Real Mongo documents store these as coverUrl/readerUrl (see
      // Book.js) - book.cover/book.formats only exist on the Gutendex-shaped
      // catalog-search preview objects, never on a saved book. Checking
      // those first here meant editing a real book always showed a blank
      // cover and reader URL, even though the data was saved correctly.
      cover: book.coverUrl || book.formats?.['image/jpeg'] || book.cover || '',
      readerUrl: book.readerUrl || getReaderUrl(book),
      subjects: Array.isArray(book.subjects) ? book.subjects.join(', ') : book.subjects || '',
      language: book.languages?.[0] || book.language || 'en',
      status: book.status || 'published',
    })
    setToast({ type: 'success', message: 'Book loaded into the editor.' })
  }

  function jumpPage(page, nextTopic) {
    if (nextTopic) setTopic(nextTopic)
    navigateTo(page)
  }

  if (!authReady) return <main className="loading-page">Checking your Firebase session...</main>

  if (activePage === 'auth') {
    return (
      <>
        <AuthPage
          authForm={authForm}
          authError={authError}
          authErrorField={authErrorField}
          authLoading={authLoading}
          authMode={authMode}
          handleAuth={handleAuth}
          onForgotPassword={handleForgotPassword}
          onGuest={goGuest}
          setAuthForm={setAuthForm}
          setAuthMode={updateAuthMode}
        />
        {toast && <AppToast message={toast.message} onClose={() => setToast(null)} type={toast.type} />}
        {banNotice && <BanNoticeModal message={banNotice} onClose={() => setBanNotice(null)} />}
      </>
    )
  }

  const visibleProgress = account.role === 'guest' ? {} : progress

  const pages = {
    home: (
      <HomePage
        books={allBooks}
        favorites={favorites}
        onDetail={openDetail}
        onFavorite={toggleFavorite}
        onRead={openBook}
        setPage={jumpPage}
        topics={topics}
        viewCounts={viewCounts}
        viewerCounts={getViewerCounts(bookReaders)}
        progress={visibleProgress}
      />
    ),
    discover: (
      <DiscoverPage
        books={filteredBooks}
        favorites={favorites}
        onDetail={openDetail}
        onFavorite={toggleFavorite}
        onRead={openBook}
        query={query}
        searchableBooks={allBooks}
        searchHistory={searchHistory}
        onSearchSubmit={handleSearchSubmit}
        setTopic={setTopic}
        topic={topic}
        topics={topics}
        viewCounts={viewCounts}
        viewerCounts={getViewerCounts(bookReaders)}
      />
    ),
    detail: (
      <BookDetailPage
        book={selectedBook}
        books={allBooks}
        checkpoints={checkpoints}
        account={account}
        comments={comments[selectedBook?.id] || []}
        favorites={favorites}
        onBack={() => navigateTo('discover')}
        onChapter={openChapter}
        onComment={addComment}
        onDetail={openDetail}
        onFavorite={toggleFavorite}
        onHome={() => navigateTo('home')}
        onAuth={goAuth}
        onRead={openBook}
        viewCount={selectedBook ? viewCounts[selectedBook.id] || 0 : 0}
        viewCounts={viewCounts}
        viewerCount={selectedBook ? bookReaders[selectedBook.id]?.length || 0 : 0}
        viewerCounts={getViewerCounts(bookReaders)}
      />
    ),
    reader: (
      <ReaderPage
        key={`${selectedBook?.id || 'empty-reader'}-${readerStartPage || 'checkpoint'}`}
        book={selectedBook}
        account={account}
        canPersistReaderState={account.role !== 'guest' && userDataReady}
        checkpoints={checkpoints}
        comments={comments[selectedBook?.id] || []}
        favorites={favorites}
        onBack={() => navigateTo('detail')}
        onComment={addComment}
        onDiscover={() => navigateTo('discover')}
        onFavorite={toggleFavorite}
        onHome={() => navigateTo('home')}
        onLoginRequired={goAuth}
        readerFontSize={readerFontSize}
        readerTheme={readerTheme}
        startPage={readerStartPage}
        setCheckpoints={setCheckpoints}
        setProgress={setProgress}
        setReaderFontSize={setReaderFontSize}
        setReaderTheme={setReaderTheme}
      />
    ),
    profile: account.role === 'guest' ? (
      <HomePage
        books={allBooks}
        favorites={favorites}
        onDetail={openDetail}
        onFavorite={toggleFavorite}
        onRead={openBook}
        setPage={jumpPage}
        topics={topics}
        viewCounts={viewCounts}
        viewerCounts={getViewerCounts(bookReaders)}
        progress={visibleProgress}
      />
    ) : (
      <ProfilePage
        account={account}
        books={allBooks}
        favorites={favorites}
        history={history}
        highlights={highlights}
        onDetail={openDetail}
        onFavorite={toggleFavorite}
        onProfileUpdate={updateAccountProfile}
        onRead={openBook}
        onChangePassword={changeAccountPassword}
        onToast={setToast}
        progress={progress}
        readingDays={readingActivity[getAccountKey(account)] || []}
        readerFontSize={readerFontSize}
        readerTheme={readerTheme}
        setReaderFontSize={setReaderFontSize}
        setReaderTheme={setReaderTheme}
        setWebsiteTheme={updateWebsiteTheme}
        viewCounts={viewCounts}
        viewerCounts={getViewerCounts(bookReaders)}
        websiteTheme={websiteTheme}
      />
    ),
    admin: hasAccess(account.role, 'employee') ? (
      <AdminPage
        account={account}
        addManagedBook={addManagedBook}
        adminBook={adminBook}
        books={allBooks}
        managedBooks={managedBooks}
        managedBooksError={managedBooksError}
        removeManagedBook={removeManagedBook}
        editManagedBook={editManagedBook}
        resetAdminBook={() => setAdminBook(emptyAdminBook)}
        setAdminBook={setAdminBook}
        staff={staff}
        users={staff}
        onBanUser={banUser}
        onUnbanUser={unbanUser}
        onRefreshStaff={refreshStaffDirectory}
      />
    ) : null,
  }

  const navigation = { activePage, isPageLoading: pageState.isPageLoading, navigateTo }

  return (
    <NavigationProvider value={navigation}>
      <AppShell account={account} managedBooks={managedBooks} notifications={notifications} onAuth={goAuth} onGuest={goGuest} onLogout={handleLogout} onMarkNotificationRead={markNotificationRead} setWebsiteTheme={setWebsiteTheme} staff={staff} websiteTheme={websiteTheme}>
        <Suspense fallback={<PageFallback />}>{pages[activePage] || pages.home}</Suspense>
        {toast && <AppToast message={toast.message} onClose={() => setToast(null)} type={toast.type} />}
        {banNotice && <BanNoticeModal message={banNotice} onClose={() => setBanNotice(null)} />}
      </AppShell>
    </NavigationProvider>
  )
}



function getAccountKey(account) {
  if (!account || account.role === 'guest') return 'guest'
  return account.id || account.email || 'user'
}

function getViewerCounts(bookReaders) {
  return Object.fromEntries(Object.entries(bookReaders).map(([bookId, readers]) => [bookId, readers.length]))
}

function mergeCommentMaps(...commentMaps) {
  return commentMaps.reduce((result, commentMap = {}) => {
    Object.entries(commentMap).forEach(([bookId, items]) => {
      if (!Array.isArray(items)) return

      const existingItems = result[bookId] || []
      const mergedItems = [...existingItems]
      const knownIds = new Set(existingItems.map((item) => item.id))

      items.forEach((item) => {
        if (!item?.id || knownIds.has(item.id)) return
        knownIds.add(item.id)
        mergedItems.push(item)
      })

      result[bookId] = mergedItems
    })

    return result
  }, {})
}

function applyFavoriteUpdates(favorites = [], updates = []) {
  return updates.reduce((result, update) => {
    if (!update?.bookId) return result

    const withoutBook = result.filter((id) => id !== update.bookId)
    return update.action === 'remove' ? withoutBook : [...withoutBook, update.bookId]
  }, favorites)
}

function getGuestCommentName(bookId, commentIndex) {
  const names = ['Anonymous Reader', 'Quiet Page-Turner', 'Midnight Visitor', 'Paper Trail Guest', 'Chapter Wanderer']
  const seed = String(bookId)
    .split('')
    .reduce((total, letter) => total + letter.charCodeAt(0), commentIndex)
  const index = Math.abs(seed) % names.length
  return names[index]
}

function validateAdminBook(adminBook, managedBooks = []) {
  const duplicateTitle = managedBooks.some((book) => (
    book.id !== adminBook.id && book.title?.trim().toLowerCase() === adminBook.title.trim().toLowerCase()
  ))

  return [
    !hasText(adminBook.title) && 'Add a title.',
    duplicateTitle && 'A managed book already uses this title.',
    !hasText(adminBook.author) && 'Add an author.',
    hasText(adminBook.cover) && !isValidImageSource(adminBook.cover) && 'Cover must be an http(s) image URL or an uploaded image.',
    hasText(adminBook.readerUrl) && !isValidHttpUrl(adminBook.readerUrl) && 'Reader URL must start with http:// or https://.',
  ].filter(Boolean)
}

function createAdminBookRecord(adminBook) {
  const cover = adminBook.cover.trim()
  const readerUrl = adminBook.readerUrl.trim()
  const subjects = adminBook.subjects
    .split(',')
    .map((subject) => subject.trim())
    .filter(Boolean)
  const language = adminBook.language.trim().toLowerCase()
  const author = adminBook.author.trim() || 'BookWorm editor'
  const category = adminBook.category.trim() || 'Admin pick'

  return {
    ...adminBook,
    title: adminBook.title.trim(),
    author,
    category,
    authors: [{ name: author }],
    bookshelves: [category],
    description: adminBook.description.trim(),
    subjects,
    languages: [language || 'en'],
    status: adminBook.status || 'draft',
    download_count: adminBook.download_count || 0,
    formats: {
      ...(cover ? { 'image/jpeg': cover } : {}),
      ...(readerUrl ? { [getReaderFormatKey(readerUrl)]: readerUrl } : {}),
    },
    // Fields the real backend (backend/controllers/bookController.js) actually
    // reads off req.body - it only picks these exact keys, so the Gutendex-shaped
    // fields above (cover/authors[]/formats) are cosmetic only and get
    // silently dropped by Mongo without these. Reader text is fetched live
    // from Gutenberg (see getBookReaderText), so chapters is always empty now.
    coverUrl: cover,
    readerUrl,
    chapters: [],
    sourceEtextNumber: adminBook.sourceEtextNumber || null,
  }
}

function getReaderFormatKey(readerUrl) {
  return /\.txt($|\?)/i.test(readerUrl) ? 'text/plain' : 'text/html'
}

function hasText(value) {
  return String(value || '').trim().length > 0
}

function isValidHttpUrl(value) {
  if (!hasText(value)) return true

  try {
    const url = new URL(String(value).trim())
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isValidImageSource(value) {
  if (!hasText(value)) return true
  const source = String(value).trim()
  return source.startsWith('data:image/') || isValidHttpUrl(source)
}

function getPageFromPath(pathname = '/') {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/'
  return PATH_PAGES[normalizedPath] || 'home'
}

function getAuthMessage(code) {
  const messages = {
    'auth/configuration-not-found': {
      field: 'email',
      message: 'Firebase Auth is not enabled. Turn on Email/Password in Firebase Console.',
    },
    'auth/email-already-in-use': { field: 'email', message: 'This email already has an account. Try logging in instead.' },
    'auth/invalid-credential': { field: 'password', message: 'Email or password is incorrect.' },
    'auth/invalid-email': { field: 'email', message: 'Please enter a valid email address.' },
    'auth/network-request-failed': { field: 'email', message: 'Network error. Please check your connection and try again.' },
    'auth/too-many-requests': { field: 'password', message: 'Too many attempts. Please wait a moment and try again.' },
    'auth/weak-password': { field: 'password', message: 'Password must be at least 6 characters.' },
  }

  return messages[code] || { field: 'password', message: 'Authentication failed. Please try again.' }
}

function PageFallback() {
  return (
    <div className="page-fallback">
      <img src={logo} alt="BookWorm logo" />
      <span>Loading page...</span>
    </div>
  )
}

// Parses the backend's "Your account has been banned until YYYY-MM-DD.
// Reason: ...." (or without the until-clause, for a permanent ban) into
// separate pieces for a cleaner popup, falling back to the raw message
// verbatim if the format ever changes.
function parseBanMessage(message) {
  const untilMatch = message.match(/banned until (\d{4}-\d{2}-\d{2})/i)
  const reasonMatch = message.match(/Reason: (.+?)\.?$/i)
  return {
    until: untilMatch?.[1] || '',
    reason: reasonMatch?.[1] || '',
    raw: message,
  }
}

function BanNoticeModal({ message, onClose }) {
  const { until, reason, raw } = parseBanMessage(message)

  return (
    <div className="ban-notice-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="ban-notice-title">
      <div className="ban-notice-modal">
        <i className="bi bi-shield-exclamation" />
        <h2 id="ban-notice-title">Your account has been banned</h2>
        {reason ? (
          <>
            <p><strong>Reason:</strong> {reason}</p>
            {until ? <p><strong>Banned until:</strong> {until}</p> : <p><strong>Duration:</strong> Permanent</p>}
          </>
        ) : (
          <p>{raw}</p>
        )}
        <p className="ban-notice-help">If you believe this is a mistake, please contact a BookWorm manager or admin.</p>
        <button className="primary-button" onClick={onClose} type="button">
          <i className="bi bi-check-lg" />
          I understand
        </button>
      </div>
    </div>
  )
}

function AppToast({ message, onClose, type }) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 3200)
    return () => window.clearTimeout(timer)
  }, [onClose])

  return (
    <div className={`app-toast ${type}`} role="status">
      <span>
        <i className={`bi ${type === 'success' ? 'bi-check-circle' : 'bi-exclamation-circle'}`} />
      </span>
      <p>{message}</p>
      <button aria-label="Close notification" onClick={onClose} type="button">
        <i className="bi bi-x-lg" />
      </button>
    </div>
  )
}

export default App
