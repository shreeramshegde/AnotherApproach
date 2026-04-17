import { useMemo, useState } from 'react'
import './App.css'
import { OverviewPage } from './pages/Overview'
import { ReviewsPage } from './pages/Reviews'
import { ProductsPage } from './pages/Products'
import { ConsumersPage } from './pages/Consumers'

function App() {
  const [activeTab, setActiveTab] = useState('overview')
  const [refreshVersion, setRefreshVersion] = useState(0)
  const tabs = useMemo(
    () => [
      { key: 'overview', label: 'Overview' },
      { key: 'reviews', label: 'Review Explorer' },
      { key: 'products', label: 'Product Trust' },
      { key: 'consumers', label: 'Consumer Trust' },
    ],
    [],
  )

  let pageContent = null
  if (activeTab === 'overview') {
    pageContent = <OverviewPage refreshVersion={refreshVersion} />
  } else if (activeTab === 'reviews') {
    pageContent = <ReviewsPage refreshVersion={refreshVersion} />
  } else if (activeTab === 'products') {
    pageContent = <ProductsPage refreshVersion={refreshVersion} />
  } else if (activeTab === 'consumers') {
    pageContent = <ConsumersPage refreshVersion={refreshVersion} />
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Customer Review Intelligence Platform</p>
          <h1>Trust + Trend Dashboard</h1>
        </div>
        <div className="topbar-actions">
          <button
            className="refresh-btn"
            onClick={() => setRefreshVersion((value) => value + 1)}
          >
            Refresh
          </button>
        </div>
      </header>

      <nav className="tabbar" aria-label="Dashboard sections">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`tab-btn ${tab.key === activeTab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="content-panel">{pageContent}</main>
    </div>
  )
}

export default App
