const DETAIL_TABS = [
  { id: 'chapters', icon: 'bi-list-ol', label: 'Chapters' },
  { id: 'comments', icon: 'bi-chat-left-text', label: 'Comments' },
  { id: 'more', icon: 'bi-stars', label: 'More books' },
]

function DetailTabs({ activeTab, onChange, showChapters = true }) {
  const tabs = showChapters ? DETAIL_TABS : DETAIL_TABS.filter((tab) => tab.id !== 'chapters')

  return (
    <nav className="detail-tabs" aria-label="Book detail sections">
      {tabs.map((tab) => (
        <button className={activeTab === tab.id ? 'active' : ''} key={tab.id} onClick={() => onChange(tab.id)} type="button">
          <i className={`bi ${tab.icon}`} />
          {tab.label}
        </button>
      ))}
    </nav>
  )
}

export default DetailTabs
