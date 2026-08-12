import { useState } from 'react'
import { getAuthor, getCover, getInitials } from '../../utils/bookUtils'
import { maskEmail } from '../../utils/maskEmail'

const AVATAR_MAX_SIZE = 2 * 1024 * 1024
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const DISPLAY_NAME_MAX = 32
const DISPLAY_NAME_MIN = 2
const DISPLAY_NAME_PATTERN = /^[\p{L}\p{N} ._'-]+$/u

function ProfilePage({
  account,
  books = [],
  favorites = [],
  onDetail,
  onFavorite,
  onProfileUpdate,
  onRead,
  onResetPassword,
  progress = {},
  readerFontSize,
  readerTheme,
  rentals = [],
  setReaderFontSize,
  setReaderTheme,
  setWebsiteTheme,
  websiteTheme,
}) {
  return (
    <div className="profile-page settings-only-page">
      <ProfileSettings
        key={account?.id || account?.email || 'guest'}
        account={account}
        books={books}
        favorites={favorites}
        onDetail={onDetail}
        onFavorite={onFavorite}
        onProfileUpdate={onProfileUpdate}
        onRead={onRead}
        onResetPassword={onResetPassword}
        progress={progress}
        readerFontSize={readerFontSize}
        readerTheme={readerTheme}
        rentals={rentals}
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
  onDetail,
  onFavorite,
  onProfileUpdate,
  onRead,
  onResetPassword,
  progress = {},
  readerFontSize,
  readerTheme,
  rentals = [],
  setReaderFontSize,
  setReaderTheme,
  setWebsiteTheme,
  websiteTheme,
}) {
  const [avatarPreview, setAvatarPreview] = useState(account?.avatar || '')
  const [displayName, setDisplayName] = useState(account?.name || 'Reader')
  const [settingsError, setSettingsError] = useState('')
  const [settingsLoading, setSettingsLoading] = useState(false)
  const roleLabel = (account?.role || 'customer').charAt(0).toUpperCase() + (account?.role || 'customer').slice(1)
  const continueReading = books
    .filter((book) => (progress[book.id] || 0) > 0 && (progress[book.id] || 0) < 100)
    .slice(0, 6)
  const savedBooks = books.filter((book) => favorites.includes(book.id)).slice(0, 8)

  const safeName = displayName || account?.name || 'Reader'
  const safeEmail = account?.email || 'No email linked yet'
  const safeMaskedEmail = safeEmail === 'No email linked yet' ? safeEmail : maskEmail(safeEmail)
  const safeAvatar = avatarPreview || account?.avatar || ''

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
      return
    }

    const normalizedDisplayName = normalizeDisplayName(displayName)
    setSettingsLoading(true)
    setSettingsError('')
    try {
      await onProfileUpdate({ avatar: safeAvatar, displayName: normalizedDisplayName })
      setDisplayName(normalizedDisplayName)
    } catch {
      setSettingsError('Could not update your profile. Please try again.')
    } finally {
      setSettingsLoading(false)
    }
  }

  async function sendResetPassword() {
    setSettingsLoading(true)
    setSettingsError('')
    try {
      await onResetPassword()
    } catch {
      setSettingsError('Could not send reset email right now.')
    } finally {
      setSettingsLoading(false)
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
          <SettingsHeading icon="bi-person-badge" kicker="Account" title="Your profile" />
          <div className="account-overview">
            <div className="account-overview-main">
              <div className="account-overview-name">
                <strong>{safeName}</strong>
                <p>{safeMaskedEmail}</p>
              </div>
              <span className="account-role-pill">{roleLabel}</span>
            </div>
            <div className="account-overview-meta">
              <div>
                <span>Email</span>
                <strong>{safeMaskedEmail}</strong>
              </div>
              <div>
                <span>Role</span>
                <strong>{roleLabel}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>{account?.email ? 'Active' : 'Guest'}</strong>
              </div>
            </div>
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
            Save profile
          </button>
        </form>

        <div className="account-settings-card">
          <SettingsHeading icon="bi-bag-check" kicker="Rentals" title="Active rentals" />
          {rentals?.length ? (
            <ul className="rental-list">
              {rentals.map((rental) => (
                <li key={rental.id}>
                  <strong>{rental.title}</strong>
                  <span>{new Date(rental.expiresAt).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="settings-copy">No rentals yet. Rent a book from the library to see it here.</p>
          )}
        </div>

        <div className="account-settings-card">
          <SettingsHeading icon="bi-bookmark-star" kicker="Continue reading" title="Pick up where you left off" />
          {continueReading.length ? (
            <ul className="book-thumb-list">
              {continueReading.map((book) => (
                <li key={book.id}>
                  <img alt="" src={getCover(book)} />
                  <div>
                    <strong>{book.title}</strong>
                    <span>{getAuthor(book)} - {Math.round(progress[book.id] || 0)}% read</span>
                  </div>
                  <button className="ghost-button" onClick={() => onRead?.(book)} type="button">Resume</button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="settings-copy">Nothing in progress yet. Open a book from Home or Discover to start reading.</p>
          )}
        </div>

        <div className="account-settings-card">
          <SettingsHeading icon="bi-heart" kicker="Saved" title="Favorites" />
          {savedBooks.length ? (
            <ul className="book-thumb-list">
              {savedBooks.map((book) => (
                <li key={book.id}>
                  <img alt="" src={getCover(book)} />
                  <div>
                    <strong>{book.title}</strong>
                    <span>{getAuthor(book)}</span>
                  </div>
                  <button className="ghost-button" onClick={() => (onDetail ? onDetail(book) : onRead?.(book))} type="button">View</button>
                  {onFavorite && (
                    <button aria-label="Remove from favorites" className="ghost-button" onClick={() => onFavorite(book.id)} type="button">
                      <i className="bi bi-heart-fill" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="settings-copy">No saved books yet. Tap the heart icon on any book to save it here.</p>
          )}
        </div>

        <div className="account-settings-card">
          <SettingsHeading icon="bi-shield-lock" kicker="Security" title="Password" />
          <p className="settings-copy">Send a reset link to {safeMaskedEmail}.</p>
          <button className="ghost-button" disabled={settingsLoading} onClick={sendResetPassword} type="button">
            <i className="bi bi-envelope-arrow-up" />
            Send reset email
          </button>
        </div>

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
      {settingsError && <p className="settings-error">{settingsError}</p>}
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

export default ProfilePage
