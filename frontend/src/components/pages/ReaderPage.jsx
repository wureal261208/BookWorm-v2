import { useCallback, useEffect, useMemo, useState } from 'react'
import ReaderChapterPanel from '../reader/ReaderChapterPanel'
import ReaderCommentsPanel from '../reader/ReaderCommentsPanel'
import ReaderControls from '../reader/ReaderControls'
import ReaderFrame from '../reader/ReaderFrame'
import { NextChapterModal, ReaderMemberModal } from '../reader/ReaderModals'
import ReaderTopbar from '../reader/ReaderTopbar'
import { getReaderUrl } from '../../utils/bookUtils'
import { getBookChapters, getChapterIndex, getTotalPages } from '../../utils/chapterUtils'
import { publicApiFetch } from '../../utils/apiClient'

const GUEST_CHAPTER_LIMIT = 3
const READER_PAGE_TARGET_LENGTH = 1800
const MAX_GENERATED_READER_PAGES = 260
const MAX_DETECTED_CHAPTER_NUMBER = 250
const DEFAULT_READER_CHAPTERS = 12

function ReaderPage({
  account,
  book,
  canPersistReaderState = false,
  checkpoints,
  comments = [],
  favorites,
  onBack,
  onComment,
  onDiscover,
  onFavorite,
  onHome,
  onLoginRequired,
  readerFontSize,
  readerTheme,
  startPage,
  setCheckpoints,
  setProgress,
  setReaderFontSize,
  setReaderTheme,
}) {
  const [commentText, setCommentText] = useState('')
  const [readerText, setReaderText] = useState('')
  const [readerStatus, setReaderStatus] = useState('idle')
  const [readerMessage, setReaderMessage] = useState('')
  const [pendingChapterIndex, setPendingChapterIndex] = useState(null)
  const [showMemberPrompt, setShowMemberPrompt] = useState(false)
  const activeBook = useMemo(() => book || { id: 'empty', title: '', formats: {} }, [book])
  const readerUrl = getReaderUrl(activeBook)
  const metadataTotalPages = useMemo(() => getTotalPages(activeBook), [activeBook])
  const metadataChapters = useMemo(() => getBookChapters(activeBook, metadataTotalPages), [activeBook, metadataTotalPages])
  const readerModel = useMemo(
    () => buildReaderModel(activeBook, readerText, metadataChapters, metadataTotalPages),
    [activeBook, metadataChapters, metadataTotalPages, readerText],
  )
  const chapters = readerModel.chapters
  const totalPages = readerModel.totalPages
  const readerPages = readerModel.pages
  const checkpointKey = useMemo(() => getCheckpointKey(account, activeBook), [account, activeBook])
  const isGuest = account?.role === 'guest'
  const savedCheckpoint = isGuest ? null : checkpoints[checkpointKey]
  const [requestedPage, setCurrentPage] = useState(() => clampPage(startPage || savedCheckpoint?.page || 1, totalPages))
  const currentPage = clampPage(requestedPage, totalPages)
  const currentChapterIndex = getChapterIndex(currentPage, chapters)
  const currentChapter = chapters[currentChapterIndex]
  const currentChapterNumber = currentChapterIndex + 1
  const chapterPage = currentPage - currentChapter.startPage + 1
  const hasReachedGuestLimit = isGuest && currentChapterNumber > GUEST_CHAPTER_LIMIT
  const isFinished = currentPage >= totalPages
  const progressValue = Math.round((currentPage / totalPages) * 100)
  const chapterProgressValue = Math.round((chapterPage / currentChapter.pages) * 100)
  const currentReaderText = readerPages[currentPage - 1] || ''
  const currentReaderParagraphs = useMemo(() => getDisplayParagraphs(currentReaderText), [currentReaderText])
  const latestComments = getLatestComments(comments).slice(0, 3)

  const saveCheckpoint = useCallback(
    (page = currentPage) => {
      if (!book || readerStatus !== 'ready' || !canPersistReaderState || isGuest) return

      const safePage = clampPage(page, totalPages)
      const chapterIndex = getChapterIndex(safePage, chapters)
      const checkpointChapter = chapters[chapterIndex]

      setCheckpoints((current) => ({
        ...current,
        [checkpointKey]: {
          page: safePage,
          chapter: checkpointChapter.number || chapterIndex + 1,
          chapterPage: safePage - checkpointChapter.startPage + 1,
          totalPages,
          updatedAt: new Date().toISOString(),
        },
      }))
      setProgress((current) => ({ ...current, [activeBook.id]: Math.min(100, Math.round((safePage / totalPages) * 100)) }))
    },
    [activeBook.id, book, canPersistReaderState, chapters, checkpointKey, currentPage, isGuest, readerStatus, setCheckpoints, setProgress, totalPages],
  )

  useEffect(() => {
    let isCurrent = true
    const nextPage = clampPage(startPage || savedCheckpoint?.page || 1, totalPages)
    queueMicrotask(() => {
      if (!isCurrent) return
      setCurrentPage((current) => (current === nextPage ? current : nextPage))
    })

    return () => {
      isCurrent = false
    }
  }, [activeBook.id, savedCheckpoint?.page, startPage, totalPages])

  useEffect(() => {
    if (!book) return
    saveCheckpoint(currentPage)
  }, [book, currentPage, saveCheckpoint])

  useEffect(() => {
    let isCurrentRequest = true
    const commitReaderState = (text, status, message = '') => {
      queueMicrotask(() => {
        if (!isCurrentRequest) return

        setReaderText(text)
        setReaderStatus(status)
        setReaderMessage(message)
      })
    }

    if (!book) {
      commitReaderState('', 'idle')
      return () => {
        isCurrentRequest = false
      }
    }

    const hasChapterContent = metadataChapters.some((chapter) => chapter.content)

    if (hasChapterContent) {
      commitReaderState('', 'ready')
      return () => {
        isCurrentRequest = false
      }
    }

    if (!book.id) {
      commitReaderState('', 'missing', 'This book does not include readable text for chapter pages.')
      return () => {
        isCurrentRequest = false
      }
    }

    async function loadReaderText() {
      commitReaderState('', 'loading')
      try {
        const data = await publicApiFetch(`/api/books/${book.id}/reader-text`)
        if (!isCurrentRequest) return
        const text = cleanBookText(data.text || '')
        if (!text) {
          commitReaderState('', 'missing', 'This book does not include readable text for chapter pages.')
          return
        }
        commitReaderState(text, 'ready', '')
      } catch (error) {
        if (!isCurrentRequest) return
        commitReaderState('', 'error', error.message || 'Could not load reader text.')
      }
    }

    loadReaderText()

    return () => {
      isCurrentRequest = false
    }
  }, [activeBook, book, metadataChapters])

  useEffect(() => {
    if (!book || isGuest) return

    const handleBeforeUnload = () => saveCheckpoint(currentPage)
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      saveCheckpoint(currentPage)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [book, currentPage, isGuest, saveCheckpoint])

  if (!book) return <div className="empty-state">No book selected.</div>

  function handlePageChange(nextPage) {
    const safePage = Number(nextPage)
    setCurrentPage(clampPage(safePage, totalPages))
  }

  function goToChapter(chapterIndex) {
    const chapter = chapters[chapterIndex]
    if (!chapter) return

    if (isGuest && chapterIndex + 1 > GUEST_CHAPTER_LIMIT) {
      setShowMemberPrompt(true)
      return
    }

    setCurrentPage(chapter.startPage)
  }

  function goToChapterPage(chapterIndex, pageInChapter) {
    const chapter = chapters[chapterIndex]
    if (!chapter) return

    if (isGuest && chapterIndex + 1 > GUEST_CHAPTER_LIMIT) {
      setShowMemberPrompt(true)
      return
    }

    const safeChapterPage = Math.min(Math.max(Number(pageInChapter) || 1, 1), chapter.pages)
    setCurrentPage(chapter.startPage + safeChapterPage - 1)
  }

  function movePage(direction) {
    const nextChapterIndex = currentChapterIndex + 1

    if (direction > 0 && chapterPage >= currentChapter.pages && nextChapterIndex < chapters.length) {
      if (isGuest && currentChapterNumber >= GUEST_CHAPTER_LIMIT) {
        setShowMemberPrompt(true)
        return
      }

      setPendingChapterIndex(nextChapterIndex)
      return
    }

    handlePageChange(currentPage + direction)
  }

  function continueToPendingChapter() {
    if (pendingChapterIndex === null) return

    const chapter = chapters[pendingChapterIndex]
    setPendingChapterIndex(null)
    if (chapter) setCurrentPage(chapter.startPage)
  }

  function markChapterDone() {
    const finalChapterPage = currentChapter.startPage + currentChapter.pages - 1
    handlePageChange(finalChapterPage)
  }

  function handleExit() {
    saveCheckpoint(currentPage)
    onBack()
  }

  function handleHome() {
    saveCheckpoint(currentPage)
    onHome()
  }

  function handleDiscover() {
    saveCheckpoint(currentPage)
    onDiscover()
  }

  function submitReaderComment() {
    const text = commentText.trim()
    if (!text) return

    onComment(activeBook.id, text)
    setCommentText('')
  }

  return (
    <section
      className={`reader-page reader-${readerTheme}`}
      style={{ '--reader-font-size': `${readerFontSize}px` }}
    >
      <ReaderTopbar
        activeBook={activeBook}
        favorites={favorites}
        onBack={handleExit}
        onDiscover={handleDiscover}
        onFavorite={onFavorite}
        onHome={handleHome}
      />

      <ReaderControls
        chapterPage={chapterPage}
        chapterProgressValue={chapterProgressValue}
        chapters={chapters}
        currentChapter={currentChapter}
        currentChapterIndex={currentChapterIndex}
        guestChapterLimit={GUEST_CHAPTER_LIMIT}
        isFinished={isFinished}
        isGuest={isGuest}
        onChapter={goToChapter}
        onMarkChapterDone={markChapterDone}
        onReaderFontSize={setReaderFontSize}
        onReaderTheme={setReaderTheme}
        progressValue={progressValue}
        readerFontSize={readerFontSize}
        readerTheme={readerTheme}
      />

      <div className="reader-main">
        <ReaderChapterPanel
          chapters={chapters}
          currentChapterIndex={currentChapterIndex}
          currentPage={currentPage}
          guestChapterLimit={GUEST_CHAPTER_LIMIT}
          isGuest={isGuest}
          key={currentChapterIndex}
          onChapter={goToChapter}
          onChapterPage={goToChapterPage}
        />
        <ReaderFrame
          activeBook={activeBook}
          chapterPage={chapterPage}
          currentChapter={currentChapter}
          currentPage={currentPage}
          currentReaderParagraphs={currentReaderParagraphs}
          guestChapterLimit={GUEST_CHAPTER_LIMIT}
          hasReachedGuestLimit={hasReachedGuestLimit}
          onLoginRequired={onLoginRequired}
          onMovePage={movePage}
          readerMessage={readerMessage}
          readerStatus={readerStatus}
          readerUrl={readerUrl}
          totalPages={totalPages}
        />
        <ReaderCommentsPanel
          account={account}
          commentText={commentText}
          comments={latestComments}
          onCommentText={setCommentText}
          onSubmitComment={submitReaderComment}
          totalComments={comments.length}
        />
      </div>
      {pendingChapterIndex !== null && (
        <NextChapterModal
          currentChapter={currentChapter}
          nextChapter={chapters[pendingChapterIndex]}
          onClose={() => setPendingChapterIndex(null)}
          onContinue={continueToPendingChapter}
        />
      )}
      {showMemberPrompt && (
        <ReaderMemberModal
          onClose={() => setShowMemberPrompt(false)}
          onLoginRequired={onLoginRequired}
        />
      )}
    </section>
  )
}

function getCheckpointKey(account, book) {
  const accountKey = account?.role === 'guest' ? 'guest' : account?.id || account?.email || 'user'
  return `${accountKey}:${book.id}`
}

function getLatestComments(comments = []) {
  return [...comments].sort((first, second) => {
    const firstTime = new Date(first.createdAt).getTime()
    const secondTime = new Date(second.createdAt).getTime()

    return secondTime - firstTime
  })
}

function buildReaderModel(book, text, metadataChapters, metadataTotalPages) {
  const contentChapters = metadataChapters.filter((chapter) => chapter.content?.trim())

  if (contentChapters.length) {
    return buildChapterContentModel(book, contentChapters, metadataTotalPages)
  }

  if (!text) {
    return buildMissingReaderModel(book, metadataChapters)
  }

  const detectedChapters = splitTextByChapterHeadings(text)
  if (detectedChapters.length >= 2) {
    const contentTotalPages = estimateContentPageCount(text, metadataTotalPages, detectedChapters.length)
    const chapterSections =
      detectedChapters.length > contentTotalPages ? groupChapterSections(detectedChapters, contentTotalPages) : detectedChapters
    const pageCounts = distributePagesByContent(chapterSections, contentTotalPages)

    return buildChapterContentModel(book, chapterSections.map((chapter, index) => ({
      ...chapter,
      pages: pageCounts[index] || 1,
    })), contentTotalPages)
  }

  const estimatedPages = estimateContentPageCount(text, metadataTotalPages, Math.max(1, metadataChapters.length))
  const pages = splitTextIntoPages(text, estimatedPages, { allowFewerPages: true })
  const chapters = fitChaptersToPageCount(book, metadataChapters, pages.length)

  return normalizeReaderModel(book, chapters, pages)
}

function buildChapterContentModel(book, sourceChapters, fallbackPages) {
  const pages = []
  const chapters = []
  let startPage = 1

  sourceChapters.forEach((chapter, index) => {
    const chapterPages = splitTextIntoPages(cleanBookText(chapter.content || ''), chapter.pages || 1, { allowFewerPages: true })
    if (!chapterPages.length) return

    const number = chapter.number || index + 1
    const title = chapter.title || chapter.label || `Chapter ${number}`
    chapters.push({
      ...chapter,
      id: chapter.id || `${book.id || 'book'}-reader-chapter-${index + 1}`,
      label: chapter.label || `Chapter ${number}`,
      number,
      title,
      startPage,
      pages: chapterPages.length,
    })
    pages.push(...chapterPages)
    startPage += chapterPages.length
  })

  return normalizeReaderModel(book, chapters, pages, fallbackPages)
}

function fitChaptersToPageCount(book, sourceChapters, pageCount) {
  const safePageCount = Math.max(1, pageCount)
  const chapterCount = Math.max(1, Math.min(sourceChapters.length || DEFAULT_READER_CHAPTERS, safePageCount))
  const basePages = Math.floor(safePageCount / chapterCount)
  const extraPages = safePageCount % chapterCount
  let startPage = 1

  return Array.from({ length: chapterCount }, (_, index) => {
    const sourceChapter = sourceChapters[index] || {}
    const pages = basePages + (index < extraPages ? 1 : 0)
    const number = sourceChapter.number || index + 1
    const chapter = {
      ...sourceChapter,
      id: sourceChapter.id || `${book.id || 'book'}-reader-chapter-${index + 1}`,
      label: sourceChapter.label || `Chapter ${number}`,
      number,
      title: sourceChapter.title || sourceChapter.label || `Chapter ${number}`,
      startPage,
      pages,
    }

    startPage += pages
    return chapter
  })
}

function normalizeReaderModel(book, chapters, pages, fallbackPages = 1) {
  const cleanPages = pages.map((page) => page.trim()).filter(Boolean)

  if (!cleanPages.length) {
    return buildMissingReaderModel(book, chapters.length ? chapters : getBookChapters(book, fallbackPages))
  }

  const normalizedChapters = chapters.length ? chapters : fitChaptersToPageCount(book, [], cleanPages.length)
  return {
    chapters: normalizedChapters,
    pages: cleanPages,
    totalPages: cleanPages.length,
  }
}

function buildMissingReaderModel(book, metadataChapters) {
  const fallbackChapter = metadataChapters[0] || {
    id: `${book.id || 'book'}-reader-unavailable`,
    label: 'Chapter 1',
    number: 1,
    title: 'Chapter 1',
  }

  return {
    chapters: [{
      ...fallbackChapter,
      startPage: 1,
      pages: 1,
    }],
    pages: [''],
    totalPages: 1,
  }
}

function cleanBookText(text) {
  const normalizedText = text
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')

  const withoutHeader = sliceAfterMarker(normalizedText, [
    '*** START OF THE PROJECT GUTENBERG EBOOK',
    '*** START OF THIS PROJECT GUTENBERG EBOOK',
    'START OF THE PROJECT GUTENBERG EBOOK',
    'START OF THIS PROJECT GUTENBERG EBOOK',
  ])
  const withoutFooter = sliceBeforeMarker(withoutHeader, [
    '*** END OF THE PROJECT GUTENBERG EBOOK',
    '*** END OF THIS PROJECT GUTENBERG EBOOK',
    'END OF THE PROJECT GUTENBERG EBOOK',
    'END OF THIS PROJECT GUTENBERG EBOOK',
  ])

  return withoutFooter
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function splitTextByChapterHeadings(text) {
  const candidates = trimLeadingTableOfContents(getChapterHeadingCandidates(text))

  if (candidates.length < 2) return []

  const chapters = candidates.map((candidate, index) => {
    const end = candidates[index + 1]?.index ?? text.length
    const prefix = ''
    const body = stripLeadingChapterHeading(text.slice(candidate.index, end).trim())

    return {
      label: candidate.label,
      number: candidate.number,
      title: candidate.title,
      content: [prefix, body].filter(Boolean).join('\n\n'),
    }
  })

  return chapters.filter((chapter) => chapter.content.length > 80)
}

function stripLeadingChapterHeading(content) {
  const lines = content.split('\n')
  const firstLine = lines[0]?.trim() || ''
  if (!firstLine) return content

  if (parseInlineChapterHeading(firstLine) || parseStandaloneChapterMarker(firstLine)) {
    return lines.slice(1).join('\n').trim()
  }

  return content
}

function getChapterHeadingCandidates(text) {
  const lines = getIndexedLines(text)
  const candidates = []

  lines.forEach((line, index) => {
    const inlineHeading = parseInlineChapterHeading(line.text)
    if (inlineHeading) {
      candidates.push({ ...inlineHeading, index: line.index })
      return
    }

    const marker = parseStandaloneChapterMarker(line.text)
    if (!marker) return

    const nextLine = findNextNonEmptyLine(lines, index + 1)
    if (!nextLine || !isLikelyStandaloneChapterTitle(nextLine.text)) return

    const number = parseChapterNumber(marker)
    candidates.push({
      index: line.index,
      kind: 'standalone',
      label: `Chapter ${formatChapterMarker(marker)}`,
      number,
      title: cleanHeadingTitle(nextLine.text.trim()) || `Chapter ${number || marker}`,
    })
  })

  const chapterCandidates = candidates.filter((candidate) => candidate.headingType === 'chapter')
  if (chapterCandidates.length >= 2) return chapterCandidates

  const actCandidates = candidates.filter((candidate) => candidate.headingType === 'act')
  if (actCandidates.length >= 2) return actCandidates

  const namedCandidates = candidates.filter((candidate) => candidate.kind === 'named')
  if (namedCandidates.length >= 2) return namedCandidates

  const numberedCandidates = candidates.filter((candidate) => candidate.kind === 'numbered')
  return numberedCandidates.length >= 2 ? numberedCandidates : candidates
}

function getIndexedLines(text) {
  let index = 0

  return text.split('\n').map((line) => {
    const indexedLine = { index, text: line }
    index += line.length + 1
    return indexedLine
  })
}

function parseInlineChapterHeading(line) {
  const heading = line.trim()
  if (!isReasonableHeadingLength(heading)) return null

  const namedHeading = heading.match(/^(chapter|letter|book|volume|act)\s+([ivxlcdm]+|\d+)\b[).: -]*(.*)$/i)
  if (namedHeading) {
    const number = parseChapterNumber(namedHeading[2])
    if (!number) return null

    const label = `${capitalizeWord(namedHeading[1])} ${formatChapterMarker(namedHeading[2])}`
    const title = cleanHeadingTitle(namedHeading[3]) || label

    return { headingType: namedHeading[1].toLowerCase(), kind: 'named', label, number, title }
  }

  const numberedHeading = heading.match(/^([ivxlcdm]+|\d+)[.)]\s+(.+)$/i) || heading.match(/^([ivxlcdm]+|\d+)\s[-:]\s(.+)$/i)
  if (!numberedHeading || !isLikelyInlineChapterTitle(numberedHeading[2])) return null
  const number = parseChapterNumber(numberedHeading[1])
  if (!number) return null

  return {
    kind: 'numbered',
    label: `Chapter ${formatChapterMarker(numberedHeading[1])}`,
    number,
    title: cleanHeadingTitle(numberedHeading[2]),
  }
}

function parseStandaloneChapterMarker(line) {
  const marker = line.trim().match(/^([ivxlcdm]+|\d+)[.)]?$/i)?.[1]
  return marker && parseChapterNumber(marker) ? marker : ''
}

function parseChapterNumber(value) {
  const number = /^\d+$/.test(value) ? Number(value) : romanToNumber(value)
  return number && number <= MAX_DETECTED_CHAPTER_NUMBER ? number : null
}

function romanToNumber(value) {
  const romanValues = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 }
  const letters = value.toLowerCase()
  let total = 0

  for (let index = 0; index < letters.length; index += 1) {
    const current = romanValues[letters[index]]
    const next = romanValues[letters[index + 1]] || 0
    if (!current) return null
    total += current < next ? -current : current
  }

  return total || null
}

function findNextNonEmptyLine(lines, startIndex) {
  return lines.slice(startIndex).find((line) => line.text.trim())
}

function isReasonableHeadingLength(heading) {
  return heading.length >= 1 && heading.length <= 110
}

function isLikelyInlineChapterTitle(title) {
  const cleanTitle = cleanHeadingTitle(title)
  if (!cleanTitle || cleanTitle.length < 4 || cleanTitle.length > 100) return false
  if (/[.!?;:,]$/.test(cleanTitle) && cleanTitle.split(/\s+/).length > 8) return false

  return true
}

function isLikelyStandaloneChapterTitle(title) {
  const cleanTitle = cleanHeadingTitle(title)
  if (!cleanTitle || cleanTitle.length < 4 || cleanTitle.length > 100) return false
  if (/[.!?,;:]$/.test(cleanTitle)) return false

  const letters = cleanTitle.replace(/[^a-z]/gi, '')
  if (letters.length < 4) return false

  const uppercaseLetters = letters.replace(/[^A-Z]/g, '').length
  const uppercaseRatio = uppercaseLetters / letters.length

  return uppercaseRatio > 0.58 || /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,10}$/.test(cleanTitle)
}

function trimLeadingTableOfContents(candidates) {
  const restartIndexes = candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate, index }) => index > 0 && candidate.number === 1 && (candidates[index - 1].number || 0) > 1)
    .map(({ index }) => index)

  const restartIndex = restartIndexes.find(
    (index) => candidates.length - index >= 2 && isLikelyTableOfContentsBeforeRestart(candidates, index),
  )
  return restartIndex ? candidates.slice(restartIndex) : candidates
}

function isLikelyTableOfContentsBeforeRestart(candidates, restartIndex) {
  const leadingCandidates = candidates.slice(0, restartIndex)
  if (leadingCandidates.length < 3) return false

  const gaps = leadingCandidates
    .slice(0, -1)
    .map((candidate, index) => leadingCandidates[index + 1].index - candidate.index)
  const denseGaps = gaps.filter((gap) => gap <= 320).length
  const denseRatio = gaps.length ? denseGaps / gaps.length : 0
  const leadingSpan = leadingCandidates[leadingCandidates.length - 1].index - leadingCandidates[0].index

  return denseRatio >= 0.65 && leadingSpan <= leadingCandidates.length * 420
}

function cleanHeadingTitle(title = '') {
  const cleanedTitle = title
    .replace(/\s+/g, ' ')
    .replace(/^[\s\])}.'"“”‘’_:;-]+/, '')
    .replace(/[\s[({.'"“”‘’_:;-]+$/, '')
    .trim()

  return /[a-z0-9]/i.test(cleanedTitle) ? cleanedTitle : ''
}

function capitalizeWord(word) {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}

function formatChapterMarker(marker) {
  return /^\d+$/.test(marker) ? String(Number(marker)) : marker.toUpperCase()
}

function estimateContentPageCount(text, fallbackPages, chapterCount) {
  const estimatedPages = Math.ceil(text.length / READER_PAGE_TARGET_LENGTH)
  const minimumPages = Math.max(1, chapterCount)
  const preferredPages = Math.max(minimumPages, estimatedPages)

  return Math.min(MAX_GENERATED_READER_PAGES, Math.max(minimumPages, preferredPages || fallbackPages))
}

function groupChapterSections(sections, targetCount) {
  return Array.from({ length: targetCount }, (_, index) => {
    const start = Math.floor((index * sections.length) / targetCount)
    const end = Math.floor(((index + 1) * sections.length) / targetCount)
    const group = sections.slice(start, Math.max(start + 1, end))
    const firstChapter = group[0]

    return {
      number: firstChapter.number || index + 1,
      title: firstChapter.title,
      content: group.map((chapter) => chapter.content).join('\n\n'),
    }
  })
}

function distributePagesByContent(chapters, totalPages) {
  const chapterCount = Math.max(1, Math.min(chapters.length, totalPages))
  const availablePages = Math.max(0, totalPages - chapterCount)
  const totalLength = chapters.reduce((total, chapter) => total + Math.max(1, chapter.content.length), 0)
  const weightedPages = chapters.map((chapter) => {
    const weight = Math.max(1, chapter.content.length) / totalLength
    const exactExtraPages = weight * availablePages

    return {
      pages: 1 + Math.floor(exactExtraPages),
      remainder: exactExtraPages % 1,
    }
  })

  let assignedPages = weightedPages.reduce((total, chapter) => total + chapter.pages, 0)
  weightedPages
    .map((chapter, index) => ({ ...chapter, index }))
    .sort((first, second) => second.remainder - first.remainder)
    .forEach((chapter) => {
      if (assignedPages >= totalPages) return
      weightedPages[chapter.index].pages += 1
      assignedPages += 1
    })

  return weightedPages.map((chapter) => chapter.pages)
}

function splitTextIntoPages(text, pageCount, options = {}) {
  const cleanText = text.replace(/\n{3,}/g, '\n\n').trim()
  const safePageCount = Math.max(1, pageCount)
  if (!cleanText) return options.allowFewerPages ? [] : Array.from({ length: safePageCount }, () => '')

  const targetLength = Math.max(360, Math.ceil(cleanText.length / safePageCount))
  const paragraphs = cleanText
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .flatMap((paragraph) => splitLongParagraph(paragraph, targetLength))
  const pages = []
  let currentPageText = ''

  paragraphs.forEach((paragraph) => {
    const nextPageText = [currentPageText, paragraph].filter(Boolean).join('\n\n')

    if (currentPageText && nextPageText.length > targetLength && pages.length < safePageCount - 1) {
      pages.push(currentPageText)
      currentPageText = paragraph
      return
    }

    currentPageText = nextPageText
  })

  if (currentPageText || !pages.length) pages.push(currentPageText)

  return options.allowFewerPages ? compactPageCount(pages, safePageCount) : normalizePageCount(pages, safePageCount)
}

function splitLongParagraph(paragraph, targetLength) {
  if (paragraph.length <= targetLength * 1.35) return [paragraph]

  const chunks = []
  const words = paragraph.split(/\s+/)
  let chunk = ''

  words.forEach((word) => {
    const nextChunk = [chunk, word].filter(Boolean).join(' ')

    if (chunk && nextChunk.length > targetLength) {
      chunks.push(chunk)
      chunk = word
      return
    }

    chunk = nextChunk
  })

  if (chunk) chunks.push(chunk)

  return chunks
}

function normalizePageCount(pages, pageCount) {
  const safePages = pages.slice(0, pageCount)

  if (pages.length > pageCount) {
    safePages[pageCount - 1] = [safePages[pageCount - 1], ...pages.slice(pageCount)].filter(Boolean).join('\n\n')
  }

  while (safePages.length < pageCount) {
    safePages.push('')
  }

  return safePages
}

function compactPageCount(pages, pageCount) {
  const safePages = pages.map((page) => page.trim()).filter(Boolean).slice(0, pageCount)

  if (pages.length > pageCount) {
    safePages[pageCount - 1] = [safePages[pageCount - 1], ...pages.slice(pageCount)].filter(Boolean).join('\n\n')
  }

  return safePages
}

function getDisplayParagraphs(text) {
  return text.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean)
}

function sliceAfterMarker(text, markers) {
  const markerIndex = findMarkerIndex(text, markers)
  if (markerIndex < 0) return text

  const nextLineIndex = text.indexOf('\n', markerIndex)
  return nextLineIndex >= 0 ? text.slice(nextLineIndex + 1) : text.slice(markerIndex)
}

function sliceBeforeMarker(text, markers) {
  const markerIndex = findMarkerIndex(text, markers)
  return markerIndex >= 0 ? text.slice(0, markerIndex) : text
}

function findMarkerIndex(text, markers) {
  const lowerText = text.toLowerCase()
  const indexes = markers
    .map((marker) => lowerText.indexOf(marker.toLowerCase()))
    .filter((index) => index >= 0)

  return indexes.length ? Math.min(...indexes) : -1
}

function clampPage(page, totalPages) {
  return Math.min(totalPages, Math.max(1, Number(page) || 1))
}

export default ReaderPage
