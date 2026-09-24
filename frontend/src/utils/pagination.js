// Extracted from the removed DiscoverPage.jsx - a reusable
// "1 ... 49 50 51 ... 100"-style pagination window, kept here since it's
// genuinely reusable (and tested) independent of any one page.
export function getPageNumbers(current, total) {
  // Small catalogs of results (few enough pages to show in full) just list
  // every page - the ellipsis-collapsing window below is only worth it once
  // there are more pages than reasonably fit in the pagination bar.
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1)
  }

  const items = []
  const pages = new Set([1, total, current - 1, current, current + 1].filter((page) => page >= 1 && page <= total))
  const sorted = [...pages].sort((first, second) => first - second)

  let previous = 0
  for (const page of sorted) {
    if (previous && page - previous > 1) items.push('ellipsis')
    items.push(page)
    previous = page
  }
  return items
}
