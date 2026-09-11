const maskEmail = require('../utils/maskEmail');

describe('utils/maskEmail', () => {
  test('keeps the first two characters of the local part and the full domain', () => {
    expect(maskEmail('john.doe@gmail.com')).toBe('jo****@gmail.com');
  });

  test('still masks a very short local part', () => {
    expect(maskEmail('ab@example.com')).toBe('ab****@example.com');
  });

  test('still masks a single-character local part instead of dropping it', () => {
    expect(maskEmail('a@example.com')).toBe('a****@example.com');
  });

  test('returns non-email input unchanged instead of throwing', () => {
    expect(maskEmail('not-an-email')).toBe('not-an-email');
    expect(maskEmail('')).toBe('');
    expect(maskEmail(null)).toBe(null);
    expect(maskEmail(undefined)).toBe(undefined);
  });
});
