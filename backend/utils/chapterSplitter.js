// Smart chapter detection and splitting utility for BookWorm.
// Handles Project Gutenberg texts, LibriVox texts, and user-written books.
// Detects chapter markers via robust multilingual regexes and falls back
// to logical section grouping when text has no explicit headings.

const CHAPTER_PATTERNS = [
  // Chapter 1 / CHAPTER I / Chapter One / Chapter 1: The Beginning
  /^\s*(?:chapter|ch\.|chap\.)\s+([0-9ivxlcdm]+|[a-z]+)(?:[\s:.\-–—]+(.*))?$/i,
  // Chương 1 / Hồi 1 / Tiết 1 / Phần 1
  /^\s*(?:chương|hồi|tiết|phần|mục)\s+([0-9ivxlcdm]+|[a-z]+)(?:[\s:.\-–—]+(.*))?$/i,
  // Book 1 / BOOK FIRST / Part I / Volume 1 / Act 1
  /^\s*(?:book|part|volume|vol\.|act|canto)\s+([0-9ivxlcdm]+|[a-z]+)(?:[\s:.\-–—]+(.*))?$/i,
  // Standalone Roman numerals: I. / IV. / XII
  /^\s*([ivxlcdm]{1,8})\.?\s*$/i,
];

const INTRO_PATTERNS = [
  /^\s*(?:introduction|preface|prologue|foreword|prelude|intro)\b(?:[\s:.\-–—]+(.*))?$/i,
  /^\s*(?:lời nói đầu|lời mở đầu|mở đầu|tiểu dẫn|dẫn nhập|khởi đầu)\b(?:[\s:.\-–—]+(.*))?$/i,
];

function isChapterHeading(paragraph) {
  if (!paragraph || typeof paragraph !== 'string') return null;
  const trimmed = paragraph.trim();

  // Headings are almost never longer than 140 characters
  if (trimmed.length > 140 || trimmed.length < 2) return null;

  for (const pattern of INTRO_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return { title: trimmed, isIntro: true, number: null };
    }
  }

  for (const pattern of CHAPTER_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      const numberOrWord = match[1] || '';
      const subtitle = (match[2] || '').trim();
      let title = trimmed;
      if (subtitle) {
        title = `${trimmed.replace(subtitle, '').trim()} ${subtitle}`.trim();
      }
      return { title, isIntro: false, number: numberOrWord };
    }
  }

  // Check if paragraph is short and uppercase or title-cased heading without terminal punctuation
  if (
    trimmed.length < 60 &&
    !/[.,;?!]$/.test(trimmed) &&
    (trimmed === trimmed.toUpperCase() || /^[A-Z][a-z0-9 ]+$/.test(trimmed)) &&
    !/^(the end|finis|copyright|table of contents|contents)$/i.test(trimmed)
  ) {
    // Looks like a title or section break
    return { title: trimmed, isIntro: false, number: null };
  }

  return null;
}

/**
 * Splits an array of paragraphs into structured chapters.
 * @param {string[]} paragraphs - Array of paragraphs from Gutenberg or reader
 * @param {string} defaultBookTitle - Fallback book title
 * @returns {Array<{ order: number, isIntro?: boolean, title: string, startParagraph: number, endParagraph: number, paragraphCount: number, excerpt: string }>}
 */
function splitParagraphsIntoChapters(paragraphs, defaultBookTitle = 'Book') {
  if (!Array.isArray(paragraphs) || paragraphs.length === 0) {
    return [];
  }

  const detected = [];

  paragraphs.forEach((p, index) => {
    const heading = isChapterHeading(p);
    if (heading) {
      detected.push({
        index,
        title: heading.title,
        headingMatch: heading,
      });
    }
  });

  // Filter out headings that are suspiciously close (e.g. consecutive lines of a multi-line title)
  const filteredHeadings = [];
  for (let i = 0; i < detected.length; i++) {
    const curr = detected[i];
    const prev = filteredHeadings[filteredHeadings.length - 1];
    if (prev && curr.index - prev.index <= 2) {
      // Merge into previous heading if close
      prev.title = `${prev.title} - ${curr.title}`;
    } else {
      filteredHeadings.push({ ...curr });
    }
  }

  // If we detected at least 2 distinct chapter/intro headings:
  if (filteredHeadings.length >= 2) {
    const chapters = [];
    let headingStartIdx = 0;

    // Case 1: First detected heading is explicitly an introduction
    if (filteredHeadings[0].headingMatch?.isIntro) {
      const h0 = filteredHeadings[0];
      const hNext = filteredHeadings[1];
      const end = hNext ? hNext.index - 1 : paragraphs.length - 1;
      chapters.push({
        order: 0,
        isIntro: true,
        title: h0.title || 'Phần mở đầu (Introduction)',
        startParagraph: h0.index,
        endParagraph: end,
        paragraphCount: Math.max(1, end - h0.index + 1),
        excerpt: (paragraphs[h0.index + 1] || paragraphs[h0.index] || '').slice(0, 160) + '...',
      });
      headingStartIdx = 1;
    } else if (filteredHeadings[0].index > 0) {
      // Case 2: There is intro text before the first chapter heading
      const introCount = filteredHeadings[0].index;
      chapters.push({
        order: 0,
        isIntro: true,
        title: 'Phần mở đầu (Introduction)',
        startParagraph: 0,
        endParagraph: filteredHeadings[0].index - 1,
        paragraphCount: introCount,
        excerpt: (paragraphs[0] || '').slice(0, 160) + '...',
      });
    }

    let regularChapterNum = 1;
    for (let i = headingStartIdx; i < filteredHeadings.length; i++) {
      const h = filteredHeadings[i];
      const nextH = filteredHeadings[i + 1];
      const start = h.index;
      const end = nextH ? nextH.index - 1 : paragraphs.length - 1;
      const count = Math.max(1, end - start + 1);

      chapters.push({
        order: regularChapterNum++,
        isIntro: false,
        title: h.title,
        startParagraph: start,
        endParagraph: end,
        paragraphCount: count,
        excerpt: (paragraphs[start + 1] || paragraphs[start] || '').slice(0, 160) + '...',
      });
    }

    return chapters;
  }

  // Fallback: If no clear chapter markers were detected, split into logical chunks with an Introduction first
  const CHUNK_SIZE = 25;
  const totalChunks = Math.max(1, Math.ceil(paragraphs.length / CHUNK_SIZE));
  const fallbackChapters = [];

  // Always assign chunk 0 as Introduction
  const introEnd = Math.min(paragraphs.length - 1, CHUNK_SIZE - 1);
  fallbackChapters.push({
    order: 0,
    isIntro: true,
    title: 'Phần mở đầu (Introduction)',
    startParagraph: 0,
    endParagraph: introEnd,
    paragraphCount: introEnd + 1,
    excerpt: (paragraphs[0] || '').slice(0, 150) + '...',
  });

  for (let c = 1; c < totalChunks; c++) {
    const start = c * CHUNK_SIZE;
    const end = Math.min(paragraphs.length - 1, start + CHUNK_SIZE - 1);
    const count = end - start + 1;
    const excerpt = (paragraphs[start] || '').slice(0, 150) + '...';

    fallbackChapters.push({
      order: c,
      isIntro: false,
      title: `Chương ${c}`,
      startParagraph: start,
      endParagraph: end,
      paragraphCount: count,
      excerpt,
    });
  }

  return fallbackChapters;
}

module.exports = {
  isChapterHeading,
  splitParagraphsIntoChapters,
};
