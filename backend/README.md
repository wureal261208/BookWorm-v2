# BookWorm Backend

Node.js / Express backend for BookWorm. **Firebase Authentication** owns identity (passwords, tokens);
this API verifies Firebase ID tokens with the Firebase Admin SDK and stores roles + app data
(books, rentals, payments, notifications) in **MongoDB Atlas** via Mongoose.

## ⚠️ Security note before you start

Do not paste real database credentials or service-account keys into chat, code comments, or commit
history — treat them like a password. If you shared a MongoDB Atlas connection string anywhere outside
your own `.env` file, rotate it now: **Atlas → Database Access → edit the user → Edit Password**.
(A Firebase *client* config, i.e. `apiKey`/`authDomain`/etc., is not secret the same way — it's meant to be
public in your frontend bundle. A Firebase Admin **service account JSON**, however, is fully secret and
must only ever live in your backend's `.env`.)

## Setup

1. **MongoDB Atlas**: get your connection string (after rotating the password above).
2. **Firebase Admin service account**: Firebase Console → Project settings → Service accounts →
   "Generate new private key". This downloads a JSON file — paste its contents into
   `FIREBASE_SERVICE_ACCOUNT_JSON` in your `.env` (or point `FIREBASE_SERVICE_ACCOUNT_PATH` at the file).
3. In the Firebase Console, go to **Authentication → Sign-in method** and enable **Email/Password** —
   this is why your app showed "No users for this project yet": Authentication wasn't turned on yet, and
   the frontend was using a local mock instead of the real SDK.

```bash
cd bookworm-backend
npm install
cp .env.example .env
# then edit .env with your own MongoDB Atlas URI and Firebase service account JSON
npm run dev
```

On first start, if no admin profile exists yet, one is created automatically: a Firebase Auth user (or
reused if that email already exists in Firebase) using `DEFAULT_ADMIN_EMAIL` / `DEFAULT_ADMIN_PASSWORD`
from `.env`, plus a matching MongoDB profile with `role: 'admin'`. Log in with it once, then change the
password from the Firebase Console or your app's account settings.

## How registration/login works now

- **Customer self-registration & login** happen entirely on the frontend via the real Firebase Auth SDK
  (`createUserWithEmailAndPassword` / `signInWithEmailAndPassword`). The frontend then calls
  `GET /api/auth/me` (or `/api/users/me`) with the Firebase ID token; this backend auto-creates a
  matching MongoDB profile (`role: 'customer'`) the first time it sees that Firebase account.
- **Manager/employee accounts** are created by `POST /api/users/register-with-code`, which redeems a
  one-time code and creates the Firebase Auth user *server-side* via the Admin SDK — so the admin/manager
  issuing the code isn't signed out of their own session. The new hire then logs in themselves from the
  frontend using the email/password they were given.

## Roles & permissions

| Role      | Push books | Restrict customers | Resign staff       | Create staff accounts        | Read books                | Rent books | Notifications                    |
|-----------|------------|---------------------|---------------------|-------------------------------|----------------------------|------------|-----------------------------------|
| admin     | ✅          | ✅ (customers)       | ✅ manager, employee | ✅ manager/employee via code   | ✅ full                    | —          | Sends broadcasts                  |
| manager   | ✅          | ✅ (customers)       | ✅ employee only     | ✅ employee only via code      | ✅ full                    | —          | Receives                          |
| employee  | ✅          | —                    | —                    | —                              | ✅ full                    | —          | Receives                          |
| customer  | —          | —                    | —                    | —                              | ✅ full                    | ✅          | Receives from admin                |
| anonymous | —          | —                    | —                    | —                              | First 3 chapters per book  | ❌          | "You must log in to view notifications." |

## Deploying to Vercel

The backend is already structured for this: `api/index.js` + `vercel.json` wrap the same Express `app.js`
you run locally, and `config/db.js` caches the MongoDB connection across invocations (serverless functions
don't stay running between requests, so without caching you'd reconnect - and risk hitting Atlas's
connection limit - on every single request).

1. **Deploy backend and frontend as two separate Vercel projects** (simplest by far - each is a different
   framework/build). In Vercel: New Project → import your repo → set **Root Directory** to `backend` for
   one project and `frontend` for the other.
2. **Backend project → Settings → Environment Variables**, add: `MONGODB_URI`, `FIREBASE_SERVICE_ACCOUNT_JSON`
   (paste the whole JSON as one value - no file upload needed), `DEFAULT_ADMIN_EMAIL`,
   `DEFAULT_ADMIN_PASSWORD`, `DEFAULT_ADMIN_NAME`. Skip `FORCE_DNS_SERVERS` - Vercel's own network resolves
   SRV records fine, that variable is only a local-dev workaround.
3. **Frontend project → Environment Variables**: all the `VITE_FIREBASE_*` ones, plus
   `VITE_API_BASE_URL` set to your backend project's URL (e.g. `https://bookworm-backend.vercel.app`).
4. Once both are deployed, go back to the backend project and set `FRONTEND_URL` to the frontend's exact
   URL, then redeploy, to lock CORS down from "any origin" to just your app.
5. **Fast way to check a deploy is actually working**: open `https://<your-backend>.vercel.app/api/health/db`
   - it reports whether Mongoose is connected and which required env vars are present (not their values),
   without digging through Vercel's log viewer.

**Don't deploy `scripts/importBookMetadata.js` as part of the app** - it's a one-time, long-running job
(75k rows) which doesn't fit a serverless function's short execution limit. Keep running it from your own
machine or from the Kaggle notebook, as described below - only the API itself needs to live on Vercel.

## Troubleshooting: "querySrv ECONNREFUSED _mongodb._tcp..."

This is a **DNS** problem, not a MongoDB or code problem: `mongodb+srv://` connection strings need
your network to resolve a special DNS SRV record, and some ISPs, routers, and VPNs silently fail to do
that even though normal browsing/Compass still works (Compass and Node don't always use the same
resolver). Try these in order:

1. **Switch your DNS to Google/Cloudflare**: Windows → Settings → Network & Internet → your adapter →
   Edit DNS → set `8.8.8.8` / `8.8.4.4` (or `1.1.1.1` / `1.0.0.1`) instead of "Automatic". Reconnect Wi-Fi.
2. **Or set it just for this app**, without touching Windows: uncomment `FORCE_DNS_SERVERS=8.8.8.8,8.8.4.4`
   in your `.env` and restart `npm run dev`.
3. **Turn off any VPN** temporarily and try again - many VPNs block or intercept SRV lookups.
4. **Check Atlas Network Access**: Atlas → Network Access → make sure your current IP is allowed
   (`0.0.0.0/0` while developing is the simplest, tighten it later).
5. If nothing above works, get the **non-SRV connection string** from Atlas: Database → Connect → Drivers
   → there's a toggle/link for the standard `mongodb://` string listing each shard host directly, which
   skips the SRV lookup entirely. Paste that as `MONGODB_URI` instead.

## Importing the Gutenberg book metadata catalog

This backend has no network access to Kaggle, so it can't run this itself - do it from one of these two
places. **Easiest: run it directly from your Kaggle notebook**, right after the cell that loads
`gutenberg_metadata`, since Kaggle already has the data loaded and has reliable outbound internet (no risk
of the local DNS SRV issue above):

```python
!pip install pymongo dnspython
from pymongo import MongoClient, UpdateOne
from kaggle_secrets import UserSecretsClient

# Add-ons -> Secrets -> add MONGODB_URI there instead of pasting it in a cell.
MONGODB_URI = UserSecretsClient().get_secret("MONGODB_URI")  # mongodb+srv://.../schema?...
collection = MongoClient(MONGODB_URI)["schema"]["book_metadata"]

column_map = {
    "Etext Number": "etextNumber", "Type": "type", "Issued": "issued", "Title": "title",
    "Language": "language", "LoCC": "locc", "Bookshelves": "bookshelves", "Authors": "authors",
    "rights": "rights", "Subjects": "subjects", "Read online (web)": "readOnlineUrl",
    "EPUB3 (E-readers incl. Send-to-Kindle)": "epub3Url", "EPUB (older E-readers)": "epubOlderUrl",
    "EPUB (no images, older E-readers)": "epubNoImagesUrl", "Kindle": "kindleUrl",
    "Kindle (E-readers incl. Send-to-Kindle)": "kindleSendUrl",
    "Kindle (no images, older E-readers)": "kindleNoImagesUrl", "Plain Text UTF-8": "plainTextUtf8Url",
    "Download HTML(zip)": "downloadHtmlZipUrl", "Resource Description Framework (RDF)": "rdfUrl",
    "Other Links": "otherLinks",
}
df = gutenberg_metadata.rename(columns=column_map).where(pd.notnull(gutenberg_metadata), "")
records = df.to_dict("records")

BATCH = 1000
for i in range(0, len(records), BATCH):
    ops = [UpdateOne({"etextNumber": int(r["etextNumber"])}, {"$set": r}, upsert=True)
           for r in records[i:i + BATCH] if pd.notna(r.get("etextNumber"))]
    if ops:
        collection.bulk_write(ops, ordered=False)
print(f"Upserted {len(records)} rows into schema.book_metadata")
```

Atlas → Network Access needs to allow Kaggle's (dynamic) IP - simplest is to temporarily allow `0.0.0.0/0`
while this cell runs, then tighten it back afterward.

**Alternative: download the CSV and run it locally.** Kaggle → "Gutenberg Metadata Downloader" by
lokeshparab → download `gutenberg_metadata.csv`, then:

```bash
npm run import:book-metadata -- /path/to/gutenberg_metadata.csv
```

This streams the CSV (don't worry about its size - it's read row by row, not loaded all at once) and
upserts each row into the `book_metadata` collection by `Etext Number`, so it's safe to re-run if you
get a refreshed CSV later.

Either way, see `models/BookMetadata.js` for the full field mapping and `routes/bookMetadataRoutes.js` for
the read API (`GET /api/book-metadata?q=...`, `GET /api/book-metadata/:etextNumber`). **Don't** run this
import as part of the deployed Vercel app - see "Deploying to Vercel" above for why.

## API reference

All responses use the shape `{ success, message, data }`. Send the Firebase ID token as
`Authorization: Bearer <idToken>` (get it in the frontend via `auth.currentUser.getIdToken()`).

### Auth — `/api/auth`
- `GET /me` — verifies the token, auto-creates a `customer` profile on first sight, returns it.

`GET /api/health` and `GET /api/health/db` (no auth needed) are handy for confirming a deploy is up and
actually reaching MongoDB - see "Deploying to Vercel" above.

### Users — `/api/users`
- `POST /register-with-code` — public. Creates a `manager`/`employee` Firebase + MongoDB account by
  redeeming a one-time code. Body: `{ name, email, password, code }`.
- `GET /me` — alias for `/api/auth/me` (kept for frontend compatibility).
- `POST /one-time-code` — admin/manager, requires token. Body: `{ role: 'manager' | 'employee' }`.
  Managers may only issue `employee` codes.
- `GET /` — admin/manager. List accounts, optional `?role=` filter.
- `PATCH /:id/restrict` — admin/manager. Body: `{ isRestricted: true|false }`. Customer accounts only.
  Also disables/re-enables the matching Firebase Auth account.
- `PATCH /:id/resign` — admin/manager. Revokes a manager/employee account and disables their Firebase
  Auth account. Managers may only resign employees.

### Books — `/api/books`
- `GET /` — public/anonymous. Catalog list (no chapter content).
- `GET /:id` — public/anonymous. Anonymous visitors receive only the first 3 chapters, with `isLimited: true`.
- `POST /` — admin/manager/employee. Push a new book.
- `PATCH /:id` — admin/manager/employee. Update a book.
- `DELETE /:id` — admin/manager/employee.

### Rentals — `/api/rentals` (customer only)
- `POST /` — Body: `{ bookId, days? }`.
- `GET /mine` — your rental history.
- `PATCH /:id/return` — mark a rental as returned.

### Payments — `/api/payments` (customer only)
- `POST /` — Body: `{ rentalId, amount, method? }`.
- `GET /mine` — your payment history.

### Notifications — `/api/notifications`
- `GET /` — anyone. Anonymous visitors get `{ requiresLogin: true, message: "You must log in to view notifications." }` with an empty list, same shape as a logged-in customer's response.
- `POST /` — admin only. Body: `{ title, message, targetUserId? }`. Omit `targetUserId` to broadcast to all customers.
- `PATCH /:id/read` — logged-in user marks a notification read.

### Book metadata catalog — `/api/book-metadata` (public)
- `GET /?q=&page=&limit=` — search the imported Gutenberg catalog by title/author/subject.
- `GET /:etextNumber` — a single catalog entry.

## Notes


- Emails are masked (`jo****@gmail.com`) in every API response via `utils/maskEmail.js`.
- Passwords are never stored or hashed here — Firebase Authentication owns them entirely. This backend
  only stores role + profile data, keyed by `firebaseUid`.
- `middleware/auth.js` provides `identify` (optional auth, for anonymous-friendly routes) and `protect` +
  `authorize(...roles)` (required auth + role-based access control) for restricted routes. Both verify
  the Firebase ID token via `config/firebaseAdmin.js`.
