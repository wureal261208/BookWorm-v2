import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import BookCarousel from '../BookCarousel'

const book = (id) => ({
  id,
  title: `Book ${id}`,
  author: 'Someone',
  category: 'Fiction',
  description: 'A short description.',
})

const noop = vi.fn()

describe('BookCarousel', () => {
  test('renders nothing for an empty list', () => {
    const { container } = render(<BookCarousel books={[]} onDetail={noop} onFavorite={noop} onRead={noop} />)
    expect(container).toBeEmptyDOMElement()
  })

  test('hides the prev/next arrows when there is only one book - nothing to scroll to', () => {
    render(<BookCarousel books={[book('1')]} onDetail={noop} onFavorite={noop} onRead={noop} />)
    expect(screen.queryByRole('button', { name: /scroll to previous books/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /scroll to more books/i })).not.toBeInTheDocument()
  })

  test('shows the arrows once there is more than one book', () => {
    render(<BookCarousel books={[book('1'), book('2')]} onDetail={noop} onFavorite={noop} onRead={noop} />)
    expect(screen.getByRole('button', { name: /scroll to previous books/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /scroll to more books/i })).toBeInTheDocument()
  })
})
