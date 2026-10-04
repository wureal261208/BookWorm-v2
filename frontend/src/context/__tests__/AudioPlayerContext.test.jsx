import { describe, expect, test } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AudioPlayerProvider, useAudioPlayer } from '../AudioPlayerContext'

function TestConsumer() {
  const {
    audioItem,
    chapters,
    currentChapterIndex,
    isPlaying,
    isPlayerVisible,
    playbackRate,
    volume,
    loadAudiobook,
    setChapter,
    nextChapter,
    prevChapter,
    setPlaybackRate,
    setVolume,
    closePlayer,
  } = useAudioPlayer()

  return (
    <div>
      <span data-testid="is-visible">{isPlayerVisible ? 'yes' : 'no'}</span>
      <span data-testid="is-playing">{isPlaying ? 'playing' : 'paused'}</span>
      <span data-testid="title">{audioItem?.title || 'none'}</span>
      <span data-testid="chapter-index">{currentChapterIndex}</span>
      <span data-testid="rate">{playbackRate}</span>
      <span data-testid="volume">{volume}</span>

      <button
        onClick={() =>
          loadAudiobook(
            { _id: 'audio-1', title: 'Sherlock Holmes', author: 'Conan Doyle' },
            [
              { title: 'Chapter 1: A Scandal in Bohemia', url: 'https://example.com/ch1.mp3' },
              { title: 'Chapter 2: The Red-Headed League', url: 'https://example.com/ch2.mp3' },
            ],
            0,
            0,
            false
          )
        }
        type="button"
      >
        Load Book
      </button>

      <button onClick={() => setChapter(1)} type="button">
        Go Ch 2
      </button>
      <button onClick={nextChapter} type="button">
        Next
      </button>
      <button onClick={prevChapter} type="button">
        Prev
      </button>
      <button onClick={() => setPlaybackRate(1.5)} type="button">
        Speed 1.5x
      </button>
      <button onClick={() => setVolume(0.8)} type="button">
        Vol 0.8
      </button>
      <button onClick={closePlayer} type="button">
        Close
      </button>
    </div>
  )
}

describe('AudioPlayerContext', () => {
  test('initializes with no audio and hidden player', () => {
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    expect(screen.getByTestId('is-visible').textContent).toBe('no')
    expect(screen.getByTestId('title').textContent).toBe('none')
    expect(screen.getByTestId('chapter-index').textContent).toBe('0')
  })

  test('loading an audiobook makes player visible and updates state', async () => {
    const user = userEvent.setup()
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    await user.click(screen.getByRole('button', { name: 'Load Book' }))

    expect(screen.getByTestId('is-visible').textContent).toBe('yes')
    expect(screen.getByTestId('title').textContent).toBe('Sherlock Holmes')
    expect(screen.getByTestId('chapter-index').textContent).toBe('0')
  })

  test('chapter navigation and rate updates work correctly', async () => {
    const user = userEvent.setup()
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    await user.click(screen.getByRole('button', { name: 'Load Book' }))
    await user.click(screen.getByRole('button', { name: 'Go Ch 2' }))
    expect(screen.getByTestId('chapter-index').textContent).toBe('1')

    await user.click(screen.getByRole('button', { name: 'Speed 1.5x' }))
    expect(screen.getByTestId('rate').textContent).toBe('1.5')

    await user.click(screen.getByRole('button', { name: 'Vol 0.8' }))
    expect(screen.getByTestId('volume').textContent).toBe('0.8')

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.getByTestId('is-visible').textContent).toBe('no')
  })
})
