import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import BooksPage from '../BooksPage'
import { publicApiFetch } from '../../../utils/apiClient'

const mockNavigateTo = vi.fn()

vi.mock('../../../context/NavigationContext', () => ({
  useNavigation: () => ({
    navigateTo: mockNavigateTo,
  }),
}))

vi.mock('../../../utils/apiClient', () => ({
  publicApiFetch: vi.fn(),
}))

const mockBooks = [
  {
    _id: 'book-1',
    id: 'book-1',
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
    source: 'Gutenberg',
    type: 'ebook',
    views: 12000,
    downloadCount: 45000,
    cover: 'https://example.com/cover1.jpg',
  },
  {
    _id: 'book-2',
    id: 'book-2',
    title: 'Frankenstein',
    author: 'Mary Shelley',
    source: 'Gutenberg',
    type: 'ebook',
    views: 8500,
    downloadCount: 32000,
    cover: 'https://example.com/cover2.jpg',
  },
]

describe('BooksPage - Catalog Browsing and View Modes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    publicApiFetch.mockResolvedValue({
      items: mockBooks,
      total: 2,
      page: 1,
      limit: 24,
    })
  })

  test('renders catalog hero, genre chips, layout toggles and books', async () => {
    render(
      <MemoryRouter initialEntries={['/books?type=ebook']}>
        <BooksPage />
      </MemoryRouter>
    )

    expect(screen.getByText('Ebooks Catalog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Fiction$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Science Fiction$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Grid layout/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Carousel layout/i })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Pride and Prejudice')).toBeInTheDocument()
      expect(screen.getByText('Frankenstein')).toBeInTheDocument()
    })
  })

  test('clicking a genre chip reloads items filtered by that category', async () => {
    render(
      <MemoryRouter initialEntries={['/books?type=ebook']}>
        <BooksPage />
      </MemoryRouter>
    )

    const mysteryChip = screen.getByRole('button', { name: /Mystery/i })
    fireEvent.click(mysteryChip)

    await waitFor(() => {
      expect(publicApiFetch).toHaveBeenCalledWith(expect.stringContaining('category=Mystery'))
    })
  })

  test('clicking Read button on a book card navigates to reader page', async () => {
    render(
      <MemoryRouter initialEntries={['/books?type=ebook']}>
        <BooksPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Pride and Prejudice')).toBeInTheDocument()
    })

    const readButtons = screen.getAllByRole('button', { name: /Read/i })
    fireEvent.click(readButtons[0])

    expect(mockNavigateTo).toHaveBeenCalledWith('read', { query: 'id=book-1' })
  })

  test('toggling view mode switches to carousel spotlight', async () => {
    render(
      <MemoryRouter initialEntries={['/books?type=ebook']}>
        <BooksPage />
      </MemoryRouter>
    )

    const carouselToggle = screen.getByRole('button', { name: /Carousel layout/i })
    fireEvent.click(carouselToggle)

    expect(carouselToggle).toHaveClass('active')
  })
})
