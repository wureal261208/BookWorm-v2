// DEMO UI ONLY – logic removed
// The real config included a dev-server middleware that proxied
// /api/reader-text requests to Project Gutenberg. The reader page no longer
// makes that call (see ReaderPage.jsx), so the proxy has been removed.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      // This is a monorepo (repo/frontend + repo/backend sharing one root
      // package.json for local dev convenience) - Vite 8's stricter file
      // serving would otherwise 403 any asset resolved from node_modules
      // one level up (e.g. bootstrap-icons' font files), whichever copy of
      // node_modules Node's resolver happens to pick. Explicitly allow the
      // repo root so this works regardless of which node_modules wins.
      allow: [resolve(import.meta.dirname, '..')],
    },
  },
})
