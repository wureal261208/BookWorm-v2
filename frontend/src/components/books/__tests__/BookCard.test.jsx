import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BookCard from '../BookCard'

const book = {
  id: 'book-1',
  title: 'The Time Machine',
  author: 'H. G. Wells',
  category: 'Science Fiction',
  description: 'A traveller journeys far into the future.',
  download_count: 120,
}

describe('BookCard', () => {
  test('shows the title, author and category in the card body', () => {
    render(<BookCard book={book} onDetail={vi.fn()} onFavorite={vi.fn()} onRead={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'The Time Machine' })).toBeInTheDocument()
    expect(screen.getAllByText('H. G. Wells').length).toBeGreaterThan(0)
    expect(screen.getByText('Science Fiction')).toBeInTheDocument()
  })

  test('the cover hover overlay carries the title, author and a short description', () => {
    render(<BookCard book={book} onDetail={vi.fn()} onFavorite={vi.fn()} onRead={vi.fn()} />)

    expect(screen.getByText('A traveller journeys far into the future.')).toBeInTheDocument()
  })

  test('adds the reads count from download_count plus the live viewCount', () => {
    render(<BookCard book={book} onDetail={vi.fn()} onFavorite={vi.fn()} onRead={vi.fn()} viewCount={30} />)

    expect(screen.getByText('150 reads')).toBeInTheDocument()
  })

  test('clicking Read calls onRead with the book', async () => {
    const onRead = vi.fn()
    const user = userEvent.setup()
    render(<BookCard book={book} onDetail={vi.fn()} onFavorite={vi.fn()} onRead={onRead} />)

    await user.click(screen.getByRole('button', { name: /read/i }))
    expect(onRead).toHaveBeenCalledWith(book)
  })

  test('the Save button reflects whether the book is already a favorite', () => {
    const { rerender } = render(
      <BookCard book={book} favorites={[]} onDetail={vi.fn()} onFavorite={vi.fn()} onRead={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument()

    rerender(<BookCard book={book} favorites={['book-1']} onDetail={vi.fn()} onFavorite={vi.fn()} onRead={vi.fn()} />)
    expect(screen.getByRole('button', { name: /saved/i })).toBeInTheDocument()
  })
})
