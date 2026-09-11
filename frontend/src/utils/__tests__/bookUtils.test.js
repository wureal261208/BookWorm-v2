import { describe, expect, test } from 'vitest'
import { getAuthor, getCategory, getInitials } from '../bookUtils'

describe('utils/bookUtils', () => {
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
})
