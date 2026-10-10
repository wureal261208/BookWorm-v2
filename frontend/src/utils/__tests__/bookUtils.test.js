import { describe, expect, test } from 'vitest'
import { formatTopicLabel, getAuthor, getCategory, getCover, getInitials, NO_COVER_IMAGE } from '../bookUtils'

describe('utils/bookUtils', () => {
  describe('formatTopicLabel', () => {
    test('shows "All" for the "all" filter value', () => {
      expect(formatTopicLabel('all')).toBe('All')
    })

    test('strips a leading "Browsing: " prefix from raw Gutenberg category text', () => {
      expect(formatTopicLabel('Browsing: History - Ancient')).toBe('History - Ancient')
    })

    test('leaves an already-clean category untouched', () => {
      expect(formatTopicLabel('Science Fiction')).toBe('Science Fiction')
    })
  })

  describe('getAuthor', () => {
    test('joins multiple Gutenberg-style author objects by name', () => {
      const book = { authors: [{ name: 'Twain, Mark' }, { name: 'Doe, Jane' }] }
      expect(getAuthor(book)).toBe('Twain, Mark, Doe, Jane')
    })

    test('falls back to a plain author string field', () => {
      expect(getAuthor({ author: 'Jane Austen' })).toBe('Jane Austen')
    })

    test('falls back to "Unknown author" when nothing is set', () => {
      expect(getAuthor({})).toBe('Unknown author')
    })
  })

  describe('getCategory', () => {
    test('prefers the first bookshelf', () => {
      expect(getCategory({ bookshelves: ['Adventure', 'Classics'] })).toBe('Adventure')
    })

    test('falls back to the first subject, trimmed before the first "--"', () => {
      expect(getCategory({ subjects: ['History -- United States'] })).toBe('History')
    })

    test('falls back to a plain category field, then "Classic"', () => {
      expect(getCategory({ category: 'Poetry' })).toBe('Poetry')
      expect(getCategory({})).toBe('Classic')
    })
  })

  describe('getInitials', () => {
    test('takes the first two letters of a single-word name', () => {
      expect(getInitials('Madonna')).toBe('MA')
    })

    test('takes the first letter of each of the first two words', () => {
      expect(getInitials('Jane Eyre Bronte')).toBe('JE')
    })

    test('falls back to "BW" for an empty/whitespace name', () => {
      expect(getInitials('')).toBe('BW')
      expect(getInitials('   ')).toBe('BW')
      expect(getInitials(undefined)).toBe('BW')
    })
  })

  describe('getCover and NO_COVER_IMAGE', () => {
    test('NO_COVER_IMAGE is an SVG data URI containing "No cover" text and book icon', () => {
      expect(NO_COVER_IMAGE).toContain('data:image/svg+xml;utf8,')
      expect(decodeURIComponent(NO_COVER_IMAGE)).toContain('No cover')
      expect(decodeURIComponent(NO_COVER_IMAGE)).toContain('<svg')
    })

    test('returns NO_COVER_IMAGE when book is undefined or null', () => {
      expect(getCover(undefined)).toBe(NO_COVER_IMAGE)
      expect(getCover(null)).toBe(NO_COVER_IMAGE)
      expect(getCover()).toBe(NO_COVER_IMAGE)
    })

    test('returns NO_COVER_IMAGE when book has empty or whitespace-only cover fields', () => {
      expect(getCover({})).toBe(NO_COVER_IMAGE)
      expect(getCover({ coverUrl: '' })).toBe(NO_COVER_IMAGE)
      expect(getCover({ coverUrl: '   ', cover_image: '' })).toBe(NO_COVER_IMAGE)
      expect(getCover({ cover: '', formats: {} })).toBe(NO_COVER_IMAGE)
    })

    test('does NOT return random Gutenberg 2701 cover for books without a cover', () => {
      const emptyBook = { title: 'User Submitted Book', author: 'Customer' }
      expect(getCover(emptyBook)).not.toContain('2701')
      expect(getCover(emptyBook)).toBe(NO_COVER_IMAGE)
    })

    test('prioritizes cover_image, coverUrl, cover, formats["image/jpeg"] when present', () => {
      expect(getCover({ cover_image: 'https://example.com/cover1.jpg' })).toBe('https://example.com/cover1.jpg')
      expect(getCover({ coverUrl: 'https://example.com/cover2.jpg' })).toBe('https://example.com/cover2.jpg')
      expect(getCover({ cover: 'https://example.com/cover3.jpg' })).toBe('https://example.com/cover3.jpg')
      expect(getCover({ formats: { 'image/jpeg': 'https://example.com/cover4.jpg' } })).toBe('https://example.com/cover4.jpg')
    })
  })
})
