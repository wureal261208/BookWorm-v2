# BookWorm — Static UI Demo

This is a **UI-only** build of the BookWorm project. All layout, styling, and
components are unchanged from the original app. Every real backend
integration has been fully removed — not just disabled:

- The `backend/` (Express + Mongoose + Firebase Admin) and `api/`
  (Vercel serverless functions) folders are gone. There is no server here at all.
- The `firebase`, `firebase-admin`, `mongoose`, `express`, `bcryptjs`,
  `jsonwebtoken`, `dotenv`, and `cors` packages have been removed from
  `package.json` — they are no longer installed or imported anywhere.
- `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`,
  and `vercel.json` are gone; there is nothing left pointing at a real
  Firebase or Mongo project.
- `/api/*` calls are intercepted in-code and answered with fake local data
  (see `src/mockData.js`), so no network request ever leaves the browser.
- No live Project Gutenberg text is fetched for the reader page.
- (No Kaggle references existed anywhere in the original project either.)

Everything still "works" from a clicking/typing perspective — login, sign up,
browse, rent, comment, the admin dashboard, the `/mongo-app/*` demo — but
nothing is persisted anywhere real. Refreshing keeps your demo session
(stored in `localStorage` only) so it still feels alive across reloads.

## Demo accounts

Use these on the main app's login/signup form (and the separate
`/mongo-app/login` form, which has its own copies of the same four roles):

| Role     | Email                    | Password    |
|----------|--------------------------|-------------|
| Customer | customer@bookworm.test   | customer123 |
| Employee | employee@bookworm.test   | employee123 |
| Manager  | manager@bookworm.test    | manager123  |
| Admin    | admin@bookworm.test      | admin123    |

You can also sign up with any new email/password — new accounts default to
the "customer" role.

## Run it

```bash
npm install
npm run dev
```

Then open the printed local URL (default http://localhost:5173).
