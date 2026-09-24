import { describe, expect, test } from 'vitest'
import { getPageNumbers } from '../pagination'

describe('DiscoverPage/getPageNumbers', () => {
  test('returns every page when the total is small', () => {
    expect(getPageNumbers(1, 4)).toEqual([1, 2, 3, 4])
  })

  test('collapses the middle into a single ellipsis around the current page', () => {
    expect(getPageNumbers(50, 100)).toEqual([1, 'ellipsis', 49, 50, 51, 'ellipsis', 100])
  })

  test('never shows an ellipsis right next to page 1', () => {
    expect(getPageNumbers(2, 100)).toEqual([1, 2, 3, 'ellipsis', 100])
  })

  test('never shows an ellipsis right next to the last page', () => {
    expect(getPageNumbers(99, 100)).toEqual([1, 'ellipsis', 98, 99, 100])
  })

  test('handles being on page 1 of just 1 page', () => {
    expect(getPageNumbers(1, 1)).toEqual([1])
  })
})
