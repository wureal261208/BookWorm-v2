const DEFAULT_TOTAL_PAGES = 120
const DEFAULT_TOTAL_CHAPTERS = 12

export function getTotalPages(book = {}) {
  const chapterPageTotal = getExplicitChapterPageTotal(book)
  const explicitTotal = toPositiveInteger(
    book.pageCount,
    book.page_count,
    book.totalPages,
    book.total_pages,
    Array.isArray(book.pages) ? null : book.pages,
  )

  return chapterPageTotal || explicitTotal || DEFAULT_TOTAL_PAGES
}

export function getBookChapters(book = {}, totalPages = getTotalPages(book)) {
  const explicitChapters = getExplicitChapterEntries(book)

  if (explicitChapters?.length) {
    return normalizeExplicitChapters(book, explicitChapters, totalPages)
  }

  return createEvenChapters(book, totalPages)
}

export function getChapterIndex(page, chapters = []) {
  const safePage = Math.max(1, Number(page) || 1)
  const index = chapters.findIndex((chapter) => safePage >= chapter.startPage && safePage < chapter.startPage + chapter.pages)

  if (index >= 0) return index

  for (let fallbackIndex = chapters.length - 1; fallbackIndex >= 0; fallbackIndex -= 1) {
    if (safePage >= chapters[fallbackIndex].startPage) return fallbackIndex
  }

  return 0
}

function getExplicitChapterEntries(book) {
  return [
    book.chapterList,
    book.chapter_list,
    book.tableOfContents,
    book.table_of_contents,
    book.toc,
    Array.isArray(book.chapters) ? book.chapters : null,
  ].find((value) => Array.isArray(value) && value.length)
}

function getExplicitChapterPageTotal(book) {
  const explicitChapters = getExplicitChapterEntries(book)
  if (!explicitChapters) return null

  const pageCounts = explicitChapters
    .map((chapter) => {
      if (!isRecord(chapter)) return null

      return toPositiveInteger(chapter.pages, chapter.pageCount, chapter.page_count, chapter.pageTotal, chapter.page_total)
    })
    .filter(Boolean)

  if (pageCounts.length !== explicitChapters.length) return null

  return pageCounts.reduce((total, pages) => total + pages, 0) || null
}

function normalizeExplicitChapters(book, entries, totalPages) {
  const seeds = entries.map((entry, index) => {
    const chapter = isRecord(entry) ? entry : {}

    return {
      number: toPositiveInteger(chapter.number, chapter.chapter, chapter.index) || index + 1,
      title: getChapterTitle(entry, index),
      startPage: toPositiveInteger(chapter.startPage, chapter.start_page, chapter.pageStart, chapter.page_start, chapter.start),
      pages: toPositiveInteger(chapter.pages, chapter.pageCount, chapter.page_count, chapter.pageTotal, chapter.page_total),
      content: getChapterContent(chapter),
    }
  })

  const hasPageHints = seeds.some((chapter) => chapter.pages || chapter.startPage)

  if (!hasPageHints) {
    return createEvenChapters(book, totalPages, seeds)
  }

  let startPage = 1

  return seeds.map((chapter, index) => {
    const nextStartPage = seeds.slice(index + 1).find((nextChapter) => nextChapter.startPage)?.startPage
    const chapterStartPage = chapter.startPage || startPage
    const inferredPages = nextStartPage && nextStartPage > chapterStartPage ? nextStartPage - chapterStartPage : null
    const isLastChapter = index === seeds.length - 1
    const remainingPages = Math.max(1, totalPages - chapterStartPage + 1)
    const pages = Math.min(remainingPages, Math.max(1, chapter.pages || inferredPages || (isLastChapter ? remainingPages : 1)))
    const normalizedChapter = createChapter(book, chapter, index, chapterStartPage, pages)

    startPage = chapterStartPage + pages
    return normalizedChapter
  })
}

function createEvenChapters(book, totalPages, seeds = []) {
  const configuredChapterCount = seeds.length || toPositiveInteger(book.chapterCount, book.chapter_count, book.chapters) || DEFAULT_TOTAL_CHAPTERS
  const chapterCount = Math.max(1, Math.min(configuredChapterCount, totalPages))
  const basePages = Math.floor(totalPages / chapterCount)
  const extraPages = totalPages % chapterCount
  let startPage = 1

  return Array.from({ length: chapterCount }, (_, index) => {
    const pages = basePages + (index < extraPages ? 1 : 0)
    const chapter = createChapter(book, seeds[index], index, startPage, pages)

    startPage += pages
    return chapter
  })
}

function createChapter(book, seed = {}, index, startPage, pages) {
  const number = seed.number || index + 1
  const title = seed.title || `Chapter ${number}`

  return {
    id: `${book.id || 'book'}-chapter-${index + 1}`,
    label: `Chapter ${number}`,
    number,
    title,
    startPage,
    pages,
    content: seed.content || '',
  }
}

function getChapterTitle(entry, index) {
  if (typeof entry === 'string') return entry
  if (!isRecord(entry)) return `Chapter ${index + 1}`

  return entry.title || entry.name || entry.label || `Chapter ${index + 1}`
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function getChapterContent(chapter) {
  return [chapter.content, chapter.text, chapter.body].find((value) => typeof value === 'string' && value.trim()) || ''
}

function toPositiveInteger(...values) {
  for (const value of values) {
    if (value === undefined || value === null || value === '') continue

    const number = Number(value)
    if (Number.isFinite(number) && number > 0) return Math.floor(number)
  }

  return null
}
