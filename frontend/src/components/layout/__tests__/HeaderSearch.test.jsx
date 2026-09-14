import { describe, expect, test, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HeaderSearch } from '../AppShell'
import { publicApiFetch } from '../../../utils/apiClient'

vi.mock('../../../utils/apiClient', () => ({
  publicApiFetch: vi.fn(),
}))

describe('HeaderSearch', () => {
  test('shows a loading state while the request is in flight', async () => {
    let resolveFetch
    publicApiFetch.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve }))
    const user = userEvent.setup()
    render(<HeaderSearch onSearch={vi.fn()} />)

    await user.type(screen.getByRole('textbox', { name: /search books/i }), 'dracula')
    await waitFor(() => expect(screen.getByText(/searching/i)).toBeInTheDocument())

    resolveFetch({ books: [] })
  })

  test('shows "No results found." in English when nothing matches', async () => {
    publicApiFetch.mockResolvedValue({ books: [] })
    const user = userEvent.setup()
    render(<HeaderSearch onSearch={vi.fn()} />)

    await user.type(screen.getByRole('textbox', { name: /search books/i }), 'zzzznotabook')
    await waitFor(() => expect(screen.getByText('No results found.')).toBeInTheDocument())
  })

  test('clicking a suggestion calls onSearch with that book\'s title', async () => {
    publicApiFetch.mockResolvedValue({ books: [{ id: '1', title: 'Dracula' }] })
    const onSearch = vi.fn()
    const user = userEvent.setup()
    render(<HeaderSearch onSearch={onSearch} />)

    await user.type(screen.getByRole('textbox', { name: /search books/i }), 'drac')
    const result = await screen.findByRole('button', { name: /dracula/i })
    await user.click(result)

    expect(onSearch).toHaveBeenCalledWith('Dracula')
  })

  test('pressing Enter submits the typed term as-is', async () => {
    publicApiFetch.mockResolvedValue({ books: [] })
    const onSearch = vi.fn()
    const user = userEvent.setup()
    render(<HeaderSearch onSearch={onSearch} />)

    const input = screen.getByRole('textbox', { name: /search books/i })
    await user.type(input, 'sherlock{Enter}')

    expect(onSearch).toHaveBeenCalledWith('sherlock')
  })
})
