import { useEffect, useMemo, useState } from 'react'
import { apiFetch, publicApiFetch } from '../utils/apiClient'
import './LibraryPortal.css'

const initialPreferences = { categories: [], languages: ['en'], formats: ['ebook', 'audiobook'] }

export default function LibraryPortal() {
  const [books, setBooks] = useState([])
  const [categories, setCategories] = useState([])
  const [filters, setFilters] = useState({ q: '', type: '', language: '', categories: '' })
  const [selected, setSelected] = useState(null)
  const [question, setQuestion] = useState('Cho tôi truyện tình cảm cổ điển giống Pride and Prejudice')
  const [aiResult, setAiResult] = useState(null)
  const [preferences, setPreferences] = useState(initialPreferences)
  const [message, setMessage] = useState('')

  const query = useMemo(() => new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString(), [filters])
  useEffect(() => {
    Promise.all([publicApiFetch(`/api/books?${query}`), publicApiFetch('/api/books/categories')])
      .then(([catalog, categoryData]) => { setBooks(catalog.books || []); setCategories(categoryData.categories || []) })
      .catch((error) => setMessage(error.message))
  }, [query])

  const askAi = async () => {
    try {
      const data = await apiFetch('/api/ai/query', { method: 'POST', body: { question } })
      setAiResult(data)
    } catch (error) { setMessage(`Đăng nhập để hỏi AI: ${error.message}`) }
  }
  const savePreferences = async () => {
    try { await apiFetch('/api/users/me/preferences', { method: 'PATCH', body: preferences }); setMessage('Đã lưu sở thích đọc của bạn.') }
    catch (error) { setMessage(`Đăng nhập để lưu sở thích: ${error.message}`) }
  }

  return <main className="library-portal">
    <header className="library-hero"><p>BOOKWORM LIBRARY</p><h1>Đọc. Nghe. Khám phá.</h1><span>Kho sách miễn phí từ Project Gutenberg và LibriVox.</span></header>
    {message && <p className="library-message">{message}</p>}
    <section className="library-toolbar" aria-label="Tìm kiếm sách">
      <input value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} placeholder="Tìm theo tên sách hoặc tác giả" />
      <select value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })}><option value="">Mọi định dạng</option><option value="ebook">Ebook</option><option value="audiobook">Audiobook</option></select>
      <select value={filters.language} onChange={(event) => setFilters({ ...filters, language: event.target.value })}><option value="">Mọi ngôn ngữ</option><option value="en">English</option><option value="vi">Tiếng Việt</option><option value="fr">Français</option></select>
    </section>
    <div className="category-pills">{categories.map((category) => <button key={category.name} className={filters.categories === category.name ? 'selected' : ''} onClick={() => setFilters({ ...filters, categories: filters.categories === category.name ? '' : category.name })}>{category.name} <small>{category.count}</small></button>)}</div>
    <section className="book-grid">{books.map((book) => <button className="catalog-card" key={book._id} onClick={() => setSelected(book)}><img src={book.cover_image || 'https://placehold.co/300x440?text=BookWorm'} alt="" /><div><em>{book.type === 'audiobook' ? 'AUDIOBOOK' : 'EBOOK'} · {book.source}</em><h2>{book.title}</h2><p>{book.author}</p><span>{book.categories?.slice(0, 2).join(' · ')}</span></div></button>)}</section>
    {!books.length && <p className="empty-state">Chưa có sách phù hợp. Hãy đổi điều kiện tìm kiếm.</p>}
    <section className="library-bottom">
      <div className="preference-card"><h2>Cá nhân hóa thư viện</h2><p>Chọn thể loại và hình thức bạn muốn nhận gợi ý.</p><input value={preferences.categories.join(', ')} onChange={(event) => setPreferences({ ...preferences, categories: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} placeholder="Ví dụ: Romance, History" /><button onClick={savePreferences}>Lưu sở thích</button></div>
      <div className="ai-card"><h2>Hỏi thủ thư AI</h2><textarea value={question} onChange={(event) => setQuestion(event.target.value)} /><button onClick={askAi}>Gợi ý cho tôi</button>{aiResult && <><p>{aiResult.answer}</p><ul>{aiResult.books?.map((book) => <li key={`${book.source}-${book.title}`}>{book.title} — {book.author}</li>)}</ul></>}</div>
    </section>
    {selected && <ReaderModal book={selected} onClose={() => setSelected(null)} />}
  </main>
}

function ReaderModal({ book, onClose }) {
  const preferred = book.files?.find((file) => /epub|pdf|mpeg|mp3|ogg|wav/i.test(file.format)) || book.files?.[0]
  const audio = book.type === 'audiobook'
  return <div className="reader-overlay" role="dialog" aria-modal="true"><article className="reader-modal"><button className="close" onClick={onClose}>×</button><p>{book.source} · {book.language}</p><h2>{book.title}</h2><h3>{book.author}</h3><p>{book.description}</p>{audio ? <audio controls autoPlay src={preferred?.url}>Trình duyệt không hỗ trợ phát audio.</audio> : preferred?.format === 'pdf' ? <iframe title={book.title} src={preferred.url} /> : <a className="open-reader" href={preferred?.url} target="_blank" rel="noreferrer">Mở ebook ({preferred?.format || 'file'})</a>}</article></div>
}
