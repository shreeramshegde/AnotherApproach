import { useEffect, useState } from 'react'
import { api } from '../api/client'

function scorePill(score) {
  if (score >= 75) return 'pill good'
  if (score >= 50) return 'pill warn'
  return 'pill bad'
}

export function ConsumersPage({ refreshVersion }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const payload = await api.getConsumers()
        if (cancelled) return
        setRows(payload.items || [])
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

  return (
    <section>
      <header className="section-header">
        <div>
          <h2 className="section-title">Consumer Trust Profile</h2>
          <p className="section-subtitle">
            Reviewer-level trust with suspicious behavior and risk-flag visibility.
          </p>
        </div>
      </header>

      {error ? <p className="error-text">{error}</p> : null}
      {loading ? (
        <p className="muted">Loading consumers...</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Consumer</th>
                <th>External ID</th>
                <th>Reviews</th>
                <th>Trust Score</th>
                <th>Suspicious Rate</th>
                <th>Risk Flags</th>
              </tr>
            </thead>
            <tbody>
              {!rows.length ? (
                <tr>
                  <td colSpan={6} className="muted">
                    No consumers yet.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row._id}>
                    <td>{row.name}</td>
                    <td>{row.externalId || '-'}</td>
                    <td>{row.reviewCount || 0}</td>
                    <td>
                      <span className={scorePill(row.consumerTrustScore || 0)}>
                        {(row.consumerTrustScore || 0).toFixed(1)}
                      </span>
                    </td>
                    <td>{((row.suspiciousReviewRate || 0) * 100).toFixed(1)}%</td>
                    <td>
                      {row.riskFlags?.length
                        ? row.riskFlags.join(', ')
                        : 'no active risk flags'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
