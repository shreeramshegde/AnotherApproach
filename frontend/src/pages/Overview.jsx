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
  const [isolatedComplaints, setIsolatedComplaints] = useState([])
  const [anomalies, setAnomalies] = useState([])
  const [recommendations, setRecommendations] = useState([])
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
        setIsolatedComplaints(trendData.isolatedComplaints || [])
        setAnomalies(trendData.anomalies || [])
        setRecommendations(trendData.recommendations || [])
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
        <button
          onClick={async () => {
            try {
              const report = await api.downloadReport()
              const blob = new Blob([report], { type: 'application/json' })
              const url = window.URL.createObjectURL(blob)
              const anchor = document.createElement('a')
              anchor.href = url
              anchor.download = 'review-intelligence-report.json'
              anchor.click()
              window.URL.revokeObjectURL(url)
            } catch (err) {
              setError(err.message)
            }
          }}
        >
          Download report
        </button>
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
        <StatCard label="Model" value={modelHealth?.gemini?.model || '-'} />
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

      <div style={{ marginTop: 18 }}>
        <h3 className="section-title" style={{ fontSize: 18, marginBottom: 8 }}>
          Isolated Complaints
        </h3>
        {!isolatedComplaints.length ? (
          <p className="muted">No isolated complaint spikes in the latest windows.</p>
        ) : (
          <p className="muted">
            {isolatedComplaints.map((item) => `${item.feature} (${item.recentCount})`).join(', ')}
          </p>
        )}
      </div>

      <div style={{ marginTop: 18 }}>
        <h3 className="section-title" style={{ fontSize: 18, marginBottom: 8 }}>
          Prioritized Recommendations
        </h3>
        {!recommendations.length ? (
          <p className="muted">No prioritized recommendations yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Priority</th>
                  <th>Category</th>
                  <th>Feature</th>
                  <th>Recommendation</th>
                </tr>
              </thead>
              <tbody>
                {recommendations.map((item, index) => (
                  <tr key={`${item.category}-${item.feature}-${index}`}>
                    <td>{item.priority}</td>
                    <td>{item.category}</td>
                    <td>{item.feature}</td>
                    <td>{item.recommendation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ marginTop: 18 }}>
        <h3 className="section-title" style={{ fontSize: 18, marginBottom: 8 }}>
          Anomaly Alerts
        </h3>
        {!anomalies.length ? (
          <p className="muted">No major sentiment-drop anomaly detected.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Type</th>
                  <th>Delta %</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {anomalies.map((item) => (
                  <tr key={`${item.feature}-${item.type}`}>
                    <td>{item.feature}</td>
                    <td>{item.type}</td>
                    <td>{item.deltaPct}%</td>
                    <td>{item.message}</td>
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
