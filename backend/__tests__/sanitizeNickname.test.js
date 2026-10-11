const sanitizeNickname = require('../utils/sanitizeNickname');

describe('sanitizeNickname', () => {
  test('returns fallback when input is empty or invalid', () => {
    expect(sanitizeNickname('')).toBe('Reader');
    expect(sanitizeNickname(null)).toBe('Reader');
    expect(sanitizeNickname(undefined, 'Author')).toBe('Author');
    expect(sanitizeNickname('   ', 'Anonymous')).toBe('Anonymous');
  });

  test('strips email domain and converts email address into a formatted nickname', () => {
    expect(sanitizeNickname('alice.smith@gmail.com')).toBe('Alice Smith');
    expect(sanitizeNickname('john_doe_99@yahoo.com')).toBe('John Doe 99');
    expect(sanitizeNickname('writer-pro+tag@domain.co.uk')).toBe('Writer Pro Tag');
    expect(sanitizeNickname('booklover@test.org')).toBe('Booklover');
  });

  test('preserves normal nicknames and pen names', () => {
    expect(sanitizeNickname('Mark Twain')).toBe('Mark Twain');
    expect(sanitizeNickname('JK_Rowling')).toBe('JK Rowling');
    expect(sanitizeNickname('Nguyen Van A')).toBe('Nguyen Van A');
    expect(sanitizeNickname('Elena Rostova')).toBe('Elena Rostova');
  });

  test('handles angle-bracketed email strings and symbol-only names gracefully', () => {
    expect(sanitizeNickname('User <user@example.com>')).toBe('User');
    expect(sanitizeNickname('@@@@', 'Reader')).toBe('Reader');
    expect(sanitizeNickname('...___---', 'Bookworm')).toBe('Bookworm');
  });

  test('enforces max length', () => {
    const longName = 'A'.repeat(60);
    const result = sanitizeNickname(longName);
    expect(result.length).toBeLessThanOrEqual(40);
  });
});
