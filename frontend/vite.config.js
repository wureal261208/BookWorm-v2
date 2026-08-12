// DEMO UI ONLY – logic removed
// The real config included a dev-server middleware that proxied
// /api/reader-text requests to Project Gutenberg. The reader page no longer
// makes that call (see ReaderPage.jsx), so the proxy has been removed.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
