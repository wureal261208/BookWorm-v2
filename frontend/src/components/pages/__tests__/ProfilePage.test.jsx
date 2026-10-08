import { describe, expect, test, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ProfilePage from '../ProfilePage'

vi.mock('../../utils/apiClient', () => ({
  apiFetch: vi.fn().mockImplementation((url) => {
    if (url.includes('/api/users/me/shelf')) return Promise.resolve({ shelf: [] })
    if (url.includes('/api/users/me/progress')) return Promise.resolve({ progress: [] })
    if (url.includes('/api/books/mine')) return Promise.resolve({ books: [] })
    return Promise.resolve({})
  }),
  publicApiFetch: vi.fn().mockResolvedValue({}),
}))

const mockAccount = {
  id: 'usr-123',
  displayId: 'BW-0099',
  name: 'Alex Reader',
  email: 'alex@example.com',
  role: 'customer',
  avatar: '',
}

const mockBooks = [
  {
    id: 'book-1',
    _id: 'book-1',
    title: 'Sherlock Holmes',
    author: 'Arthur Conan Doyle',
  },
  {
    id: 'book-2',
    _id: 'book-2',
    title: 'Dracula',
    author: 'Bram Stoker',
  },
]

describe('ProfilePage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  test('renders profile page without crashing and displays role and member info', () => {
    render(
      <ProfilePage
        account={mockAccount}
        books={mockBooks}
        shelf={[]}
        progress={{}}
      />
    )

    expect(screen.getByText('Member profile')).toBeInTheDocument()
    expect(screen.getAllByText('Member').length).toBeGreaterThan(0)
    expect(screen.getByText('BW-0099')).toBeInTheDocument()
    expect(screen.getByText('New Explorer')).toBeInTheDocument()
  })

  test('renders reading stats and streak correctly', () => {
    const today = new Date().toISOString().slice(0, 10)
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

    render(
      <ProfilePage
        account={mockAccount}
        books={mockBooks}
        shelf={[
          { bookId: 'book-1', status: 'reading' },
          { bookId: 'book-2', status: 'finished' },
        ]}
        progress={{ 'book-1': 45, 'book-2': 100 }}
        readingDays={[today, yesterday]}
      />
    )

    expect(screen.getByText('Reading activity & goals')).toBeInTheDocument()
    expect(screen.getAllByText('Reading').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Finished').length).toBeGreaterThan(0)
    expect(screen.getByText('Day streak')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument() // 2 consecutive days
  })

  test('renders quick resume card and triggers onRead', () => {
    const onRead = vi.fn()
    render(
      <ProfilePage
        account={mockAccount}
        books={mockBooks}
        shelf={[{ bookId: 'book-1', status: 'reading' }]}
        progress={{ 'book-1': 55 }}
        onRead={onRead}
      />
    )

    expect(screen.getByText('Recently read')).toBeInTheDocument()
    expect(screen.getAllByText('55% completed').length).toBeGreaterThan(0)

    const continueBtn = screen.getByRole('button', { name: /Resume reading/i })
    fireEvent.click(continueBtn)
    expect(onRead).toHaveBeenCalledWith(expect.objectContaining({ title: 'Sherlock Holmes' }))
  })

  test('allows editing the reading goal', () => {
    render(
      <ProfilePage
        account={mockAccount}
        books={mockBooks}
        shelf={[{ bookId: 'book-2', status: 'finished' }]}
        progress={{ 'book-2': 100 }}
      />
    )

    const editGoalBtn = screen.getByRole('button', { name: /Edit goal/i })
    fireEvent.click(editGoalBtn)

    const goalInput = screen.getByLabelText(/Target books this year/i)
    fireEvent.change(goalInput, { target: { value: '25' } })

    const saveBtn = screen.getByRole('button', { name: /^Save$/i })
    fireEvent.click(saveBtn)

    expect(screen.getByText(/1 \/ 25 books/i)).toBeInTheDocument()
  })

  test('renders authored books tab and supports navigating to write page', async () => {
    const onNavigate = vi.fn()
    render(
      <ProfilePage
        account={mockAccount}
        books={mockBooks}
        shelf={[]}
        progress={{}}
        onNavigate={onNavigate}
      />
    )

    const authoredTab = screen.getByRole('tab', { name: /Authored/i })
    expect(authoredTab).toBeInTheDocument()
    fireEvent.click(authoredTab)

    expect(await screen.findByText(/You have not written or published any books yet/i)).toBeInTheDocument()
    const writeBtn = screen.getByRole('button', { name: /Write \/ Publish now/i })
    fireEvent.click(writeBtn)
    expect(onNavigate).toHaveBeenCalledWith('write')
  })

  test('clicking an interactive metric button switches the active shelf tab', () => {
    render(
      <ProfilePage
        account={mockAccount}
        books={mockBooks}
        shelf={[
          { bookId: 'book-1', status: 'reading' },
          { bookId: 'book-2', status: 'finished' },
        ]}
        progress={{ 'book-1': 45, 'book-2': 100 }}
      />
    )

    const finishedMetricBtn = screen.getByRole('button', { name: /View Finished books in bookshelf/i })
    expect(finishedMetricBtn).toBeInTheDocument()
    fireEvent.click(finishedMetricBtn)

    const finishedTab = screen.getByRole('tab', { name: /Finished/i })
    expect(finishedTab).toHaveAttribute('aria-selected', 'true')
  })

  test('renders account security card and triggers email password reset', async () => {
    const onForgotPassword = vi.fn().mockResolvedValue()
    const onToast = vi.fn()

    render(
      <ProfilePage
        account={mockAccount}
        books={mockBooks}
        shelf={[]}
        progress={{}}
        onForgotPassword={onForgotPassword}
        onToast={onToast}
      />
    )

    expect(screen.getByText('Password & protection')).toBeInTheDocument()
    expect(screen.getByText('Send password reset link')).toBeInTheDocument()

    const sendResetBtn = screen.getByRole('button', { name: /Send reset link/i })
    expect(sendResetBtn).toBeInTheDocument()
    fireEvent.click(sendResetBtn)

    expect(onForgotPassword).toHaveBeenCalledWith('alex@example.com')
  })
})
