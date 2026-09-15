const escapeRegExp = require('../utils/escapeRegExp');

describe('escapeRegExp', () => {
  test('escapes regex special characters', () => {
    expect(escapeRegExp('C++')).toBe('C\\+\\+');
    expect(escapeRegExp('Vol. 1 (2000)')).toBe('Vol\\. 1 \\(2000\\)');
    expect(escapeRegExp('a.b*c?d')).toBe('a\\.b\\*c\\?d');
  });

  test('leaves plain text untouched', () => {
    expect(escapeRegExp('History - Ancient')).toBe('History - Ancient');
  });

  test('the escaped output is safe to compile as a RegExp', () => {
    const input = 'Science Fiction (Vol. 2+)';
    expect(() => new RegExp(escapeRegExp(input))).not.toThrow();
    expect(new RegExp(escapeRegExp(input)).test(input)).toBe(true);
  });
});
