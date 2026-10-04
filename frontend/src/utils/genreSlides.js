import biographyMemoir from '../assets/promo-banners/biography-memoir.jpg'
import fantasy from '../assets/promo-banners/fantasy.jpg'
import history from '../assets/promo-banners/history.jpg'
import horror from '../assets/promo-banners/horror.jpg'
import literary from '../assets/promo-banners/literary.jpg'
import mysteryThriller from '../assets/promo-banners/mystery-thriller.jpg'
import romance from '../assets/promo-banners/romance.jpg'
import sciFi from '../assets/promo-banners/sci-fi.jpg'

export const GENRE_ICONS = {
  Romance: 'bi-heart-fill',
  Fantasy: 'bi-magic',
  'Science Fiction': 'bi-rocket-takeoff-fill',
  Mystery: 'bi-incognito',
  Horror: 'bi-ghost',
  History: 'bi-hourglass-split',
  Literary: 'bi-book-half',
  Biography: 'bi-person-badge',
}

// Pulled out of PromoBanner.jsx so BooksPage.jsx can reuse the exact same
// artwork as its category banner background ("giống Waka" - the clicked
// carousel slide's own image, not a separate generic image), without the
// two files getting out of sync if a genre or image ever changes.
export const GENRE_SLIDES = [
  { id: 'romance', image: romance, topic: 'Romance', icon: 'bi-heart-fill' },
  { id: 'fantasy', image: fantasy, topic: 'Fantasy', icon: 'bi-magic' },
  { id: 'sci-fi', image: sciFi, topic: 'Science Fiction', icon: 'bi-rocket-takeoff-fill' },
  { id: 'mystery-thriller', image: mysteryThriller, topic: 'Mystery', icon: 'bi-incognito' },
  { id: 'horror', image: horror, topic: 'Horror', icon: 'bi-ghost' },
  { id: 'history', image: history, topic: 'History', icon: 'bi-hourglass-split' },
  { id: 'literary', image: literary, topic: 'Literary', icon: 'bi-book-half' },
  { id: 'biography-memoir', image: biographyMemoir, topic: 'Biography', icon: 'bi-person-badge' },
]

// Case-insensitive - a deep link or an AI-suggested category string might
// not match the stored topic's exact casing.
export function findGenreSlide(topic) {
  if (!topic) return null
  const normalized = topic.trim().toLowerCase()
  return GENRE_SLIDES.find((slide) => slide.topic.toLowerCase() === normalized || slide.id === normalized) || null
}
