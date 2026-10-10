import { useState, useRef } from 'react'
import { apiFetch } from '../../utils/apiClient'

/**
 * Reusable Cover Image Picker supporting both file uploads (with drag & drop)
 * and direct image links, with responsive preview and explicit format/aspect-ratio guidelines.
 *
 * @param {Object} props
 * @param {string} props.value Current image URL (or base64 data URL)
 * @param {Function} props.onChange Callback with next image URL
 * @param {'book' | 'story'} [props.type='book'] Target type: determines aspect ratio and guidance
 * @param {string} [props.uploadEndpoint] Endpoint to upload file to (e.g. '/api/books/upload-cover' or '/api/stories/upload-image')
 * @param {string} [props.label] Field label
 * @param {Function} [props.onToast] Toast notification helper
 */
function CoverImagePicker({
  value = '',
  onChange,
  type = 'book',
  uploadEndpoint = type === 'story' ? '/api/stories/upload-image' : '/api/books/upload-cover',
  label = type === 'story' ? 'Story Cover Banner' : 'Book Cover Image',
  onToast,
}) {
  const [mode, setMode] = useState('upload') // 'upload' | 'link'
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [validationError, setValidationError] = useState('')
  const fileInputRef = useRef(null)

  const isBook = type === 'book'
  const recommendedRatio = isBook ? '2:3 Portrait' : '16:9 Landscape'
  const recommendedDim = isBook ? '600 × 900 px (or 800 × 1200 px)' : '1200 × 675 px (or 800 × 450 px)'
  const previewRatioStyle = isBook ? { aspectRatio: '2 / 3', width: '130px' } : { aspectRatio: '16 / 9', width: '220px' }

  async function handleFileSelected(file) {
    if (!file) return
    setValidationError('')
    setImageError(false)

    // Check file type
    if (!file.type.startsWith('image/')) {
      const err = 'Please select a valid image file (JPG, PNG, WebP).'
      setValidationError(err)
      onToast?.({ type: 'error', message: err })
      return
    }

    // Check file size (max 5MB)
    const MAX_SIZE = 5 * 1024 * 1024
    if (file.size > MAX_SIZE) {
      const err = `Image file is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum allowed size is 5 MB.`
      setValidationError(err)
      onToast?.({ type: 'error', message: err })
      return
    }

    setUploading(true)

    try {
      const formData = new FormData()
      formData.append('image', file)

      const res = await apiFetch(uploadEndpoint, {
        method: 'POST',
        body: formData,
      })

      const uploadedUrl = res?.data?.url || res?.data?.imageUrl || res?.url
      if (uploadedUrl) {
        onChange?.(uploadedUrl)
        onToast?.({ type: 'success', message: 'Cover image uploaded successfully!' })
      } else {
        throw new Error('Upload succeeded but server did not return image URL.')
      }
    } catch (err) {
      // Graceful fallback to FileReader base64 if server endpoint is unavailable
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          onChange?.(reader.result)
          onToast?.({ type: 'info', message: 'Image loaded locally.' })
        }
      }
      reader.onerror = () => {
        setValidationError(err.message || 'Failed to process image.')
        onToast?.({ type: 'error', message: err.message || 'Upload failed.' })
      }
      reader.readAsDataURL(file)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    setIsDragging(false)
    const droppedFile = e.dataTransfer?.files?.[0]
    if (droppedFile) {
      handleFileSelected(droppedFile)
    }
  }

  function handleRemove() {
    onChange?.('')
    setImageError(false)
    setValidationError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="cover-picker-widget">
      <div className="cover-picker-header">
        <label className="cover-picker-label">
          <i className="bi bi-image" /> {label} <span className="optional-tag">(optional)</span>
        </label>
        <div className="cover-picker-mode-switch">
          <button
            className={`cover-mode-btn ${mode === 'upload' ? 'active' : ''}`}
            onClick={() => setMode('upload')}
            type="button"
          >
            <i className="bi bi-cloud-arrow-up" /> Upload file
          </button>
          <button
            className={`cover-mode-btn ${mode === 'link' ? 'active' : ''}`}
            onClick={() => setMode('link')}
            type="button"
          >
            <i className="bi bi-link-45deg" /> Image URL
          </button>
        </div>
      </div>

      {/* Format & Specification Guidelines Badge */}
      <div className="cover-guidelines-box">
        <div className="guideline-item">
          <i className="bi bi-aspect-ratio" />
          <span><strong>Ratio:</strong> {recommendedRatio} ({recommendedDim})</span>
        </div>
        <div className="guideline-item">
          <i className="bi bi-file-earmark-check" />
          <span><strong>Formats:</strong> JPG, PNG, WebP (max 5 MB)</span>
        </div>
        <div className="guideline-item">
          <i className="bi bi-arrows-fullscreen" />
          <span><strong>Display:</strong> Responsive fit (<code style={{ fontSize: '0.88em' }}>object-fit: cover</code>)</span>
        </div>
      </div>

      <div className="cover-picker-body">
        {value ? (
          /* Live Image Preview State */
          <div className="cover-preview-card">
            <div className="cover-preview-media" style={previewRatioStyle}>
              {!imageError ? (
                <img
                  alt="Cover preview"
                  onError={() => setImageError(true)}
                  src={value}
                />
              ) : (
                <div className="cover-preview-failed">
                  <i className="bi bi-exclamation-triangle" />
                  <span>Failed to load image</span>
                </div>
              )}
            </div>
            <div className="cover-preview-details">
              <div className="cover-source-tag">
                <i className={`bi ${value.startsWith('data:') ? 'bi-file-earmark-image' : value.startsWith('/uploads/') ? 'bi-check-circle-fill' : 'bi-link'}`} />
                <span>
                  {value.startsWith('/uploads/')
                    ? 'Uploaded file'
                    : value.startsWith('data:')
                    ? 'Local preview'
                    : 'External web link'}
                </span>
              </div>
              <p className="cover-url-text" title={value}>
                {value.length > 55 ? `${value.slice(0, 52)}...` : value}
              </p>
              <div className="cover-preview-actions">
                <button
                  className="ghost-button cover-change-btn"
                  onClick={() => {
                    if (mode === 'upload' && fileInputRef.current) {
                      fileInputRef.current.click()
                    }
                  }}
                  type="button"
                >
                  <i className="bi bi-arrow-repeat" /> Change
                </button>
                <button
                  className="ghost-button cover-remove-btn"
                  onClick={handleRemove}
                  type="button"
                >
                  <i className="bi bi-trash" /> Remove
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Input State */
          <div className="cover-input-container">
            {mode === 'upload' ? (
              <div
                className={`cover-dropzone ${isDragging ? 'dragging' : ''} ${uploading ? 'uploading' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onDragLeave={() => setIsDragging(false)}
                onDragOver={(e) => {
                  e.preventDefault()
                  setIsDragging(true)
                }}
                onDrop={handleDrop}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    fileInputRef.current?.click()
                  }
                }}
              >
                <input
                  accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                  aria-label="Upload cover image"
                  onChange={(e) => handleFileSelected(e.target.files?.[0])}
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  type="file"
                />
                {uploading ? (
                  <div className="dropzone-status">
                    <span className="admin-spin-small" />
                    <span>Uploading image...</span>
                  </div>
                ) : (
                  <div className="dropzone-content">
                    <div className="dropzone-icon">
                      <i className="bi bi-cloud-arrow-up" />
                    </div>
                    <strong>Click to browse or drag & drop cover image</strong>
                    <p>PNG, JPG, WebP up to 5 MB • Automatically fitted to {recommendedRatio}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="cover-url-input-wrap">
                <div className="cover-url-input-field">
                  <i className="bi bi-link-45deg" />
                  <input
                    aria-label="Cover image URL"
                    onChange={(e) => {
                      setValidationError('')
                      setImageError(false)
                      onChange?.(e.target.value.trim())
                    }}
                    placeholder={
                      isBook
                        ? 'https://example.com/books/my-cover.jpg'
                        : 'https://images.unsplash.com/... or paste image URL'
                    }
                    type="url"
                    value={value}
                  />
                </div>
                <small className="cover-url-hint">
                  Paste any publicly accessible image link. Recommended {recommendedRatio} for optimal display.
                </small>
              </div>
            )}
          </div>
        )}

        {validationError && (
          <p className="cover-validation-error">
            <i className="bi bi-exclamation-circle" /> {validationError}
          </p>
        )}
      </div>
    </div>
  )
}

export default CoverImagePicker
