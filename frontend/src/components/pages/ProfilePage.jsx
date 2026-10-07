import { useEffect, useMemo, useState } from 'react'
import { getAuthor, getCover, getInitials } from '../../utils/bookUtils'
import { maskEmail } from '../../utils/maskEmail'
import PreferencesModal from '../content/PreferencesModal'
import { normalizeRole } from '../../data/bookData'
import { apiFetch, publicApiFetch } from '../../utils/apiClient'

const AVATAR_MAX_SIZE = 2 * 1024 * 1024
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const DISPLAY_NAME_MAX = 32
const DISPLAY_NAME_MIN = 2
const DISPLAY_NAME_PATTERN = /^[\p{L}\p{N} ._'-]+$/u

function ProfilePage({
  account,
  books = [],
  favorites = [],
  history = [],
  shelf = [],
  onChangePassword,
  onDetail,
  onFavorite,
  onNavigate,
  onProfileUpdate,
  onRead,
  onToast,
  onUpdateShelfStatus,
  onRemoveShelfBook,
  progress = {},
  readingDays = [],
  readerFontSize,
  readerTheme,
  setReaderFontSize,
  setReaderTheme,
  setWebsiteTheme,
  websiteTheme,
}) {
  const [showPreferences, setShowPreferences] = useState(false)
  const isGuest = normalizeRole(account?.role) === 'guest'

  return (
    <div className="profile-page settings-only-page">
      {!isGuest && (
        <section className="section-block">
          <div className="section-heading">
            <div>
              <p className="mono-eyebrow">For You</p>
              <h2>Reading preferences</h2>
            </div>
            <button className="ghost-button" onClick={() => setShowPreferences(true)} type="button">
              <i className="bi bi-sliders" />
              <span>Update preferences</span>
            </button>
          </div>
        </section>
      )}
      {showPreferences && <PreferencesModal onClose={() => setShowPreferences(false)} />}

      <ProfileSettings
        key={account?.id || account?.email || 'guest'}
        account={account}
        books={books}
        favorites={favorites}
        history={history}
        readingDays={readingDays}
        shelf={shelf}
        onChangePassword={onChangePassword}
        onDetail={onDetail}
        onFavorite={onFavorite}
        onNavigate={onNavigate}
        onProfileUpdate={onProfileUpdate}
        onRead={onRead}
        onToast={onToast}
        onUpdateShelfStatus={onUpdateShelfStatus}
        onRemoveShelfBook={onRemoveShelfBook}
        progress={progress}
        readerFontSize={readerFontSize}
        readerTheme={readerTheme}
        setReaderFontSize={setReaderFontSize}
        setReaderTheme={setReaderTheme}
        setWebsiteTheme={setWebsiteTheme}
        websiteTheme={websiteTheme}
      />
    </div>
  )
}

function ProfileSettings({
  account,
  books = [],
  favorites = [],
  history = [],
  shelf = [],
  readingDays = [],
  onChangePassword,
  onDetail,
  onFavorite,
  onNavigate,
  onProfileUpdate,
  onRead,
  onToast,
  onUpdateShelfStatus,
  onRemoveShelfBook,
  progress = {},
  readerFontSize,
  readerTheme,
  setReaderFontSize,
  setReaderTheme,
  setWebsiteTheme,
  websiteTheme,
}) {
  const [avatarPreview, setAvatarPreview] = useState(account?.avatar || '')
  const [displayName, setDisplayName] = useState(account?.name || 'Reader')
  const [settingsError, setSettingsError] = useState('')
  const [settingsSuccess, setSettingsSuccess] = useState('')
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [localShelf, setLocalShelf] = useState(shelf)
  const [activeShelfTab, setActiveShelfTab] = useState('reading')
  const [fetchedShelfBooks, setFetchedShelfBooks] = useState({})
  const [mongoProgress, setMongoProgress] = useState({})
  const [myBooks, setMyBooks] = useState([])
  const [myBooksLoading, setMyBooksLoading] = useState(false)

  const accountKey = account?.id || account?.email || 'guest'
  const goalStorageKey = `bookworm_reading_goal_${accountKey}`
  const [readingGoal, setReadingGoal] = useState(() => {
    try {
      const saved = localStorage.getItem(goalStorageKey)
      return saved ? Math.max(1, parseInt(saved, 10) || 10) : 10
    } catch {
      return 10
    }
  })
  const [isEditingGoal, setIsEditingGoal] = useState(false)
  const [goalInput, setGoalInput] = useState(readingGoal)

  useEffect(() => {
    if (!account || account.role === 'guest') return
    let ignore = false
    apiFetch('/api/users/me/progress')
      .then((data) => {
        if (!ignore && Array.isArray(data?.progress)) {
          const map = {}
          data.progress.forEach((item) => {
            if (item.contentId) {
              map[item.contentId] = Number(item.percent) || 0
            }
          })
          setMongoProgress(map)
        }
      })
      .catch(() => {})
    return () => {
      ignore = true
    }
  }, [account])

  useEffect(() => {
    if (!account || account.role === 'guest') return
    let ignore = false
    setMyBooksLoading(true)
    apiFetch('/api/books/mine?limit=50')
      .then((data) => {
        if (!ignore && Array.isArray(data?.books)) {
          setMyBooks(data.books)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!ignore) setMyBooksLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [account])

  const effectiveProgress = useMemo(() => {
    return { ...progress, ...mongoProgress }
  }, [progress, mongoProgress])

  useEffect(() => {
    setLocalShelf(shelf)
  }, [shelf])

  useEffect(() => {
    if (!account || account.role === 'guest') return
    let ignore = false
    apiFetch('/api/users/me/shelf')
      .then((data) => {
        if (!ignore && Array.isArray(data?.shelf)) {
          setLocalShelf(data.shelf)
        }
      })
      .catch(() => {})
    return () => {
      ignore = true
    }
  }, [account])

  useEffect(() => {
    const missingIds = (localShelf || [])
      .map((item) => String(item.bookId))
      .filter((id) => id && !books.some((b) => String(b.id || b._id) === id) && !fetchedShelfBooks[id])
    if (!missingIds.length) return

    missingIds.forEach((id) => {
      publicApiFetch(`/api/books/${id}`)
        .then((res) => {
          if (res?.book) {
            setFetchedShelfBooks((prev) => ({ ...prev, [id]: res.book }))
          } else {
            publicApiFetch(`/api/content/${id}`)
              .then((cRes) => {
                if (cRes) setFetchedShelfBooks((prev) => ({ ...prev, [id]: cRes }))
              })
              .catch(() => {})
          }
        })
        .catch(() => {
          publicApiFetch(`/api/content/${id}`)
            .then((cRes) => {
              if (cRes) setFetchedShelfBooks((prev) => ({ ...prev, [id]: cRes }))
            })
            .catch(() => {})
        })
    })
  }, [localShelf, books, fetchedShelfBooks])

  const resolvedShelfBooks = useMemo(() => {
    const list = []
    const seen = new Set()

    ;(localShelf || []).forEach((item) => {
      const bId = String(item.bookId)
      if (seen.has(bId)) return
      seen.add(bId)
      const found = books.find((b) => String(b.id || b._id) === bId) || fetchedShelfBooks[bId] || { id: bId, _id: bId, title: 'Book #' + bId }
      list.push({ book: found, status: item.status, updatedAt: item.updatedAt })
    })

    ;(favorites || []).forEach((favId) => {
      const bId = String(favId)
      if (seen.has(bId)) return
      seen.add(bId)
      const found = books.find((b) => String(b.id || b._id) === bId) || fetchedShelfBooks[bId] || { id: bId, _id: bId, title: 'Book #' + bId }
      list.push({ book: found, status: 'want_to_read' })
    })

    return list
  }, [localShelf, favorites, books, fetchedShelfBooks])

  const readingList = useMemo(() => {
    return resolvedShelfBooks.filter((item) => {
      if (item.status === 'reading') return true
      const bId = item.book.id || item.book._id
      const p = effectiveProgress[bId] || 0
      return p > 0 && p < 100 && item.status !== 'finished'
    })
  }, [resolvedShelfBooks, effectiveProgress])

  const wantToReadList = useMemo(() => {
    return resolvedShelfBooks.filter((item) => {
      if (item.status === 'want_to_read') {
        const bId = item.book.id || item.book._id
        const p = effectiveProgress[bId] || 0
        return p === 0 || !p
      }
      return false
    })
  }, [resolvedShelfBooks, effectiveProgress])

  const finishedList = useMemo(() => {
    return resolvedShelfBooks.filter((item) => {
      if (item.status === 'finished') return true
      const bId = item.book.id || item.book._id
      return (effectiveProgress[bId] || 0) >= 100
    })
  }, [resolvedShelfBooks, effectiveProgress])

  const safeName = displayName || account?.name || 'Reader'
  const safeEmail = account?.email || 'No email linked yet'
  const safeMaskedEmail = safeEmail === 'No email linked yet' ? safeEmail : maskEmail(safeEmail)
  const safeAvatar = avatarPreview || account?.avatar || ''

  const role = normalizeRole(account?.role)
  const roleLabel = role === 'admin' ? 'Admin' : role === 'guest' ? 'Guest' : 'Member'

  const readerRank = useMemo(() => {
    const finishedCount = finishedList.length
    if (finishedCount >= 15) {
      return { title: 'Độc giả Uyên bác', icon: 'bi-mortarboard-fill', level: 'Level 4' }
    }
    if (finishedCount >= 5) {
      return { title: 'Mọt sách Chăm chỉ', icon: 'bi-award-fill', level: 'Level 3' }
    }
    if (finishedCount >= 1) {
      return { title: 'Bạn đọc Tích cực', icon: 'bi-bookmark-star-fill', level: 'Level 2' }
    }
    return { title: 'Khám phá viên Mới', icon: 'bi-compass-fill', level: 'Level 1' }
  }, [finishedList.length])

  const readingStreak = useMemo(() => {
    if (!Array.isArray(readingDays) || readingDays.length === 0) return 0
    const uniqueDays = Array.from(new Set(readingDays)).sort().reverse()
    const todayStr = new Date().toISOString().slice(0, 10)
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

    const hasToday = uniqueDays.includes(todayStr)
    const hasYesterday = uniqueDays.includes(yesterday)
    if (!hasToday && !hasYesterday) return 0

    let streak = 0
    let cur = hasToday ? new Date() : new Date(Date.now() - 86400000)

    for (let i = 0; i < 90; i += 1) {
      const dStr = cur.toISOString().slice(0, 10)
      if (uniqueDays.includes(dStr)) {
        streak += 1
        cur.setDate(cur.getDate() - 1)
      } else {
        break
      }
    }
    return streak
  }, [readingDays])

  const resumeBookItem = useMemo(() => {
    if (Array.isArray(history) && history.length > 0) {
      for (const hId of history) {
        const match = resolvedShelfBooks.find(
          (item) => String(item.book?.id || item.book?._id) === String(hId)
        )
        if (match) {
          const bId = match.book?.id || match.book?._id
          const p = effectiveProgress[bId] || 0
          if (p > 0 && p < 100) return match
        }
      }
    }
    if (readingList.length > 0) return readingList[0]
    const anyProgress = resolvedShelfBooks.find((item) => {
      const bId = item.book?.id || item.book?._id
      const p = effectiveProgress[bId] || 0
      return p > 0 && p < 100
    })
    return anyProgress || null
  }, [history, resolvedShelfBooks, readingList, effectiveProgress])

  function handleSaveGoal(e) {
    e.preventDefault()
    const parsed = parseInt(goalInput, 10)
    if (parsed && parsed > 0 && parsed <= 500) {
      setReadingGoal(parsed)
      try {
        localStorage.setItem(goalStorageKey, String(parsed))
      } catch {}
      setIsEditingGoal(false)
      onToast?.({ type: 'success', message: `Đã cập nhật mục tiêu đọc ${parsed} cuốn sách.` })
    }
  }

  const goalPercentage = Math.min(100, Math.round((finishedList.length / (readingGoal || 1)) * 100))

  useEffect(() => {
    if (!settingsSuccess) return undefined
    const timer = window.setTimeout(() => setSettingsSuccess(''), 4000)
    return () => window.clearTimeout(timer)
  }, [settingsSuccess])

  useEffect(() => {
    if (!passwordSuccess) return undefined
    const timer = window.setTimeout(() => setPasswordSuccess(''), 4000)
    return () => window.clearTimeout(timer)
  }, [passwordSuccess])

  function handleAvatarChange(event) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!AVATAR_TYPES.includes(file.type)) {
      setSettingsError('Avatar must be a JPG, PNG, WEBP, or GIF image.')
      event.target.value = ''
      return
    }

    if (file.size > AVATAR_MAX_SIZE) {
      setSettingsError('Avatar image must be 2MB or smaller.')
      event.target.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setAvatarPreview(String(reader.result))
      setSettingsError('')
    }
    reader.readAsDataURL(file)
  }

  async function saveProfile(event) {
    event.preventDefault()
    const nameError = validateDisplayName(displayName)
    if (nameError) {
      setSettingsError(nameError)
      setSettingsSuccess('')
      return
    }

    const normalizedDisplayName = normalizeDisplayName(displayName)
    setSettingsLoading(true)
    setSettingsError('')
    setSettingsSuccess('')
    try {
      await onProfileUpdate({ avatar: safeAvatar, displayName: normalizedDisplayName })
      setDisplayName(normalizedDisplayName)
      setSettingsSuccess('Profile updated.')
      onToast?.({ type: 'success', message: 'Profile updated successfully.' })
    } catch {
      setSettingsError('Could not update your profile. Please try again.')
      onToast?.({ type: 'error', message: 'Could not update your profile. Please try again.' })
    } finally {
      setSettingsLoading(false)
    }
  }

  async function handleChangePassword(event) {
    event.preventDefault()
    setPasswordError('')
    setPasswordSuccess('')

    if (!oldPassword.trim()) {
      setPasswordError('Enter your current password.')
      return
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.')
      return
    }
    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setPasswordError('New password must include at least one letter and one number.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation don't match.")
      return
    }
    if (newPassword === oldPassword) {
      setPasswordError('New password must be different from your current password.')
      return
    }

    setPasswordLoading(true)
    try {
      await onChangePassword({ oldPassword, newPassword })
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordSuccess('Password changed. Check your inbox for the confirmation email.')
      onToast?.({ type: 'success', message: 'Password changed successfully.' })
    } catch (error) {
      const code = error?.code || ''
      let message = 'Could not change your password. Please try again.'
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials') {
        message = 'Current password is incorrect.'
      } else if (code === 'auth/too-many-requests') {
        message = 'Too many attempts. Please wait a bit and try again.'
      } else if (code === 'auth/weak-password') {
        message = 'New password is too weak - use at least 8 characters.'
      }
      setPasswordError(message)
      onToast?.({ type: 'error', message })
    } finally {
      setPasswordLoading(false)
    }
  }

  return (
    <section className="settings-panel profile-settings" role="tabpanel">
      <div className="settings-intro">
        <div>
          <p className="mono-eyebrow">My account</p>
          <h2>Account settings</h2>
          <p>Keep your profile, password, reading comfort, and site appearance in one place.</p>
        </div>
        <div className="settings-mini-profile">
          <span>{safeAvatar ? <img src={safeAvatar} alt="" /> : getInitials(safeName)}</span>
          <strong>{safeName}</strong>
        </div>
      </div>

      <div className="settings-layout">
        <div className="account-settings-card account-overview-card">
          <SettingsHeading icon="bi-person-badge" kicker="Tài khoản" title="Hồ sơ thành viên" />
          <div className="account-overview">
            <div className="account-overview-main">
              <div className="account-overview-name">
                <strong>{safeName}</strong>
                <p>{safeMaskedEmail}</p>
              </div>
              <span className={`account-role-pill role-${role || 'member'}`}>
                <i className={role === 'admin' ? 'bi bi-shield-lock-fill' : 'bi bi-person-check-fill'} />
                <span>{roleLabel}</span>
              </span>
            </div>
            <div className="account-overview-meta">
              <div>
                <span>Email</span>
                <strong>{safeMaskedEmail}</strong>
              </div>
              <div>
                <span>Vai trò</span>
                <strong>{roleLabel}</strong>
              </div>
              <div>
                <span>Mã thành viên</span>
                <strong>{account?.displayId || '—'}</strong>
              </div>
              <div>
                <span>Hạng bạn đọc</span>
                <strong className="reader-rank-badge">
                  <i className={`bi ${readerRank.icon}`} />
                  <span>{readerRank.title}</span>
                </strong>
              </div>
            </div>
          </div>
        </div>

        <div className="account-settings-card quick-resume-card">
          <SettingsHeading icon="bi-bookmark-check" kicker="Tiếp tục đọc" title="Sách đang đọc gần nhất" />
          {resumeBookItem ? (
            <div className="quick-resume-content">
              <img
                alt={resumeBookItem.book?.title || ''}
                className="quick-resume-cover"
                src={getCover(resumeBookItem.book)}
              />
              <div className="quick-resume-info">
                <h4 className="quick-resume-title">{resumeBookItem.book?.title || 'Untitled'}</h4>
                <p className="quick-resume-author">
                  <i className="bi bi-pen" />
                  <span>{getAuthor(resumeBookItem.book)}</span>
                </p>
                <div className="quick-resume-progress-wrap">
                  <div className="quick-resume-progress-bar">
                    <div
                      className="quick-resume-progress-fill"
                      style={{
                        width: `${Math.min(100, Math.round(effectiveProgress[resumeBookItem.book?.id || resumeBookItem.book?._id] || 0))}%`,
                      }}
                    />
                  </div>
                  <span className="quick-resume-pct">
                    {Math.round(effectiveProgress[resumeBookItem.book?.id || resumeBookItem.book?._id] || 0)}% hoàn thành
                  </span>
                </div>
                <div className="quick-resume-actions">
                  <button
                    className="primary-button quick-resume-btn"
                    onClick={() => onRead?.(resumeBookItem.book)}
                    type="button"
                  >
                    <i className="bi bi-play-circle-fill" />
                    <span>Đọc tiếp ngay</span>
                  </button>
                  <button
                    className="ghost-button quick-resume-btn"
                    onClick={() => (onDetail ? onDetail(resumeBookItem.book) : onRead?.(resumeBookItem.book))}
                    type="button"
                  >
                    <i className="bi bi-info-circle" />
                    <span>Chi tiết</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="quick-resume-empty">
              <i className="bi bi-journal-plus" />
              <p>Chưa có sách nào đang đọc dở. Hãy chọn sách từ Kệ hoặc Trang chủ để bắt đầu!</p>
              <button
                className="ghost-button"
                onClick={() => setActiveShelfTab('want_to_read')}
                type="button"
              >
                <i className="bi bi-bookmark-plus" />
                <span>Xem sách muốn đọc</span>
              </button>
            </div>
          )}
        </div>

        <div className="account-settings-card reading-stats-card">
          <div className="reading-stats-header">
            <SettingsHeading icon="bi-graph-up-arrow" kicker="Thống kê" title="Hoạt động & Mục tiêu đọc" />
            {!isEditingGoal && (
              <button
                className="ghost-button edit-goal-btn"
                onClick={() => {
                  setGoalInput(readingGoal)
                  setIsEditingGoal(true)
                }}
                type="button"
              >
                <i className="bi bi-pencil-square" />
                <span>Đổi mục tiêu</span>
              </button>
            )}
          </div>

          <div className="reading-metrics-grid">
            <div className="metric-item">
              <div className="metric-icon-box metric-reading">
                <i className="bi bi-book-half" />
              </div>
              <div className="metric-text">
                <span className="metric-value">{readingList.length}</span>
                <span className="metric-label">Đang đọc</span>
              </div>
            </div>

            <div className="metric-item">
              <div className="metric-icon-box metric-want">
                <i className="bi bi-bookmark-plus" />
              </div>
              <div className="metric-text">
                <span className="metric-value">{wantToReadList.length}</span>
                <span className="metric-label">Muốn đọc</span>
              </div>
            </div>

            <div className="metric-item">
              <div className="metric-icon-box metric-finished">
                <i className="bi bi-check2-circle" />
              </div>
              <div className="metric-text">
                <span className="metric-value">{finishedList.length}</span>
                <span className="metric-label">Đã đọc xong</span>
              </div>
            </div>

            <div className="metric-item">
              <div className="metric-icon-box metric-streak">
                <i className="bi bi-fire" />
              </div>
              <div className="metric-text">
                <span className="metric-value">{readingStreak}</span>
                <span className="metric-label">Ngày liên tiếp</span>
              </div>
            </div>
          </div>

          <div className="reading-goal-box">
            <div className="reading-goal-top">
              <div className="goal-title-wrap">
                <i className="bi bi-flag-fill" />
                <strong>Mục tiêu đọc sách năm {new Date().getFullYear()}</strong>
              </div>
              <span className="goal-progress-text">
                {finishedList.length} / {readingGoal} cuốn ({goalPercentage}%)
              </span>
            </div>

            <div className="goal-progress-bar">
              <div className="goal-progress-fill" style={{ width: `${goalPercentage}%` }} />
            </div>

            {isEditingGoal && (
              <form className="edit-goal-form" onSubmit={handleSaveGoal}>
                <label htmlFor="goal-input">Số cuốn muốn đọc trong năm:</label>
                <input
                  id="goal-input"
                  type="number"
                  min="1"
                  max="500"
                  value={goalInput}
                  onChange={(e) => setGoalInput(e.target.value)}
                  autoFocus
                />
                <button className="primary-button btn-sm" type="submit">
                  <i className="bi bi-check-lg" />
                  <span>Lưu</span>
                </button>
                <button
                  className="ghost-button btn-sm"
                  type="button"
                  onClick={() => setIsEditingGoal(false)}
                >
                  <i className="bi bi-x-lg" />
                  <span>Hủy</span>
                </button>
              </form>
            )}
          </div>
        </div>

        <form className="account-settings-card profile-card-large" onSubmit={saveProfile}>
          <SettingsHeading icon="bi-person-gear" kicker="Profile" title="Identity" />
          <div className="avatar-editor">
            <span>{safeAvatar ? <img src={safeAvatar} alt="" /> : getInitials(safeName)}</span>
            <label className="file-picker">
              <i className="bi bi-image" />
              Change avatar
              <input accept={AVATAR_TYPES.join(',')} type="file" onChange={handleAvatarChange} />
            </label>
            <small>JPG, PNG, WEBP, or GIF. Max 2MB.</small>
          </div>
          <label>
            Display name
            <input
              maxLength={DISPLAY_NAME_MAX}
              value={displayName}
              onChange={(event) => {
                setDisplayName(event.target.value)
                setSettingsError('')
              }}
            />
            <span className="field-hint">
              {displayName.length}/{DISPLAY_NAME_MAX} characters. Letters, numbers, spaces, . _ ' - only.
            </span>
          </label>
          <button className="primary-button" disabled={settingsLoading} type="submit">
            <i className="bi bi-check2-circle" />
            {settingsLoading ? 'Saving...' : 'Save profile'}
          </button>
          {settingsError && <p className="settings-error"><i className="bi bi-exclamation-circle" /> {settingsError}</p>}
          {settingsSuccess && <p className="settings-success"><i className="bi bi-check-circle" /> {settingsSuccess}</p>}
        </form>

        <div className="account-settings-card profile-shelf-card">
          <SettingsHeading icon="bi-bookshelf" kicker="Tủ sách của tôi" title="Kệ sách cá nhân" />

          <div className="shelf-tab-nav" role="tablist" aria-label="Phân loại kệ sách">
            <button
              type="button"
              role="tab"
              aria-selected={activeShelfTab === 'reading'}
              className={`shelf-tab-btn ${activeShelfTab === 'reading' ? 'active' : ''}`}
              onClick={() => setActiveShelfTab('reading')}
            >
              <i className="bi bi-book-half" />
              <span>Đang đọc</span>
              <span className="shelf-count-pill">{readingList.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeShelfTab === 'want_to_read'}
              className={`shelf-tab-btn ${activeShelfTab === 'want_to_read' ? 'active' : ''}`}
              onClick={() => setActiveShelfTab('want_to_read')}
            >
              <i className="bi bi-bookmark-plus" />
              <span>Muốn đọc</span>
              <span className="shelf-count-pill">{wantToReadList.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeShelfTab === 'finished'}
              className={`shelf-tab-btn ${activeShelfTab === 'finished' ? 'active' : ''}`}
              onClick={() => setActiveShelfTab('finished')}
            >
              <i className="bi bi-check-circle-fill" />
              <span>Đã đọc xong</span>
              <span className="shelf-count-pill">{finishedList.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeShelfTab === 'authored'}
              className={`shelf-tab-btn ${activeShelfTab === 'authored' ? 'active' : ''}`}
              onClick={() => setActiveShelfTab('authored')}
            >
              <i className="bi bi-journal-arrow-up" />
              <span>Sách đã đăng</span>
              <span className="shelf-count-pill">{myBooks.length}</span>
            </button>
          </div>

          <div className="shelf-tab-content">
            {activeShelfTab === 'reading' && (
              <ShelfBookList
                items={readingList}
                emptyText="Bạn chưa có cuốn sách nào trong mục Đang đọc. Hãy mở một cuốn sách từ Trang chủ để bắt đầu đọc!"
                emptyIcon="bi-journal-richtext"
                progress={effectiveProgress}
                onRead={onRead}
                onDetail={onDetail}
                onUpdateStatus={onUpdateShelfStatus}
                onRemove={onRemoveShelfBook}
              />
            )}
            {activeShelfTab === 'want_to_read' && (
              <ShelfBookList
                items={wantToReadList}
                emptyText="Chưa có sách nào trong danh sách Muốn đọc. Khi lướt xem sách, chọn 'Muốn đọc' để lưu vào đây nhé."
                emptyIcon="bi-bookmark-heart"
                progress={effectiveProgress}
                onRead={onRead}
                onDetail={onDetail}
                onUpdateStatus={onUpdateShelfStatus}
                onRemove={onRemoveShelfBook}
              />
            )}
            {activeShelfTab === 'finished' && (
              <ShelfBookList
                items={finishedList}
                emptyText="Chưa có cuốn sách nào được đánh dấu Đã đọc xong. Chúc bạn có những trải nghiệm đọc tuyệt vời!"
                emptyIcon="bi-award"
                progress={effectiveProgress}
                onRead={onRead}
                onDetail={onDetail}
                onUpdateStatus={onUpdateShelfStatus}
                onRemove={onRemoveShelfBook}
              />
            )}
            {activeShelfTab === 'authored' && (
              <AuthoredBookList
                items={myBooks}
                loading={myBooksLoading}
                onRead={onRead}
                onDetail={onDetail}
                onNavigate={onNavigate}
              />
            )}
          </div>
        </div>

        <form className="account-settings-card" onSubmit={handleChangePassword}>
          <SettingsHeading icon="bi-shield-lock" kicker="Security" title="Change password" />
          <p className="settings-copy">Enter your current password, then your new one twice. We'll email {safeMaskedEmail} to confirm the change.</p>
          <label>
            Old password
            <input
              autoComplete="current-password"
              onChange={(event) => {
                setOldPassword(event.target.value)
                setPasswordError(''); setPasswordSuccess('')
              }}
              type="password"
              value={oldPassword}
            />
          </label>
          <label>
            New password
            <input
              autoComplete="new-password"
              onChange={(event) => {
                setNewPassword(event.target.value)
                setPasswordError(''); setPasswordSuccess('')
              }}
              type="password"
              value={newPassword}
            />
            <span className="field-hint">At least 8 characters, with letters and numbers.</span>
          </label>
          <label>
            Confirm new password
            <input
              autoComplete="new-password"
              onChange={(event) => {
                setConfirmPassword(event.target.value)
                setPasswordError(''); setPasswordSuccess('')
              }}
              type="password"
              value={confirmPassword}
            />
          </label>
          {passwordError && <p className="settings-error"><i className="bi bi-exclamation-circle" /> {passwordError}</p>}
          {passwordSuccess && <p className="settings-success"><i className="bi bi-check-circle" /> {passwordSuccess}</p>}
          <button className="primary-button" disabled={passwordLoading || !oldPassword || !newPassword || !confirmPassword} type="submit">
            <i className="bi bi-shield-check" />
            {passwordLoading ? 'Changing...' : 'Change password'}
          </button>
        </form>

        <div className="account-settings-card reader-preview-card">
          <SettingsHeading icon="bi-book" kicker="Reader" title="Preview mode" />
          <div className="settings-two-col">
            <label>
              Reader mode
              <select value={readerTheme} onChange={(event) => setReaderTheme(event.target.value)}>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <label>
              Font size
              <select value={readerFontSize} onChange={(event) => setReaderFontSize(Number(event.target.value))}>
                <option value="16">Small</option>
                <option value="18">Medium</option>
                <option value="20">Large</option>
                <option value="24">Extra large</option>
              </select>
            </label>
          </div>
          <div
            className={`settings-reader-preview reader-${readerTheme}`}
            style={{ '--reader-font-size': `${readerFontSize}px` }}
          >
            <p className="mono-eyebrow">Chapter preview</p>
            <h4>A quiet page for focused reading</h4>
            <p>Reader mode syncs with the reading screen.</p>
          </div>
        </div>

        <div className="account-settings-card">
          <SettingsHeading icon="bi-palette" kicker="Appearance" title="Website theme" />
          <div className="theme-options" role="group" aria-label="Website theme">
            {[
              ['light', 'Light'],
              ['dark', 'Dark'],
            ].map(([value, label]) => (
              <button
                className={websiteTheme === value ? 'active' : ''}
                key={value}
                onClick={() => setWebsiteTheme(value)}
                type="button"
              >
                <span className={`theme-swatch theme-swatch-${value}`} />
                {label}
              </button>

            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function SettingsHeading({ icon, kicker, title }) {
  return (
    <div className="settings-card-heading">
      <i className={`bi ${icon}`} />
      <div>
        <p className="mono-eyebrow">{kicker}</p>
        <h3>{title}</h3>
      </div>
    </div>
  )
}

function normalizeDisplayName(name) {
  return name.trim().replace(/\s+/g, ' ')
}

function validateDisplayName(name) {
  const normalizedName = normalizeDisplayName(name)

  if (!normalizedName) return 'Display name cannot be empty.'
  if (normalizedName.length < DISPLAY_NAME_MIN) return `Display name must be at least ${DISPLAY_NAME_MIN} characters.`
  if (normalizedName.length > DISPLAY_NAME_MAX) return `Display name must be ${DISPLAY_NAME_MAX} characters or fewer.`
  if (!DISPLAY_NAME_PATTERN.test(normalizedName)) {
    return "Display name can only include letters, numbers, spaces, and . _ ' -"
  }

  return ''
}

function ShelfBookList({ items = [], emptyText, emptyIcon, progress = {}, onRead, onDetail, onUpdateStatus, onRemove }) {
  if (!items.length) {
    return (
      <div className="shelf-empty-box">
        <i className={`bi ${emptyIcon || 'bi-book'}`} />
        <p>{emptyText}</p>
      </div>
    )
  }

  return (
    <ul className="book-thumb-list shelf-book-list">
      {items.map(({ book, status }) => {
        const bId = book._id || book.id
        const bookProgress = Math.round(progress[bId] || 0)
        return (
          <li key={bId} className="shelf-book-item">
            <img alt={book.title || ''} className="shelf-book-cover" src={getCover(book)} />
            <div className="shelf-book-meta">
              <strong>{book.title || 'Untitled'}</strong>
              <span>{getAuthor(book)}</span>
              {bookProgress > 0 && (
                <div className="shelf-item-progress-wrap">
                  <div className="shelf-item-progress-bar">
                    <div className="shelf-item-progress-fill" style={{ width: `${Math.min(100, bookProgress)}%` }} />
                  </div>
                  <small>{bookProgress}% hoàn thành</small>
                </div>
              )}
            </div>

            <div className="shelf-book-actions">
              <button
                className="primary-button shelf-action-btn"
                onClick={() => onRead?.(book)}
                type="button"
              >
                <i className={bookProgress > 0 && bookProgress < 100 ? 'bi bi-play-circle-fill' : status === 'finished' ? 'bi bi-arrow-repeat' : 'bi bi-book-half'} />
                <span>{bookProgress > 0 && bookProgress < 100 ? 'Đọc tiếp' : status === 'finished' ? 'Đọc lại' : 'Đọc ngay'}</span>
              </button>

              <button
                className="ghost-button shelf-action-btn"
                onClick={() => (onDetail ? onDetail(book) : onRead?.(book))}
                type="button"
              >
                <i className="bi bi-info-circle" />
                <span>Chi tiết</span>
              </button>

              <select
                aria-label="Thay đổi trạng thái kệ sách"
                className="shelf-status-select"
                onChange={(e) => {
                  const val = e.target.value
                  if (val === 'remove') {
                    onRemove?.(bId)
                  } else {
                    onUpdateStatus?.(bId, val)
                  }
                }}
                value={status || 'want_to_read'}
              >
                <option value="reading">Đang đọc</option>
                <option value="want_to_read">Muốn đọc</option>
                <option value="finished">Đã đọc xong</option>
                <option value="remove">Xóa khỏi kệ</option>
              </select>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function AuthoredBookList({ items = [], loading, onRead, onDetail, onNavigate }) {
  if (loading) {
    return (
      <div className="shelf-empty-box">
        <i className="bi bi-arrow-repeat spin" />
        <p>Đang tải danh sách sách bạn đã đăng...</p>
      </div>
    )
  }

  if (!items.length) {
    return (
      <div className="shelf-empty-box">
        <i className="bi bi-journal-plus" />
        <p>Bạn chưa sáng tác hoặc đăng cuốn sách nào lên hệ thống.</p>
        {onNavigate && (
          <button
            className="primary-button"
            type="button"
            onClick={() => onNavigate('write')}
            style={{ marginTop: '0.75rem' }}
          >
            <i className="bi bi-feather" />
            <span>Sáng tác / Đăng sách ngay</span>
          </button>
        )}
      </div>
    )
  }

  return (
    <ul className="book-thumb-list shelf-book-list authored-book-list">
      {items.map((book) => {
        const bId = book._id || book.id
        const status = book.status || 'published'
        return (
          <li key={bId} className="shelf-book-item authored-book-item">
            <img alt={book.title || ''} className="shelf-book-cover" src={getCover(book)} />
            <div className="shelf-book-meta">
              <strong>{book.title || 'Untitled'}</strong>
              <span>{getAuthor(book)}</span>
              <div className="shelf-authored-badges">
                <span className={`authored-status-pill status-${status}`}>
                  <i className={status === 'published' ? 'bi bi-check-circle-fill' : 'bi bi-file-earmark-text'} />
                  <span>{status === 'published' ? 'Đã xuất bản' : 'Bản nháp'}</span>
                </span>
                {typeof book.views === 'number' && (
                  <span className="authored-views-pill">
                    <i className="bi bi-eye" />
                    <span>{book.views} lượt xem</span>
                  </span>
                )}
              </div>
            </div>

            <div className="shelf-book-actions">
              <button
                className="primary-button shelf-action-btn"
                onClick={() => onRead?.(book)}
                type="button"
              >
                <i className="bi bi-book-half" />
                <span>Đọc</span>
              </button>
              <button
                className="ghost-button shelf-action-btn"
                onClick={() => (onDetail ? onDetail(book) : onRead?.(book))}
                type="button"
              >
                <i className="bi bi-info-circle" />
                <span>Chi tiết</span>
              </button>
              {onNavigate && (
                <button
                  className="ghost-button shelf-action-btn"
                  onClick={() => onNavigate('write')}
                  type="button"
                  title="Chỉnh sửa hoặc viết chương mới"
                >
                  <i className="bi bi-pencil-square" />
                  <span>Viết / Sửa</span>
                </button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export default ProfilePage
