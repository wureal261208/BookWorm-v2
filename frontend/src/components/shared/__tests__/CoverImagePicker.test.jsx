import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CoverImagePicker from '../CoverImagePicker'

describe('CoverImagePicker', () => {
  it('renders correctly with upload and link modes and guidelines', () => {
    render(
      <CoverImagePicker
        label="Book Cover Image"
        onChange={vi.fn()}
        type="book"
        value=""
      />
    )

    expect(screen.getByText('Book Cover Image')).toBeInTheDocument()
    expect(screen.getByText('Upload file')).toBeInTheDocument()
    expect(screen.getByText('Image URL')).toBeInTheDocument()
    expect(screen.getAllByText(/2:3 Portrait/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/Click to browse or drag & drop cover image/i)).toBeInTheDocument()
  })

  it('switches to URL input mode and accepts direct link', () => {
    const handleChange = vi.fn()
    render(
      <CoverImagePicker
        label="Story Cover Banner"
        onChange={handleChange}
        type="story"
        value=""
      />
    )

    const urlModeBtn = screen.getByText('Image URL')
    fireEvent.click(urlModeBtn)

    const input = screen.getByLabelText('Cover image URL')
    expect(input).toBeInTheDocument()

    fireEvent.change(input, { target: { value: 'https://images.unsplash.com/photo-123' } })
    expect(handleChange).toHaveBeenCalledWith('https://images.unsplash.com/photo-123')
  })

  it('displays image preview and allows removal', () => {
    const handleChange = vi.fn()
    render(
      <CoverImagePicker
        label="Book Cover Image"
        onChange={handleChange}
        type="book"
        value="https://example.com/cover.jpg"
      />
    )

    const img = screen.getByAltText('Cover preview')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', 'https://example.com/cover.jpg')

    const removeBtn = screen.getByText('Remove')
    fireEvent.click(removeBtn)
    expect(handleChange).toHaveBeenCalledWith('')
  })
})
