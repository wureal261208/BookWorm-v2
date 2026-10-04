// A deliberately tiny, SAFE markdown subset - just **bold** and *italic*,
// nothing else. Text is HTML-escaped FIRST, then the two markers are
// converted - so even if a chapter somehow contains literal "<script>" or
// any other markup, it always renders as inert text, never executes.
//
// This exists specifically so WritePage.jsx's lightweight formatting
// toolbar has something real to render against in the actual reader (see
// ReaderFrame.jsx) - it's applied only at the final paragraph-to-DOM render
// step, after the existing plain-text pagination (splitTextIntoPages in
// ReaderPage.jsx) has already done its character-count-based page
// splitting. That pagination logic is untouched and still operates on raw
// text exactly as it does today for the other ~75k books in the catalog -
// this only changes how an already-split paragraph is painted on screen.
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function renderLiteMarkdown(text) {
  const escaped = escapeHtml(text || '')
  return escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>')
}
