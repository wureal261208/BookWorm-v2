// DEMO UI ONLY – logic removed
// Remaining stub data still actually wired into the live app via
// utils/firebaseData.js (App.jsx) and components/pages/ReaderPage.jsx.
// See utils/firebaseData.js for why: comments, notifications, and rental
// requests there are not fetched from the backend yet (no endpoints/models
// exist for them), so this file is the only source for them right now.
//
// NOTE: the demo account-management helpers (loadAccounts/saveAccounts/
// findAccountByEmail/etc.) and mockFirebaseAuth.js that used to sit here
// were removed - real Firebase Auth (firebase/auth SDK) replaced them and
// nothing imports them anymore.

export const mockComments = {
  84: [
    { id: 'c1', author: 'Reader One', text: 'One of my favorite classics!', createdAt: new Date().toISOString() },
    { id: 'c2', author: 'Reader Two', text: 'The pacing in the second half is wonderful.', createdAt: new Date().toISOString() },
  ],
}

export const mockNotifications = [
  {
    id: 'notification-demo-1',
    targetEmail: 'customer@bookworm.test',
    type: 'rental-approved',
    message: 'Your order for "Pride and Prejudice" was approved. Expected delivery: this Friday.',
    bookTitle: 'Pride and Prejudice',
    deliveryAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    read: false,
  },
]

export const mockRentalRequests = []

export const MOCK_READER_TEXT = `This is placeholder reading text used only for this static UI demo.

In the full application, this page would show the real chapter text for the selected book, loaded from its original source. Here, the same paragraph repeats so you can see how pagination, font size, and the reading theme controls behave.

The quick brown fox jumps over the lazy dog. Chapters, page numbers, and progress tracking below are all working against local demo state only — nothing is saved to a server.

Feel free to flip through a few pages, switch the reading theme, or resize the text to see how the reader layout responds.`
