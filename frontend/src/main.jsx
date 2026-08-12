import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import 'bootstrap-icons/font/bootstrap-icons.css'
import './index.css'
import App from './App.jsx'
import MongoApp from './mongo-app/MongoApp.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* New JWT + MongoDB demo (Ngay 2-3 frontend) - fully separate from
            the existing Firebase-based app below, so nothing there is at risk. */}
        <Route path="/mongo-app/*" element={<MongoApp />} />
        <Route path="*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
