// Real category text in Mongo is often Gutenberg's own free-form
// bookshelf wording ("History - Ancient", "American Revolutionary War"),
// not the familiar genre names a reader would think to search for. This
// is a curated shortlist of those familiar names instead - the backend
// matches `category` case-insensitively and as a substring (see listBooks
// in bookController.js), so picking "Science Fiction" here correctly
// matches a raw category like "Science Fiction - General" without needing
// an exact string match. Shared between Discover's genre dropdown and the
// Random page's genre picker so the two stay in sync automatically.
export const FAMILIAR_GENRES = [
  'Fiction',
  'Romance',
  'Mystery',
  'Science Fiction',
  'Fantasy',
  'History',
  'Biography',
  'Poetry',
  'Philosophy',
  "Children's",
  'Drama',
  'Adventure',
  'Horror',
  'Religion',
  'Science',
]
