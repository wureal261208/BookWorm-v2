import { useEffect, useRef, useState } from 'react'
import { auth } from '../../features/auth-firebase/firebaseConfig'
import { apiFetch } from '../../utils/apiClient'
import { renderLiteMarkdown } from '../../utils/liteMarkdown'
import CoverImagePicker from '../shared/CoverImagePicker'

const emptyChapter = () => ({ title: '', content: '' })

const emptyBookForm = {
  title: '',
  author: '',
  description: '',
  category: '',
  language: 'en',
  coverUrl: '',
  chapters: [emptyChapter()],
}

const emptyStoryForm = {
  title: '',
  content: '',
  coverUrl: '',
  tags: 'stories',
}

const AUTOSAVE_DELAY_MS = 800

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`
}

function getUrlTab() {
  if (typeof window !== 'undefined' && window.location?.search) {
    const paramTab = new URLSearchParams(window.location.search).get('tab')
    if (paramTab === 'mine') return 'mine'
    if (paramTab === 'write' || paramTab === 'book') return 'write'
    if (paramTab === 'story') return 'story'
  }
  return 'story'
}

function WritePage({ account, onDetail, onToast }) {
  const isGuest = !auth.currentUser
  const [tab, setTab] = useState(getUrlTab)

  // Book Writer states
  const [bookForm, setBookForm] = useState(() => ({ ...emptyBookForm, author: account?.name || '' }))
  const [editingBook, setEditingBook] = useState(null)
  const [loadingEdit, setLoadingEdit] = useState(false)
  const [submittingBook, setSubmittingBook] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)
  const [draftPrompt, setDraftPrompt] = useState(null)
  const [deleteConfirmBook, setDeleteConfirmBook] = useState(null)
  const [deletingBook, setDeletingBook] = useState(false)
  const [aiSummarizing, setAiSummarizing] = useState(false)
  const [aiSummaryError, setAiSummaryError] = useState('')
  const [bookFieldErrors, setBookFieldErrors] = useState({})
  const textareaRefs = useRef({})
  const autosaveTimer = useRef(null)
  const skipNextAutosave = useRef(true)

  // Story & Audio Creator states
  const [storyForm, setStoryForm] = useState(emptyStoryForm)
  const [submittingStory, setSubmittingStory] = useState(false)
  const [storyError, setStoryError] = useState('')
  const [storySuccess, setStorySuccess] = useState('')
  const [storyFieldErrors, setStoryFieldErrors] = useState({})

  // Voice Recording Studio states
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [recordedAudioBlob, setRecordedAudioBlob] = useState(null)
  const [audioPreviewUrl, setAudioPreviewUrl] = useState('')
  const [selectedAudioFile, setSelectedAudioFile] = useState(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const recordingTimerRef = useRef(null)
  const streamRef = useRef(null)

  // Submissions list states
  const [mineSubTab, setMineSubTab] = useState('books')
  const [myBooks, setMyBooks] = useState([])
  const [myStories, setMyStories] = useState([])
  const [loadingMine, setLoadingMine] = useState(false)
  const [deleteConfirmStory, setDeleteConfirmStory] = useState(null)
  const [deletingStory, setDeletingStory] = useState(false)

  // Common notification feedback
  const [commonError, setCommonError] = useState('')
  const [commonSuccess, setCommonSuccess] = useState('')

  // Sync tab with URL search parameter
  useEffect(() => {
    const handleLocationChange = () => {
      setTab(getUrlTab())
    }
    window.addEventListener('popstate', handleLocationChange)
    return () => window.removeEventListener('popstate', handleLocationChange)
  }, [])

  function handleTabChange(nextTab) {
    setTab(nextTab)
    if (typeof window !== 'undefined' && window.history) {
      const urlTab = nextTab === 'write' ? 'book' : nextTab
      const url = new URL(window.location.href)
      url.searchParams.set('tab', urlTab)
      window.history.pushState({}, '', url.toString())
    }
  }

  // Cleanup audio preview URL and streams on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
      if (audioPreviewUrl && audioPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(audioPreviewUrl)
      }
    }
  }, [audioPreviewUrl])

  // --- Voice Studio Recording Handlers ---
  async function startRecording() {
    setStoryError('')
    setStorySuccess('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      let mimeType = 'audio/webm'
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4'
        else if (MediaRecorder.isTypeSupported('audio/ogg')) mimeType = 'audio/ogg'
        else mimeType = ''
      }

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      audioChunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        setRecordedAudioBlob(audioBlob)
        setSelectedAudioFile(null)
        if (audioPreviewUrl && audioPreviewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(audioPreviewUrl)
        }
        setAudioPreviewUrl(URL.createObjectURL(audioBlob))

        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop())
          streamRef.current = null
        }
      }

      recorder.start(250)
      setIsRecording(true)
      setRecordingSeconds(0)

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1)
      }, 1000)
    } catch (err) {
      setStoryError(err.name === 'NotAllowedError' ? 'Microphone permission was denied. Please allow microphone access or upload an audio file.' : (err.message || 'Could not access microphone.'))
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
        recordingTimerRef.current = null
      }
    }
  }

  function discardRecording() {
    if (isRecording) {
      stopRecording()
    }
    if (audioPreviewUrl && audioPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(audioPreviewUrl)
    }
    setRecordedAudioBlob(null)
    setSelectedAudioFile(null)
    setAudioPreviewUrl('')
    setRecordingSeconds(0)
  }

  function handleAudioFileUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return

    discardRecording()
    setSelectedAudioFile(file)
    const url = URL.createObjectURL(file)
    setAudioPreviewUrl(url)

    // Estimate audio duration via audio element
    const tempAudio = new Audio(url)
    tempAudio.onloadedmetadata = () => {
      setRecordingSeconds(Math.round(tempAudio.duration) || 0)
    }
  }

  // --- Story Submission ---
  async function submitStory(e) {
    e.preventDefault()
    setStoryError('')
    setStorySuccess('')

    const title = storyForm.title.trim()
    const content = storyForm.content.trim()
    const errors = {}

    if (!title) errors.title = true
    if (!content) errors.content = true

    if (Object.keys(errors).length > 0) {
      setStoryFieldErrors(errors)
      setStoryError(
        !title && !content
          ? 'Please enter both a title and story content before submitting.'
          : !title
          ? 'Please enter a title for your story.'
          : 'Please write your story content or reflection.'
      )
      return
    }

    setStoryFieldErrors({})
    setSubmittingStory(true)

    try {
      const formData = new FormData()
      formData.append('title', title)
      formData.append('content', content)
      formData.append('coverUrl', storyForm.coverUrl.trim())
      formData.append('tags', storyForm.tags.trim() || 'stories')
      formData.append('audioDuration', String(recordingSeconds || 0))

      if (recordedAudioBlob) {
        formData.append('audio', recordedAudioBlob, 'voice-recording.webm')
      } else if (selectedAudioFile) {
        formData.append('audio', selectedAudioFile, selectedAudioFile.name)
      }

      await apiFetch('/api/stories', {
        method: 'POST',
        body: formData,
      })

      const successMsg = 'Story published successfully! It is now live in the community feed on the home page.'
      setStorySuccess(successMsg)
      onToast?.({ type: 'success', message: successMsg })
      setStoryForm(emptyStoryForm)
      discardRecording()
    } catch (err) {
      setStoryError(err.message || 'Could not publish story.')
    } finally {
      setSubmittingStory(false)
    }
  }

  // --- Book Writer Autosave & Draft Logic ---
  const draftKey = editingBook ? `bookworm_write_draft_edit_${editingBook.id}` : 'bookworm_write_draft_new'

  useEffect(() => {
    skipNextAutosave.current = true
    try {
      const raw = localStorage.getItem(draftKey)
      if (raw) setDraftPrompt(JSON.parse(raw))
      else setDraftPrompt(null)
    } catch {
      setDraftPrompt(null)
    }
  }, [draftKey])

  useEffect(() => {
    if (skipNextAutosave.current) {
      skipNextAutosave.current = false
      return undefined
    }
    window.clearTimeout(autosaveTimer.current)
    autosaveTimer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify({ form: bookForm, savedAt: new Date().toISOString() }))
      } catch {}
    }, AUTOSAVE_DELAY_MS)
    return () => window.clearTimeout(autosaveTimer.current)
  }, [bookForm, draftKey])

  function restoreDraft() {
    skipNextAutosave.current = true
    setBookForm(draftPrompt.form)
    setDraftPrompt(null)
  }

  function discardDraft() {
    try {
      localStorage.removeItem(draftKey)
    } catch {}
    setDraftPrompt(null)
  }

  function clearDraftAfterSave() {
    try {
      localStorage.removeItem(draftKey)
    } catch {}
  }

  // --- Submissions Loader ---
  function loadSubmissions() {
    setLoadingMine(true)
    setCommonError('')
    Promise.allSettled([
      apiFetch('/api/stories/mine'),
      apiFetch('/api/books/mine'),
    ])
      .then(([storiesRes, booksRes]) => {
        if (storiesRes.status === 'fulfilled') {
          setMyStories(Array.isArray(storiesRes.value?.stories) ? storiesRes.value.stories : [])
        }
        if (booksRes.status === 'fulfilled') {
          setMyBooks(Array.isArray(booksRes.value?.books) ? booksRes.value.books : [])
        }
      })
      .catch((err) => setCommonError(err.message))
      .finally(() => setLoadingMine(false))
  }

  useEffect(() => {
    if (tab === 'mine' && !isGuest) {
      loadSubmissions()
    }
  }, [tab, isGuest])

  // --- Book Edit & Delete Handlers ---
  async function handleDeleteBook() {
    if (!deleteConfirmBook) return
    const bId = deleteConfirmBook.id || deleteConfirmBook._id
    const bookTitle = deleteConfirmBook.title
    setDeletingBook(true)
    setCommonError('')
    try {
      await apiFetch(`/api/books/${bId}/mine`, { method: 'DELETE' })
      setMyBooks((prev) => prev.filter((b) => (b.id || b._id) !== bId))
      try {
        localStorage.removeItem(`bookworm_write_draft_edit_${bId}`)
      } catch {}
      const successMsg = `"${bookTitle}" has been permanently deleted.`
      setCommonSuccess(successMsg)
      onToast?.({ type: 'success', message: successMsg })
      setDeleteConfirmBook(null)
    } catch (err) {
      setCommonError(err.message || 'Could not delete book')
    } finally {
      setDeletingBook(false)
    }
  }

  async function handleDeleteStory() {
    if (!deleteConfirmStory) return
    const sId = deleteConfirmStory.id || deleteConfirmStory._id
    const storyTitle = deleteConfirmStory.title
    setDeletingStory(true)
    setCommonError('')
    try {
      await apiFetch(`/api/stories/${sId}`, { method: 'DELETE' })
      setMyStories((prev) => prev.filter((s) => (s.id || s._id) !== sId))
      const successMsg = `"${storyTitle}" has been removed from the community feed.`
      setCommonSuccess(successMsg)
      onToast?.({ type: 'success', message: successMsg })
      setDeleteConfirmStory(null)
    } catch (err) {
      setCommonError(err.message || 'Could not delete story')
    } finally {
      setDeletingStory(false)
    }
  }

  async function generateAiSummary() {
    setAiSummarizing(true)
    setAiSummaryError('')
    try {
      const data = await apiFetch('/api/books/ai-summary', {
        method: 'POST',
        body: {
          title: bookForm.title,
          author: bookForm.author,
          category: bookForm.category,
          existingDescription: bookForm.description,
          chapters: bookForm.chapters,
        },
      })
      if (data?.summary) {
        updateBookField('description', data.summary)
      }
    } catch (err) {
      setAiSummaryError(err.message || 'Could not generate summary')
    } finally {
      setAiSummarizing(false)
    }
  }

  function updateBookField(field, value) {
    setBookForm((current) => ({ ...current, [field]: value }))
  }

  function updateChapter(index, field, value) {
    setBookForm((current) => ({
      ...current,
      chapters: current.chapters.map((chapter, chapterIndex) => (chapterIndex === index ? { ...chapter, [field]: value } : chapter)),
    }))
  }

  function addChapter() {
    setBookForm((current) => ({ ...current, chapters: [...current.chapters, emptyChapter()] }))
  }

  function removeChapter(index) {
    setBookForm((current) => ({ ...current, chapters: current.chapters.filter((_, chapterIndex) => chapterIndex !== index) }))
  }

  function moveChapter(index, direction) {
    setBookForm((current) => {
      const target = index + direction
      if (target < 0 || target >= current.chapters.length) return current
      const chapters = [...current.chapters]
      ;[chapters[index], chapters[target]] = [chapters[target], chapters[index]]
      return { ...current, chapters }
    })
  }

  function wrapSelection(index, marker) {
    const textarea = textareaRefs.current[index]
    if (!textarea) return

    const { selectionStart, selectionEnd, value } = textarea
    const selected = value.slice(selectionStart, selectionEnd) || 'text'
    const newValue = value.slice(0, selectionStart) + marker + selected + marker + value.slice(selectionEnd)
    updateChapter(index, 'content', newValue)

    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(selectionStart + marker.length, selectionStart + marker.length + selected.length)
    })
  }

  async function startEdit(book) {
    setCommonError('')
    setCommonSuccess('')
    setLoadingEdit(true)
    setTab('write')
    setPreviewMode(false)
    try {
      const data = await apiFetch(`/api/books/${book.id}`)
      const fullBook = data.book
      skipNextAutosave.current = true
      setEditingBook({ id: fullBook.id, status: fullBook.status })
      setBookForm({
        title: fullBook.title || '',
        author: fullBook.author || '',
        description: fullBook.description || '',
        category: fullBook.category || '',
        language: fullBook.language || 'en',
        coverUrl: fullBook.coverUrl || '',
        chapters: (fullBook.chapters?.length ? fullBook.chapters : [emptyChapter()])
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((chapter) => ({ title: chapter.title || '', content: chapter.content || '' })),
      })
    } catch (err) {
      setCommonError(err.message)
      setTab('mine')
    } finally {
      setLoadingEdit(false)
    }
  }

  function cancelEdit() {
    skipNextAutosave.current = true
    setEditingBook(null)
    setBookForm({ ...emptyBookForm, author: account?.name || '' })
    setCommonError('')
    setCommonSuccess('')
    setPreviewMode(false)
  }

  async function submitBook(event) {
    event.preventDefault()
    setCommonError('')
    setCommonSuccess('')

    const title = bookForm.title.trim()
    const author = bookForm.author.trim()
    const chapters = bookForm.chapters
      .map((chapter, index) => ({ order: index + 1, title: chapter.title.trim() || `Chapter ${index + 1}`, content: chapter.content.trim() }))
      .filter((chapter) => chapter.content)

    const errors = {}
    if (!title) errors.title = true
    if (!author) errors.author = true
    if (!chapters.length) errors.chapters = true

    if (Object.keys(errors).length > 0) {
      setBookFieldErrors(errors)
      if (!title || !author) {
        setCommonError('Title and author are required.')
      } else {
        setCommonError('At least one chapter needs some content.')
      }
      return
    }

    setBookFieldErrors({})

    const body = {
      title,
      author,
      description: bookForm.description.trim(),
      category: bookForm.category.trim(),
      language: bookForm.language.trim() || 'en',
      coverUrl: bookForm.coverUrl.trim(),
      chapters,
    }

    setSubmittingBook(true)
    try {
      if (editingBook) {
        const data = await apiFetch(`/api/books/${editingBook.id}/mine`, { method: 'PATCH', body })
        const successMsg = editingBook.status === 'published' ? 'Saved - sent back for admin review before it goes live again.' : 'Saved successfully!'
        setCommonSuccess(successMsg)
        onToast?.({ type: 'success', message: successMsg })
        setEditingBook({ id: editingBook.id, status: data.book.status })
      } else {
        await apiFetch('/api/books', { method: 'POST', body })
        const successMsg = 'Submitted! An admin will review your book before it goes live on the home page.'
        setCommonSuccess(successMsg)
        onToast?.({ type: 'success', message: successMsg })
        skipNextAutosave.current = true
        setBookForm({ ...emptyBookForm, author })
      }
      clearDraftAfterSave()
    } catch (err) {
      setCommonError(err.message)
    } finally {
      setSubmittingBook(false)
    }
  }

  if (isGuest) {
    return (
      <div className="write-page">
        <div className="section-heading">
          <div>
            <p className="mono-eyebrow">Community Creation</p>
            <h2>Stories & Books Creation Studio</h2>
          </div>
        </div>
        <p className="empty-state">Please log in to share stories, record voice notes, or author books.</p>
      </div>
    )
  }

  return (
    <div className="write-page">
      <div className="section-heading">
        <div>
          <p className="mono-eyebrow">Creation Studio</p>
          <h2>Share your voice & written stories</h2>
        </div>
        <p className="section-subtitle">
          Publish immediate audio reflections and social stories, or submit multi-chapter books for editorial review.
        </p>
      </div>

      {/* Top Creation Mode Bar: Dropdown Selector & Quick Tab Switcher */}
      <div className="write-mode-bar">
        <div className="write-dropdown-container">
          <label className="write-dropdown-label" htmlFor="write-mode-select">
            <i className="bi bi-pencil-square" /> Creation Mode:
          </label>
          <div className="write-select-shell">
            <select
              aria-label="Select creation mode"
              className="write-mode-native-select"
              id="write-mode-select"
              onChange={(e) => handleTabChange(e.target.value)}
              value={tab}
            >
              <option value="story">Write a Story & Voice</option>
              <option value="write">Write a Book (Multi-Chapter)</option>
              <option value="mine">My Submissions ({myBooks.length + myStories.length})</option>
            </select>
            <i className="bi bi-chevron-down write-select-icon" />
          </div>
        </div>

        <div className="community-form-row write-page-tabs" role="tablist">
          <button
            className={tab === 'story' ? 'active' : ''}
            onClick={() => handleTabChange('story')}
            type="button"
            role="tab"
            aria-selected={tab === 'story'}
          >
            <i className="bi bi-mic" /> Share a Story & Voice
          </button>
          <button
            className={tab === 'write' ? 'active' : ''}
            onClick={() => handleTabChange('write')}
            type="button"
            role="tab"
            aria-selected={tab === 'write'}
          >
            <i className="bi bi-book" /> Write a Book
          </button>
          <button
            className={tab === 'mine' ? 'active' : ''}
            onClick={() => handleTabChange('mine')}
            type="button"
            role="tab"
            aria-selected={tab === 'mine'}
          >
            <i className="bi bi-collection" /> My Submissions
          </button>
        </div>
      </div>

      {/* TAB 1: SHARE A STORY & AUDIO */}
      {tab === 'story' && (
        <div className="story-creator-panel">
          <div className="story-info-callout">
            <i className="bi bi-lightning-charge" />
            <div>
              <strong>Instant Publishing</strong>
              <span>Stories and voice notes are published directly to the community feed on the home page.</span>
            </div>
          </div>

          <form className="community-form story-creation-form" onSubmit={submitStory}>
            <div className="community-form-row">
              <label>
                Story title <span className="field-required-marker">*</span>
                <input
                  className={storyFieldErrors.title ? 'field-has-error' : ''}
                  onChange={(e) => {
                    setStoryForm((prev) => ({ ...prev, title: e.target.value }))
                    if (storyFieldErrors.title) setStoryFieldErrors((prev) => ({ ...prev, title: false }))
                  }}
                  placeholder="e.g. A rainy day reflection, Childhood memories..."
                  required
                  type="text"
                  value={storyForm.title}
                />
                {storyFieldErrors.title && (
                  <span className="field-error-hint">
                    <i className="bi bi-exclamation-circle" /> Please provide a title for your story.
                  </span>
                )}
              </label>
              <label>
                Topic tags (comma separated)
                <input
                  onChange={(e) => setStoryForm((prev) => ({ ...prev, tags: e.target.value }))}
                  placeholder="stories, reflection, life, fiction"
                  type="text"
                  value={storyForm.tags}
                />
              </label>
            </div>

            <label>
              Story text / caption <span className="field-required-marker">*</span>
              <textarea
                className={storyFieldErrors.content ? 'field-has-error' : ''}
                onChange={(e) => {
                  setStoryForm((prev) => ({ ...prev, content: e.target.value }))
                  if (storyFieldErrors.content) setStoryFieldErrors((prev) => ({ ...prev, content: false }))
                }}
                placeholder="Share your thoughts, experiences, life stories, or describe what your voice recording is about..."
                rows={5}
                required
                value={storyForm.content}
              />
              {storyFieldErrors.content && (
                <span className="field-error-hint">
                  <i className="bi bi-exclamation-circle" /> Please write your story content or reflection.
                </span>
              )}
            </label>

            {/* Voice Studio Recording Section */}
            <div className="voice-studio-container">
              <div className="voice-studio-header">
                <div>
                  <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="bi bi-soundwave" style={{ color: 'var(--app-accent)' }} />
                    Voice Recording Studio
                  </h4>
                  <small style={{ color: 'var(--app-muted)' }}>
                    Record audio live from your browser microphone or upload an audio file.
                  </small>
                </div>
                {audioPreviewUrl && (
                  <button className="ghost-button voice-discard-btn" onClick={discardRecording} type="button">
                    <i className="bi bi-trash" /> Discard audio
                  </button>
                )}
              </div>

              {!audioPreviewUrl ? (
                <div className="voice-recorder-controls">
                  {isRecording ? (
                    <div className="voice-recording-active">
                      <span className="voice-pulse-indicator" />
                      <span className="voice-timer">{formatTime(recordingSeconds)}</span>
                      <span className="voice-status-text">Recording in progress...</span>
                      <button className="danger-button voice-record-btn" onClick={stopRecording} type="button">
                        <i className="bi bi-stop-circle" /> Stop recording
                      </button>
                    </div>
                  ) : (
                    <div className="voice-recorder-idle">
                      <button className="primary-button voice-record-btn" onClick={startRecording} type="button">
                        <i className="bi bi-mic" /> Start recording voice
                      </button>
                      <span className="voice-divider">or</span>
                      <label className="ghost-button voice-upload-label">
                        <i className="bi bi-upload" /> Upload audio file
                        <input
                          accept="audio/*"
                          onChange={handleAudioFileUpload}
                          style={{ display: 'none' }}
                          type="file"
                        />
                      </label>
                    </div>
                  )}
                </div>
              ) : (
                <div className="voice-preview-wrapper">
                  <div className="voice-preview-meta">
                    <span className="voice-pill">
                      <i className="bi bi-check-circle" /> Audio attached
                    </span>
                    <span className="voice-duration">
                      Duration: {formatTime(recordingSeconds)}
                    </span>
                  </div>
                  <audio className="voice-audio-element" controls src={audioPreviewUrl}>
                    Your browser does not support the audio element.
                  </audio>
                </div>
              )}
            </div>

            <CoverImagePicker
              label="Story Cover Banner (Optional)"
              onChange={(nextUrl) => setStoryForm((prev) => ({ ...prev, coverUrl: nextUrl }))}
              onToast={onToast}
              type="story"
              uploadEndpoint="/api/stories/upload-image"
              value={storyForm.coverUrl}
            />

            {storyError && (
              <div className="modern-validation-banner error" role="alert">
                <div className="validation-banner-icon">
                  <i className="bi bi-exclamation-triangle-fill" />
                </div>
                <div className="validation-banner-text">
                  <strong>Please check your submission</strong>
                  <p>{storyError}</p>
                </div>
                <button
                  aria-label="Dismiss error"
                  className="validation-banner-dismiss"
                  onClick={() => setStoryError('')}
                  type="button"
                >
                  <i className="bi bi-x-lg" />
                </button>
              </div>
            )}
            {storySuccess && (
              <div className="modern-validation-banner success" role="status">
                <div className="validation-banner-icon">
                  <i className="bi bi-check-circle-fill" />
                </div>
                <div className="validation-banner-text">
                  <strong>Published!</strong>
                  <p>{storySuccess}</p>
                </div>
              </div>
            )}

            <div className="story-form-actions">
              <button className="primary-button" disabled={submittingStory || isRecording} type="submit">
                {submittingStory ? (
                  <>
                    <span className="admin-spin-small" /> Publishing...
                  </>
                ) : (
                  <>
                    <i className="bi bi-send" /> Share story to community
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 2: WRITE A BOOK (FULL CHAPTERED EDITOR) */}
      {tab === 'write' && (
        loadingEdit ? (
          <p className="inline-loading">
            <span className="admin-spin-small" /> Loading book...
          </p>
        ) : (
          <>
            {draftPrompt && (
              <p className="write-page-editing-banner">
                <i className="bi bi-clock-history" /> You have an unsaved draft from {new Date(draftPrompt.savedAt).toLocaleString()}.
                <button onClick={restoreDraft} type="button">
                  Restore
                </button>
                <button onClick={discardDraft} type="button">
                  Discard
                </button>
              </p>
            )}

            {editingBook && (
              <p className="write-page-editing-banner">
                <i className="bi bi-pencil-square" /> Editing an existing book.
                {editingBook.status === 'published' && ' Saving will send it back for admin review before the new version goes live.'}
                <button onClick={cancelEdit} type="button">
                  Cancel
                </button>
              </p>
            )}

            <div className="community-form-row write-page-tabs">
              <button className={!previewMode ? 'active' : ''} onClick={() => setPreviewMode(false)} type="button">
                <i className="bi bi-pencil" /> Edit chapters
              </button>
              <button className={previewMode ? 'active' : ''} onClick={() => setPreviewMode(true)} type="button">
                <i className="bi bi-eye" /> Preview book
              </button>
            </div>

            {previewMode ? (
              <BookPreview form={bookForm} />
            ) : (
              <form className="community-form" onSubmit={submitBook}>
                <div className="community-form-row">
                  <label>
                    Book title <span className="field-required-marker">*</span>
                    <input
                      className={bookFieldErrors.title ? 'field-has-error' : ''}
                      onChange={(e) => {
                        updateBookField('title', e.target.value)
                        if (bookFieldErrors.title) setBookFieldErrors((prev) => ({ ...prev, title: false }))
                      }}
                      required
                      type="text"
                      value={bookForm.title}
                    />
                    {bookFieldErrors.title && (
                      <span className="field-error-hint">
                        <i className="bi bi-exclamation-circle" /> Book title is required.
                      </span>
                    )}
                  </label>
                  <label>
                    Author name <span className="field-required-marker">*</span>
                    <input
                      className={bookFieldErrors.author ? 'field-has-error' : ''}
                      onChange={(e) => {
                        updateBookField('author', e.target.value)
                        if (bookFieldErrors.author) setBookFieldErrors((prev) => ({ ...prev, author: false }))
                      }}
                      required
                      type="text"
                      value={bookForm.author}
                    />
                    {bookFieldErrors.author && (
                      <span className="field-error-hint">
                        <i className="bi bi-exclamation-circle" /> Author name is required.
                      </span>
                    )}
                  </label>
                </div>
                <label>
                  <span className="admin-field-label-row">
                    Description
                    <button
                      className="ghost-button admin-ai-fill-button"
                      disabled={aiSummarizing}
                      onClick={generateAiSummary}
                      type="button"
                    >
                      {aiSummarizing ? (
                        <>
                          <span className="admin-spin-small" /> Summarizing...
                        </>
                      ) : (
                        <>
                          <i className="bi bi-stars" /> Summarize with AI
                        </>
                      )}
                    </button>
                  </span>
                  <textarea
                    onChange={(e) => updateBookField('description', e.target.value)}
                    placeholder="Write a synopsis or click 'Summarize with AI' after adding your chapters."
                    value={bookForm.description}
                  />
                  {aiSummaryError && <small className="admin-validation-error">{aiSummaryError}</small>}
                </label>
                <div className="community-form-row">
                  <label>
                    Category
                    <input onChange={(e) => updateBookField('category', e.target.value)} type="text" value={bookForm.category} />
                  </label>
                  <label>
                    Language
                    <input onChange={(e) => updateBookField('language', e.target.value)} type="text" value={bookForm.language} />
                  </label>
                </div>
                <CoverImagePicker
                  label="Book Cover Image (Optional)"
                  onChange={(nextUrl) => updateBookField('coverUrl', nextUrl)}
                  onToast={onToast}
                  type="book"
                  uploadEndpoint="/api/books/upload-cover"
                  value={bookForm.coverUrl}
                />

                <h3>Chapters <span className="field-required-marker">*</span></h3>
                <div className="write-page-chapters">
                  {bookForm.chapters.map((chapter, index) => (
                    <div className="write-page-chapter" key={index}>
                      <div className="write-page-chapter-header">
                        <strong>Chapter {index + 1}</strong>
                        <div className="write-page-chapter-actions">
                          <button disabled={index === 0} onClick={() => moveChapter(index, -1)} type="button" aria-label="Move chapter up">
                            <i className="bi bi-arrow-up" />
                          </button>
                          <button disabled={index === bookForm.chapters.length - 1} onClick={() => moveChapter(index, 1)} type="button" aria-label="Move chapter down">
                            <i className="bi bi-arrow-down" />
                          </button>
                          <button disabled={bookForm.chapters.length === 1} onClick={() => removeChapter(index)} type="button" aria-label="Delete chapter">
                            <i className="bi bi-trash" />
                          </button>
                        </div>
                      </div>
                      <input
                        onChange={(e) => updateChapter(index, 'title', e.target.value)}
                        placeholder={`Chapter ${index + 1} title (optional)`}
                        type="text"
                        value={chapter.title}
                      />
                      <div className="write-page-format-toolbar">
                        <button onClick={() => wrapSelection(index, '**')} title="Bold" type="button">
                          <i className="bi bi-type-bold" />
                        </button>
                        <button onClick={() => wrapSelection(index, '*')} title="Italic" type="button">
                          <i className="bi bi-type-italic" />
                        </button>
                      </div>
                      <textarea
                        className={`write-page-chapter-content${bookFieldErrors.chapters && !chapter.content.trim() ? ' field-has-error' : ''}`}
                        onChange={(e) => {
                          updateChapter(index, 'content', e.target.value)
                          if (bookFieldErrors.chapters) setBookFieldErrors((prev) => ({ ...prev, chapters: false }))
                        }}
                        placeholder="Write this chapter here... select text and use the Bold/Italic buttons above to format it."
                        ref={(el) => {
                          textareaRefs.current[index] = el
                        }}
                        value={chapter.content}
                      />
                    </div>
                  ))}
                </div>
                <button className="ghost-button" onClick={addChapter} type="button">
                  <i className="bi bi-plus-lg" /> Add chapter
                </button>

                {commonError && (
                  <div className="modern-validation-banner error" role="alert">
                    <div className="validation-banner-icon">
                      <i className="bi bi-exclamation-triangle-fill" />
                    </div>
                    <div className="validation-banner-text">
                      <strong>Please check your submission</strong>
                      <p>{commonError}</p>
                    </div>
                    <button
                      aria-label="Dismiss error"
                      className="validation-banner-dismiss"
                      onClick={() => setCommonError('')}
                      type="button"
                    >
                      <i className="bi bi-x-lg" />
                    </button>
                  </div>
                )}
                {commonSuccess && (
                  <div className="modern-validation-banner success" role="status">
                    <div className="validation-banner-icon">
                      <i className="bi bi-check-circle-fill" />
                    </div>
                    <div className="validation-banner-text">
                      <strong>Success!</strong>
                      <p>{commonSuccess}</p>
                    </div>
                  </div>
                )}

                <button className="primary-button" disabled={submittingBook} type="submit">
                  {submittingBook ? 'Saving...' : editingBook ? 'Save changes' : 'Submit for review'}
                </button>
              </form>
            )}
          </>
        )
      )}

      {/* TAB 3: MY SUBMISSIONS (STORIES & BOOKS) */}
      {tab === 'mine' && (
        <div className="my-submissions-container">
          <div className="community-form-row write-page-tabs my-submissions-subtabs">
            <button
              className={mineSubTab === 'stories' ? 'active' : ''}
              onClick={() => setMineSubTab('stories')}
              type="button"
            >
              <i className="bi bi-chat-quote" /> Stories & Audio ({myStories.length})
            </button>
            <button
              className={mineSubTab === 'books' ? 'active' : ''}
              onClick={() => setMineSubTab('books')}
              type="button"
            >
              <i className="bi bi-book" /> Books ({myBooks.length})
            </button>
          </div>

          {commonSuccess && (
            <div className="modern-validation-banner success" style={{ marginBottom: '16px' }}>
              <div className="validation-banner-icon">
                <i className="bi bi-check-circle-fill" />
              </div>
              <div className="validation-banner-text">
                <p>{commonSuccess}</p>
              </div>
            </div>
          )}
          {commonError && (
            <div className="modern-validation-banner error" style={{ marginBottom: '16px' }}>
              <div className="validation-banner-icon">
                <i className="bi bi-exclamation-triangle-fill" />
              </div>
              <div className="validation-banner-text">
                <p>{commonError}</p>
              </div>
            </div>
          )}

          {loadingMine ? (
            <p className="inline-loading">
              <span className="admin-spin-small" /> Loading your submissions...
            </p>
          ) : mineSubTab === 'stories' ? (
            myStories.length ? (
              <div className="my-submissions-list">
                {myStories.map((story) => {
                  const storyId = story.id || story._id
                  return (
                    <div className="my-submission-card my-submission-story-card" key={storyId}>
                      {/* Story Cover Frame */}
                      <div className="submission-story-cover-frame">
                        {story.coverUrl ? (
                          <img
                            alt={story.title}
                            className="submission-story-cover-img"
                            src={story.coverUrl}
                          />
                        ) : (
                          <div className="submission-story-cover-none">
                            <i className="bi bi-card-image" />
                            <span>None</span>
                          </div>
                        )}
                      </div>

                      {/* Story Details */}
                      <div className="submission-card-main">
                        <div className="submission-card-header-row">
                          <div className="submission-card-title-group">
                            <h3 className="submission-card-title">{story.title}</h3>
                            <div className="submission-badges-row">
                              <span className="admin-status status-published">Published</span>
                              {story.type === 'audio-story' && (
                                <span className="submission-audio-pill">
                                  <i className="bi bi-soundwave" /> Audio
                                </span>
                              )}
                              <span className="submission-meta-pill">
                                {new Date(story.createdAt).toLocaleDateString()}
                              </span>
                              <span className="submission-meta-pill">
                                {story.likesCount || 0} likes · {story.views || 0} views
                              </span>
                            </div>
                          </div>

                          <div className="submission-card-actions">
                            <button
                              className="danger-button write-delete-btn"
                              onClick={() => setDeleteConfirmStory(story)}
                              type="button"
                            >
                              <i className="bi bi-trash" /> Delete
                            </button>
                          </div>
                        </div>

                        <p className="submission-story-excerpt">
                          {story.content.slice(0, 220)}{story.content.length > 220 ? '...' : ''}
                        </p>

                        {story.audioUrl && (
                          <div className="submission-audio-container">
                            <audio controls preload="none" src={story.audioUrl} style={{ width: '100%', height: '36px' }} />
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="empty-state">You haven't shared any stories yet.</p>
            )
          ) : myBooks.length ? (
            <div className="my-submissions-list">
              {myBooks.map((book) => {
                const bookId = book.id || book._id
                const isHidden = book.status === 'hidden'
                const hasRejection = Boolean(book.rejectionReason)

                return (
                  <div className="my-submission-card my-submission-book-card" key={bookId}>
                    {/* Book Cover Frame (2:3 Portrait) */}
                    <div className="submission-book-cover-frame">
                      {book.coverUrl ? (
                        <img
                          alt={book.title}
                          className="submission-book-cover-img"
                          src={book.coverUrl}
                        />
                      ) : (
                        <div className="submission-book-cover-none">
                          <i className="bi bi-journal-text" />
                          <span>None</span>
                        </div>
                      )}
                    </div>

                    {/* Book Details */}
                    <div className="submission-card-main">
                      <div className="submission-card-header-row">
                        <div className="submission-card-title-group">
                          <h3
                            className={`submission-card-title${book.status === 'published' ? ' clickable' : ''}`}
                            onClick={() => book.status === 'published' && onDetail?.(book)}
                          >
                            {book.title}
                          </h3>
                          <div className="submission-badges-row">
                            <span className={`admin-status status-${book.status || 'draft'}`}>
                              {isHidden ? 'Rejected / Ignored' : book.status || 'draft'}
                            </span>
                            {book.category && (
                              <span className="submission-meta-pill genre">{book.category}</span>
                            )}
                            {book.chapters?.length ? (
                              <span className="submission-meta-pill">
                                {book.chapters.length} chapter{book.chapters.length > 1 ? 's' : ''}
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <div className="submission-card-actions">
                          <button className="edit-button" onClick={() => startEdit(book)} type="button">
                            <i className="bi bi-pencil-square" /> Edit
                          </button>
                          <button
                            className="danger-button write-delete-btn"
                            onClick={() => setDeleteConfirmBook(book)}
                            type="button"
                          >
                            <i className="bi bi-trash" /> Delete
                          </button>
                        </div>
                      </div>

                      <p className="submission-book-author">
                        <i className="bi bi-pen" /> By {book.author || 'Author'}
                      </p>

                      <p className="submission-status-hint">
                        {book.status === 'published'
                          ? 'Published & visible in catalog'
                          : isHidden
                          ? 'Ignored by admin (see note below)'
                          : 'Waiting on admin review'}
                      </p>

                      {(isHidden || hasRejection) && (
                        <div className="author-rejection-note">
                          <div className="rejection-note-header">
                            <i className="bi bi-exclamation-triangle-fill" />
                            <strong>Admin note:</strong>
                          </div>
                          <p>{book.rejectionReason || 'Admin ignored or rejected this book. You can edit content and re-submit anytime.'}</p>
                          <span className="rejection-note-hint">Tip: Click "Edit" above to revise your content and re-submit for admin review.</span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="empty-state">You haven't submitted a book yet.</p>
          )}
        </div>
      )}

      {/* Delete Book Confirmation Modal */}
      {deleteConfirmBook && (
        <div
          aria-labelledby="delete-authored-title"
          aria-modal="true"
          className="confirmation-dialog-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deletingBook) setDeleteConfirmBook(null)
          }}
          role="dialog"
        >
          <div className="confirmation-dialog-card">
            <button
              aria-label="Close"
              className="confirmation-dialog-close"
              disabled={deletingBook}
              onClick={() => setDeleteConfirmBook(null)}
              type="button"
            >
              <i className="bi bi-x-lg" />
            </button>
            <div className="confirmation-dialog-icon danger">
              <i className="bi bi-trash3-fill" />
            </div>
            <div className="confirmation-dialog-header">
              <span className="confirmation-dialog-eyebrow">Confirm Deletion</span>
              <h2 id="delete-authored-title">Delete book</h2>
            </div>
            <div className="confirmation-dialog-body">
              <p>
                Are you sure you want to permanently delete <strong>"{deleteConfirmBook.title}"</strong>?
              </p>
              <p className="confirmation-dialog-subtext">
                All chapters and draft contents will be permanently removed.
              </p>
            </div>
            <div className="confirmation-dialog-footer">
              <button
                className="ghost-button confirmation-cancel-btn"
                disabled={deletingBook}
                onClick={() => setDeleteConfirmBook(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="danger-button confirmation-confirm-btn"
                disabled={deletingBook}
                onClick={handleDeleteBook}
                type="button"
              >
                <i className="bi bi-trash" />
                <span>{deletingBook ? 'Deleting...' : 'Delete book'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Story Confirmation Modal */}
      {deleteConfirmStory && (
        <div
          aria-labelledby="delete-story-title"
          aria-modal="true"
          className="confirmation-dialog-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deletingStory) setDeleteConfirmStory(null)
          }}
          role="dialog"
        >
          <div className="confirmation-dialog-card">
            <button
              aria-label="Close"
              className="confirmation-dialog-close"
              disabled={deletingStory}
              onClick={() => setDeleteConfirmStory(null)}
              type="button"
            >
              <i className="bi bi-x-lg" />
            </button>
            <div className="confirmation-dialog-icon danger">
              <i className="bi bi-trash3-fill" />
            </div>
            <div className="confirmation-dialog-header">
              <span className="confirmation-dialog-eyebrow">Confirm Deletion</span>
              <h2 id="delete-story-title">Delete story</h2>
            </div>
            <div className="confirmation-dialog-body">
              <p>
                Are you sure you want to delete <strong>"{deleteConfirmStory.title}"</strong>?
              </p>
              <p className="confirmation-dialog-subtext">
                It will be removed from the community feed.
              </p>
            </div>
            <div className="confirmation-dialog-footer">
              <button
                className="ghost-button confirmation-cancel-btn"
                disabled={deletingStory}
                onClick={() => setDeleteConfirmStory(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="danger-button confirmation-confirm-btn"
                disabled={deletingStory}
                onClick={handleDeleteStory}
                type="button"
              >
                <i className="bi bi-trash" />
                <span>{deletingStory ? 'Deleting...' : 'Delete story'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function BookPreview({ form }) {
  const chaptersWithContent = form.chapters.filter((chapter) => chapter.content.trim())

  return (
    <article className="reader-frame write-page-preview">
      <div className="reader-chapter-header">
        <div>
          <p className="mono-eyebrow">Preview</p>
          <h2>{form.title || 'Untitled'}</h2>
        </div>
      </div>
      <p className="write-page-preview-author">{form.author || 'Unknown author'}</p>

      {chaptersWithContent.length ? (
        chaptersWithContent.map((chapter, index) => (
          <div className="reader-text-page" key={index}>
            <p className="reader-page-kicker">{chapter.title || `Chapter ${index + 1}`}</p>
            {chapter.content
              .split(/\n\n+/)
              .filter((paragraph) => paragraph.trim())
              .map((paragraph, paragraphIndex) => (
                // eslint-disable-next-line react/no-danger
                <p key={paragraphIndex} dangerouslySetInnerHTML={{ __html: renderLiteMarkdown(paragraph) }} />
              ))}
          </div>
        ))
      ) : (
        <p className="empty-state">Write something in a chapter to see it previewed here.</p>
      )}
    </article>
  )
}

export default WritePage
