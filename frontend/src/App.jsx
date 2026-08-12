import { lazy, Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth'
import AuthPage from './components/auth/AuthPage'
import AppShell from './components/layout/AppShell'
import { apiFetch, publicApiFetch } from './utils/apiClient'
import {
  fallbackBooks,
  hasAccess,
  mergeBookCatalogs,
  normalizeRole,
} from './data/bookData'
import { NavigationProvider } from './context/NavigationContext'
import { auth } from './firebase'
import { getAuthor, getCategory, getReaderUrl } from './utils/bookUtils'
import { buildRentalRecord, formatDeliveryDate, formatRentalExpiry, getRentalStatus } from './utils/rentalUtils'
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
const RentRequestPage = lazy(() => import('./components/pages/RentRequestPage'))

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
  pageCount: '',
  chapterCount: '',
  chapterTitles: '',
  readerText: '',
  chapterText: '',
  chaptersDraft: [{ title: 'Chapter 1', pages: '10', content: '' }],
  access: 'read',
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
  const [pageState, dispatchPage] = useReducer(pageReducer, pageInitialState)
  const routeTimerRef = useRef(null)
  const [books, setBooks] = useState(fallbackBooks)
  const [, setBooksLoading] = useState(false)
  const [managedBooks, setManagedBooks] = useState([])
  const [managedBooksError, setManagedBooksError] = useState('')
  const [rentals, setRentals] = useState(() => {
    if (typeof window === 'undefined') return []

    if (account.role === 'guest') return []

    const storageKey = `bookworm-rentals:${account.id || account.email || 'user'}`

    try {
      const storedValue = window.localStorage.getItem(storageKey)
      if (!storedValue) return []

      const parsed = JSON.parse(storedValue)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })
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
  const [staff, setStaff] = useState(globalDataDefaults.staff)
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
  const [knownUsers, setKnownUsers] = useState(globalDataDefaults.knownUsers)
  const [rentalRequests, setRentalRequests] = useState(globalDataDefaults.rentalRequests)
  const [notifications, setNotifications] = useState(globalDataDefaults.notifications)
  const [globalDataReady, setGlobalDataReady] = useState(false)
  const [userDataReady, setUserDataReady] = useState(false)
  const accountSettingsRef = useRef(accountSettings)
  const knownUsersRef = useRef(knownUsers)
  const globalDataSnapshotRef = useRef('')
  const userDataSnapshotRef = useRef('')
  const pendingFavoriteUpdatesRef = useRef([])
  const syncErrorRef = useRef('')
  const migratedLegacyCommentsRef = useRef(false)
  const activePage = pageState.activePage

  // Role is resolved from the backend (verified Firebase ID token -> role
  // stored in MongoDB), never from the Firestore `staff` array directly -
  // that array is only readable/writable by the backend now, but the app
  // still shouldn't trust client-visible data for something as sensitive as
  // "is this person an admin". Any failure to reach the backend defaults to
  // 'customer' (fail closed): worse case an admin briefly can't reach
  // /admin, never the other way around.
  const resolveTrustedRole = useCallback(async () => {
    try {
      const data = await apiFetch('/api/users/me')
      return normalizeRole(data.user?.role) || 'customer'
    } catch (error) {
      console.warn('Could not verify account role from server, defaulting to customer:', error.message)
      return 'customer'
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

  useEffect(() => {
    knownUsersRef.current = knownUsers
  }, [knownUsers])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const nextRentals = account.role === 'guest' ? [] : readStoredRentals(account)
    queueMicrotask(() => {
      setRentals(nextRentals)
    })
  }, [account])

  useEffect(() => {
    if (typeof window === 'undefined') return

    if (account.role === 'guest') {
      const guestKey = 'bookworm-rentals:guest'
      window.localStorage.removeItem(guestKey)
      return
    }

    const storageKey = `bookworm-rentals:${account.id || account.email || 'user'}`
    window.localStorage.setItem(storageKey, JSON.stringify(rentals))
  }, [account.email, account.id, account.role, rentals])

  useEffect(() => {
    return subscribeGlobalData(
      (data) => {
        const nextData = {
          viewCounts: data.viewCounts || {},
          bookReaders: data.bookReaders || {},
          staff: data.staff || [],
          knownUsers: data.knownUsers || [],
          rentalRequests: data.rentalRequests || [],
          notifications: data.notifications || [],
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
        setStaff(nextData.staff)
        setKnownUsers(nextData.knownUsers)
        setRentalRequests(nextData.rentalRequests)
        setNotifications(nextData.notifications)
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
      const lockedRecord = knownUsersRef.current.find((item) => item.email === email)
      if (lockedRecord?.locked) {
        await signOut(auth)
        setToast({ type: 'error', message: 'This account has been locked. Contact a manager or admin.' })
        setAuthReady(true)
        return
      }

      const savedSettings = accountSettingsRef.current[user.uid] || accountSettingsRef.current[email] || {}
      if (savedSettings.websiteTheme) setWebsiteTheme(savedSettings.websiteTheme)
      const trustedRole = await resolveTrustedRole()
      const nextAccount = {
        id: user.uid,
        name: savedSettings.displayName || user.displayName || email.split('@')[0] || 'Reader',
        email,
        avatar: savedSettings.avatar || user.photoURL || '',
        role: trustedRole,
      }

      setAccount(nextAccount)
      setKnownUsers((current) => upsertUser(current, nextAccount))
      const canAccessAdmin = hasAccess(nextAccount.role, 'employee')

      if (currentRoute === 'auth') {
        navigateTo(canAccessAdmin ? 'admin' : 'home', { instant: true, replace: true })
      } else if (currentRoute === 'admin' && !canAccessAdmin) {
        navigateTo('home', { instant: true, replace: true })
      }
      setAuthReady(true)
    })

    return unsubscribe
  }, [navigateTo, resolveTrustedRole])

  useEffect(() => {
    if (account.role === 'guest' || !account.email) return

    let isCurrent = true
    resolveTrustedRole().then((nextRole) => {
      if (!isCurrent || nextRole === account.role) return
      setAccount((current) => ({ ...current, role: nextRole }))
    })

    return () => {
      isCurrent = false
    }
  }, [account.email, account.role, resolveTrustedRole])

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
    if (account.role === 'guest' || !account.email) return
    const lockedRecord = knownUsers.find((item) => item.email === account.email)
    if (!lockedRecord?.locked) return

    signOut(auth)
    queueMicrotask(() => {
      setToast({ type: 'error', message: 'This account has been locked. Contact a manager or admin.' })
    })
  }, [account.email, account.role, knownUsers])

  useEffect(() => {
    if (!globalDataReady || account.role === 'guest') return
    queueMicrotask(() => {
      setKnownUsers((current) => upsertUser(current, account))
    })
  }, [account, globalDataReady])

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
          setBooks(mergeBookCatalogs(combinedBooks, fallbackBooks))
        }
      } catch {
        if (!ignore) setBooks(fallbackBooks)
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
      staff,
      knownUsers,
      rentalRequests,
      notifications,
    }
    const nextSnapshot = stableStringify(nextGlobalData)
    if (nextSnapshot === globalDataSnapshotRef.current) return

    globalDataSnapshotRef.current = nextSnapshot
    saveGlobalData(nextGlobalData).catch((error) => handleDataSyncError(error, 'save-global-data'))
  }, [bookReaders, globalDataReady, handleDataSyncError, knownUsers, notifications, rentalRequests, staff, viewCounts])

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
    setKnownUsers((current) => upsertUser(current, { ...account, avatar, name: trimmedName }))
    setToast({ type: 'success', message: 'Account profile updated.' })
  }

  async function resetAccountPassword() {
    if (!account.email) return
    await sendPasswordResetEmail(auth, account.email)
    setToast({ type: 'success', message: `Password reset email sent to ${account.email}.` })
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

  function toggleRental(book) {
    if (!book?.id) return

    if (account.role === 'guest') {
      setToast({ type: 'error', message: 'Create an account to rent books and unlock reading access.' })
      navigateTo('auth')
      return
    }

    const existingRental = rentals.find((item) => item.id === book.id)
    if (existingRental && getRentalStatus(existingRental) === 'active') {
      setRentals((current) => current.filter((item) => item.id !== book.id))
      setToast({ type: 'success', message: `${book.title} rental removed from your shelf.` })
      return
    }

    const nextRental = buildRentalRecord(book)
    setRentals((current) => [nextRental, ...current.filter((item) => item.id !== book.id)])
    setToast({ type: 'success', message: `${book.title} is now rented for reading. ${formatRentalExpiry(nextRental)}` })
  }

  function submitRentalRequest(book, details = {}) {
    if (!book?.id) return

    if (account.role === 'guest') {
      setToast({ type: 'error', message: 'Login to request a rental.' })
      navigateTo('auth')
      return
    }

    const alreadyPending = rentalRequests.some((item) => (
      item.bookId === book.id && item.customerEmail === account.email && item.status === 'pending'
    ))
    if (alreadyPending) {
      setToast({ type: 'error', message: `You already have a pending order for ${book.title}.` })
      return
    }

    const nextRequest = {
      id: `request-${Date.now()}`,
      bookId: book.id,
      bookTitle: book.title,
      customerEmail: account.email,
      customerName: account.name || account.email,
      recipientName: (details.recipientName || account.name || '').trim(),
      phone: (details.phone || '').trim(),
      address: (details.address || '').trim(),
      paymentMethod: details.paymentMethod || 'cod',
      note: (details.note || '').trim(),
      status: 'pending',
      requestedAt: new Date().toISOString(),
      deliveryAt: null,
      decidedAt: null,
      decidedBy: null,
    }
    setRentalRequests((current) => [nextRequest, ...current])
    setToast({ type: 'success', message: `Order placed for ${book.title}. A manager will confirm the delivery date.` })
    syncRentalToMongo(nextRequest)
  }

  async function syncRentalToMongo(request) {
    try {
      const data = await apiFetch('/api/rentals', {
        method: 'POST',
        body: {
          bookId: request.bookId,
          bookTitle: request.bookTitle,
          recipientName: request.recipientName,
          phone: request.phone,
          address: request.address,
          note: request.note,
        },
      })
      setRentalRequests((current) => current.map((item) => (
        item.id === request.id ? { ...item, mongoRentalId: data.rental.id } : item
      )))
    } catch (error) {
      // Firestore already has the order (that's what the live UI reads), so
      // a Mongo sync failure here is non-fatal - just log it quietly.
      console.warn('Could not sync rental to MongoDB:', error.message)
    }
  }

  async function decideRentalRequest(requestId, { status, deliveryAt = null, responseNote = '' }) {
    const request = rentalRequests.find((item) => item.id === requestId)
    if (!request) return

    // The backend route (admin/manager only, enforced server-side) is the
    // real authorization check now - it must succeed before we show the
    // decision as final. If this specific order never made it into MongoDB
    // (e.g. the backend was briefly unreachable when it was placed), we
    // refuse rather than silently approve/decline with no server check at
    // all.
    if (!request.mongoRentalId) {
      setToast({ type: 'error', message: 'This order has no matching MongoDB record, so it cannot be approved/declined safely. Ask an admin to check the backend logs.' })
      return
    }

    try {
      const path = status === 'approved' ? `/api/rentals/${request.mongoRentalId}/approve` : `/api/rentals/${request.mongoRentalId}/decline`
      const body = status === 'approved' ? { deliveryAt } : undefined
      await apiFetch(path, { method: 'PATCH', body })
    } catch (error) {
      setToast({ type: 'error', message: error.message })
      return
    }

    setRentalRequests((current) => current.map((item) => (
      item.id === requestId
        ? { ...item, status, deliveryAt, decidedAt: new Date().toISOString(), decidedBy: account.email }
        : item
    )))

    const message = status === 'approved'
      ? `Your order for "${request.bookTitle}" was approved. Expected delivery: ${deliveryAt ? formatDeliveryDate(deliveryAt) : 'to be confirmed'}. Pay cash on delivery.${responseNote ? ` Note: ${responseNote}` : ''}`
      : `Your order for "${request.bookTitle}" was declined.${responseNote ? ` Reason: ${responseNote}` : ''}`

    setNotifications((current) => [
      {
        id: `notification-${Date.now()}`,
        targetEmail: request.customerEmail,
        type: status === 'approved' ? 'rental-approved' : 'rental-declined',
        message,
        bookTitle: request.bookTitle,
        deliveryAt,
        createdAt: new Date().toISOString(),
        read: false,
      },
      ...current,
    ])
  }

  function markNotificationRead(notificationId) {
    setNotifications((current) => current.map((item) => (
      item.id === notificationId ? { ...item, read: true } : item
    )))
  }

  function toggleUserLock(email) {
    setKnownUsers((current) => current.map((item) => (
      item.email === email ? { ...item, locked: !item.locked } : item
    )))
  }

  async function addManagedBook(event) {
    event.preventDefault()
    const validationErrors = validateAdminBook(adminBook, managedBooks)
    if (validationErrors.length) {
      setToast({ type: 'error', message: validationErrors.slice(0, 2).join(' ') })
      return
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
    } catch (error) {
      setManagedBooksError(error.message)
      setToast({ type: 'error', message: error.message })
    }
  }

  async function removeManagedBook(id) {
    try {
      await apiFetch(`/api/books/${id}`, { method: 'DELETE' })
      setManagedBooks((current) => current.filter((book) => book.id !== id))
    } catch (error) {
      setToast({ type: 'error', message: error.message })
    }
  }

  function editManagedBook(book) {
    setAdminBook({
      ...emptyAdminBook,
      ...book,
      author: getAuthor(book),
      category: getCategory(book),
      cover: book.formats?.['image/jpeg'] || book.cover || '',
      readerUrl: getReaderUrl(book),
      subjects: Array.isArray(book.subjects) ? book.subjects.join(', ') : book.subjects || '',
      language: book.languages?.[0] || book.language || 'en',
      status: book.status || 'published',
      chapterTitles: Array.isArray(book.chapterList) ? book.chapterList.map((chapter) => chapter.title).join('\n') : book.chapterTitles || '',
      chapterText: Array.isArray(book.chapterList) ? book.chapterList.map((chapter) => chapter.content).filter(Boolean).join('\n--- chapter ---\n') : book.chapterText || '',
      chaptersDraft: getEditableChapters(book),
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
        onRent={toggleRental}
        rentals={rentals}
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
        onRent={toggleRental}
        rentals={rentals}
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
        onRent={toggleRental}
        rentals={rentals}
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
        onRent={toggleRental}
        rentals={rentals}
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
        onRent={toggleRental}
        onResetPassword={resetAccountPassword}
        rentals={rentals}
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
    requests: account.role === 'guest' ? (
      <div className="section-block guest-prompt">
        <p className="mono-eyebrow">Rental requests</p>
        <h2>Login to request a rental</h2>
        <p>Create an account or log in to send a rental request and track its status.</p>
        <button className="primary-button" onClick={() => navigateTo('auth')} type="button">
          <i className="bi bi-box-arrow-in-right" />
          Go to login
        </button>
      </div>
    ) : (
      <RentRequestPage
        account={account}
        books={allBooks}
        notifications={notifications}
        onMarkNotificationRead={markNotificationRead}
        onSubmitRequest={submitRentalRequest}
        rentalRequests={rentalRequests}
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
        users={knownUsers}
        onToggleUserLock={toggleUserLock}
        onDecideRentalRequest={decideRentalRequest}
        rentalRequests={rentalRequests}
      />
    ) : null,
  }

  const navigation = { activePage, isPageLoading: pageState.isPageLoading, navigateTo }

  return (
    <NavigationProvider value={navigation}>
      <AppShell account={account} managedBooks={managedBooks} notifications={notifications} onAuth={goAuth} onGuest={goGuest} onLogout={handleLogout} onOpenRequests={() => navigateTo('requests')} rentalRequests={rentalRequests} setWebsiteTheme={setWebsiteTheme} staff={staff} websiteTheme={websiteTheme}>
        <Suspense fallback={<PageFallback />}>{pages[activePage] || pages.home}</Suspense>
        {toast && <AppToast message={toast.message} onClose={() => setToast(null)} type={toast.type} />}
      </AppShell>
    </NavigationProvider>
  )
}

function upsertUser(users, user) {
  const existing = users.find((item) => item.email === user.email)
  const stored = { email: user.email, name: user.name, role: user.role, locked: existing?.locked || false }
  if (existing && existing.name === stored.name && existing.role === stored.role && existing.locked === stored.locked) return users

  return [stored, ...users.filter((item) => item.email !== user.email)]
}

function getAccountKey(account) {
  if (!account || account.role === 'guest') return 'guest'
  return account.id || account.email || 'user'
}

function readStoredRentals(account) {
  if (!account || account.role === 'guest') return []

  const storageKey = `bookworm-rentals:${account.id || account.email || 'user'}`

  try {
    const storedValue = window.localStorage.getItem(storageKey)
    if (!storedValue) return []

    const parsed = JSON.parse(storedValue)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
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

function getPositiveInteger(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : null
}

function validateAdminBook(adminBook, managedBooks = []) {
  const duplicateTitle = managedBooks.some((book) => (
    book.id !== adminBook.id && book.title?.trim().toLowerCase() === adminBook.title.trim().toLowerCase()
  ))

  return [
    !hasText(adminBook.title) && 'Add a title.',
    duplicateTitle && 'A managed book already uses this title.',
    !hasText(adminBook.author) && 'Add an author.',
    !hasText(adminBook.category) && 'Choose a category.',
    !hasText(adminBook.cover) && 'Add a cover image.',
    !isValidImageSource(adminBook.cover) && 'Cover must be an http(s) image URL or an uploaded image.',
    !hasText(adminBook.description) && 'Add a description.',
    !hasAdminReaderSource(adminBook) && 'Add a reader URL, reader text, or chapter content.',
    hasText(adminBook.readerUrl) && !isValidHttpUrl(adminBook.readerUrl) && 'Reader URL must start with http:// or https://.',
    !hasValidAdminChapter(adminBook) && 'Add at least one chapter with a title and page count above 0.',
  ].filter(Boolean)
}

function createAdminBookRecord(adminBook) {
  const cover = adminBook.cover.trim()
  const readerText = adminBook.readerText.trim()
  const chapterText = adminBook.chapterText.trim()
  const readerUrl = adminBook.readerUrl.trim()
  const explicitChapters = normalizeAdminDraftChapters(adminBook.chaptersDraft)
  const fallbackPageCount = getPositiveInteger(adminBook.pageCount)
  const fallbackChapterCount = getPositiveInteger(adminBook.chapterCount)
  const chapterList = explicitChapters.length
    ? explicitChapters
    : createAdminChapters(adminBook.chapterTitles, chapterText, fallbackPageCount, fallbackChapterCount)
  const pageCount = chapterList.reduce((total, chapter) => total + chapter.pages, 0) || fallbackPageCount
  const chapterCount = chapterList.length || fallbackChapterCount
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
    access: adminBook.access === 'rent' ? 'rent' : 'read',
    author,
    category,
    authors: [{ name: author }],
    bookshelves: [category],
    description: adminBook.description.trim(),
    subjects,
    languages: [language || 'en'],
    status: adminBook.status || 'draft',
    ...(pageCount ? { pageCount } : {}),
    ...(chapterCount ? { chapterCount } : {}),
    ...(chapterList.length ? { chapterList } : {}),
    ...(readerText ? { readerText } : {}),
    download_count: adminBook.download_count || 0,
    formats: {
      ...(cover ? { 'image/jpeg': cover } : {}),
      ...(readerUrl ? { [getReaderFormatKey(readerUrl)]: readerUrl } : {}),
    },
  }
}

function createAdminChapters(titleSource, contentSource, pageCount, chapterCount) {
  const titles = titleSource
    .split('\n')
    .map((title) => title.trim())
    .filter(Boolean)
  const contentBlocks = contentSource
    .split(/\n-{3,}\s*(?:chapter)?\s*-{0,}\n/i)
    .map((content) => content.trim())
    .filter(Boolean)
  const totalChapters = Math.max(titles.length, contentBlocks.length, chapterCount || 0)

  if (!totalChapters) return []

  const safePageCount = pageCount || totalChapters
  const basePages = Math.max(1, Math.floor(safePageCount / totalChapters))
  const extraPages = safePageCount % totalChapters
  let startPage = 1

  return Array.from({ length: totalChapters }, (_, index) => {
    const pages = basePages + (index < extraPages ? 1 : 0)
    const chapter = {
      number: index + 1,
      title: titles[index] || `Chapter ${index + 1}`,
      startPage,
      pages,
      content: contentBlocks[index] || '',
    }

    startPage += pages
    return chapter
  })
}

function normalizeAdminDraftChapters(chapters = []) {
  let startPage = 1

  return chapters
    .map((chapter, index) => {
      const title = String(chapter.title || '').trim()
      const content = String(chapter.content || '').trim()
      const pages = getPositiveInteger(chapter.pages) || 1

      if (!title && !content) return null

      const nextChapter = {
        number: index + 1,
        title: title || `Chapter ${index + 1}`,
        startPage,
        pages,
        content,
      }

      startPage += pages
      return nextChapter
    })
    .filter(Boolean)
}

function getEditableChapters(book) {
  if (Array.isArray(book.chapterList) && book.chapterList.length) {
    return book.chapterList.map((chapter, index) => ({
      title: chapter.title || `Chapter ${index + 1}`,
      pages: String(chapter.pages || 1),
      content: chapter.content || '',
    }))
  }

  const count = getPositiveInteger(book.chapterCount) || 1
  return Array.from({ length: count }, (_, index) => ({
    title: `Chapter ${index + 1}`,
    pages: String(Math.max(1, Math.floor((getPositiveInteger(book.pageCount) || count) / count))),
    content: '',
  }))
}

function getReaderFormatKey(readerUrl) {
  return /\.txt($|\?)/i.test(readerUrl) ? 'text/plain' : 'text/html'
}

function hasText(value) {
  return String(value || '').trim().length > 0
}

function hasAdminReaderSource(book) {
  return Boolean(hasText(book.readerUrl) || hasText(book.readerText) || book.chaptersDraft?.some((chapter) => hasText(chapter.content)))
}

function hasValidAdminChapter(book) {
  return Boolean(book.chaptersDraft?.some((chapter) => hasText(chapter.title) && Number(chapter.pages) > 0))
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
