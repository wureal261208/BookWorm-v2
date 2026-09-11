import { describe, expect, test } from 'vitest'
import { getBookChapters, getChapterIndex, getTotalPages, hasExplicitChapters } from '../chapterUtils'

describe('utils/chapterUtils', () => {
  describe('getTotalPages', () => {
    test('defaults to 120 pages when nothing is specified', () => {
      expect(getTotalPages({})).toBe(120)
    })

    test('uses an explicit pageCount when given', () => {
      expect(getTotalPages({ pageCount: 42 })).toBe(42)
    })

    test('sums explicit chapter page counts when every chapter has one', () => {
      const book = { chapters: [{ pages: 10 }, { pages: 15 }] }
      expect(getTotalPages(book)).toBe(25)
    })
  })

  describe('hasExplicitChapters', () => {
    test('is false for a book with no chapter data', () => {
      expect(hasExplicitChapters({})).toBe(false)
    })

    test('is true once the book has a non-empty chapters array', () => {
      expect(hasExplicitChapters({ chapters: [{ title: 'Chapter 1' }] })).toBe(true)
    })
  })

  describe('getBookChapters', () => {
    test('evenly splits placeholder chapters across the total page count', () => {
      const chapters = getBookChapters({ id: 'b1' }, 100)
      expect(chapters).toHaveLength(12)
      expect(chapters[0].startPage).toBe(1)
      const totalAssignedPages = chapters.reduce((sum, chapter) => sum + chapter.pages, 0)
      expect(totalAssignedPages).toBe(100)
    })

    test('uses real chapter titles when the book has explicit chapters', () => {
      const book = { id: 'b2', chapters: [{ title: 'The Beginning' }, { title: 'The End' }] }
      const chapters = getBookChapters(book, 20)
      expect(chapters.map((chapter) => chapter.title)).toEqual(['The Beginning', 'The End'])
    })
  })

  describe('getChapterIndex', () => {
    const chapters = [
      { startPage: 1, pages: 10 },
      { startPage: 11, pages: 10 },
      { startPage: 21, pages: 10 },
    ]

    test('finds the chapter that contains the given page', () => {
      expect(getChapterIndex(1, chapters)).toBe(0)
      expect(getChapterIndex(15, chapters)).toBe(1)
      expect(getChapterIndex(25, chapters)).toBe(2)
    })

    test('falls back to the last chapter whose startPage is at or before an out-of-range page', () => {
      expect(getChapterIndex(999, chapters)).toBe(2)
    })
  })
})
