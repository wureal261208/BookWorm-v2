import { describe, expect, test } from 'vitest'
import { maskEmail } from '../maskEmail'

describe('utils/maskEmail (frontend)', () => {
  test('keeps the first two and last characters of the local part visible', () => {
    expect(maskEmail('johnsmith@example.com')).toBe('jo*******h@example.com')
  })

  test('returns a friendly placeholder when there is no email at all', () => {
    expect(maskEmail('')).toBe('No email linked yet')
    expect(maskEmail(null)).toBe('No email linked yet')
    expect(maskEmail(undefined)).toBe('No email linked yet')
  })

  test('returns non-email input unchanged instead of throwing', () => {
    expect(maskEmail('not-an-email')).toBe('not-an-email')
  })
})
