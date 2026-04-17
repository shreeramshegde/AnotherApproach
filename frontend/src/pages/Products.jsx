import { useEffect, useState } from 'react'
import { api } from '../api/client'

function scorePill(score) {
  if (score >= 75) return 'pill good'
  if (score >= 50) return 'pill warn'
  return 'pill bad'
}

export function ProductsPage({ refreshVersion }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const payload = await api.getProducts()
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
          <h2 className="section-title">Product Trust Ranking</h2>
          <p className="section-subtitle">
            Product-level trust, fake-rate, sarcasm-rate, and feature sentiment summary.
          </p>
        </div>
      </header>

      {error ? <p className="error-text">{error}</p> : null}
      {loading ? (
        <p className="muted">Loading products...</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Reviews</th>
                <th>Trust Score</th>
                <th>Fake Rate</th>
                <th>Sarcasm Rate</th>
                <th>Top Feature Signals</th>
              </tr>
            </thead>
            <tbody>
              {!rows.length ? (
                <tr>
                  <td colSpan={7} className="muted">
                    No products yet.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const featurePairs = Object.entries(row.featureScores || {})
                    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
                    .slice(0, 3)
                  return (
                    <tr key={row._id}>
                      <td>{row.name}</td>
                      <td>{row.category}</td>
                      <td>{row.reviewCount || 0}</td>
                      <td>
                        <span className={scorePill(row.productTrustScore || 0)}>
                          {(row.productTrustScore || 0).toFixed(1)}
                        </span>
                      </td>
                      <td>{((row.fakeRate || 0) * 100).toFixed(1)}%</td>
                      <td>{((row.sarcasmRate || 0) * 100).toFixed(1)}%</td>
                      <td>
                        {!featurePairs.length
                          ? '-'
                          : featurePairs
                              .map(([name, value]) => `${name}: ${Number(value).toFixed(2)}`)
                              .join(', ')}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
