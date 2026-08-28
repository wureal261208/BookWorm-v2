// DEMO UI ONLY – logic removed
// Remaining stub data still actually wired into the live app via
// utils/firebaseData.js (App.jsx). See utils/firebaseData.js for why:
// comments there are not fetched from the backend yet (no Comment
// model/endpoints exist), so this file is the only source for them right now.
// Notifications and reader text are no longer sourced from here - both now
// come from the real backend (see notificationController.js and
// bookController.js's getBookReaderText). Rentals were removed from the app
// entirely - reading is always free, no rental concept anywhere anymore.
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
