import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { StatCard } from '../components/StatCard'
import { TrendChart } from '../components/TrendChart'

function asPct(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`
}

export function OverviewPage({ refreshVersion }) {
  const [overview, setOverview] = useState(null)
  const [trends, setTrends] = useState([])
  const [emergingIssues, setEmergingIssues] = useState([])
  const [modelHealth, setModelHealth] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const [overviewData, trendData, modelData] = await Promise.all([
          api.getOverview(),
          api.getTrends(),
          api.getModelHealth(),
        ])
        if (cancelled) return
        setOverview(overviewData)
        setTrends(trendData.points || [])
        setEmergingIssues(trendData.emergingIssues || [])
        setModelHealth(modelData)
      } catch (err) {
        if (cancelled) return
        setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [refreshVersion])

  if (loading) {
    return <p className="muted">Loading overview...</p>
  }

  return (
    <section>
      <header className="section-header">
        <div>
          <h2 className="section-title">Overview</h2>
          <p className="section-subtitle">
            Live KPI snapshot for fake reviews, sarcasm, trust, and model status.
          </p>
        </div>
      </header>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="grid-4">
        <StatCard label="Total Reviews" value={overview?.totalReviews || 0} />
        <StatCard label="Analyzed Reviews" value={overview?.analyzedReviews || 0} />
        <StatCard label="Fake Review Rate" value={asPct(overview?.fakeRate)} />
        <StatCard label="Average Trust Score" value={(overview?.avgTrust || 0).toFixed(1)} />
      </div>

      <div style={{ marginTop: 18 }}>
        <h3 className="section-title" style={{ fontSize: 18, marginBottom: 8 }}>
          Trend Graph
        </h3>
        <TrendChart points={trends} />
      </div>

      <div className="grid-4" style={{ marginTop: 12 }}>
        <StatCard label="Sarcasm Rate" value={asPct(overview?.sarcasmRate)} />
        <StatCard label="Ambiguous Rate" value={asPct(overview?.ambiguousRate)} />
        <StatCard
          label="Gemini"
          value={modelHealth?.gemini?.configured ? 'Configured' : 'Missing API key'}
        />
        <StatCard
          label="Grok"
          value={modelHealth?.grok?.configured ? 'Configured' : 'Missing API key'}
        />
      </div>

      <div style={{ marginTop: 18 }}>
        <h3 className="section-title" style={{ fontSize: 18, marginBottom: 8 }}>
          Emerging Issues
        </h3>
        {!emergingIssues.length ? (
          <p className="muted">No systemic issue trend has crossed threshold yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Recent Window %</th>
                  <th>Previous Window %</th>
                  <th>Delta %</th>
                </tr>
              </thead>
              <tbody>
                {emergingIssues.map((item) => (
                  <tr key={item.feature}>
                    <td>{item.feature}</td>
                    <td>{item.recentPct}%</td>
                    <td>{item.previousPct}%</td>
                    <td>{item.deltaPct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
