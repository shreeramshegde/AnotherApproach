import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'

function trustPill(score) {
  if (score >= 75) return 'pill good'
  if (score >= 45) return 'pill warn'
  return 'pill bad'
}

function confidencePill(confidence) {
  if (confidence >= 0.75) return 'pill bad'
  if (confidence >= 0.45) return 'pill warn'
  return 'pill good'
}

export function ReviewsPage({ refreshVersion }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [importMessage, setImportMessage] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [analyzingId, setAnalyzingId] = useState('')
  const [manualForm, setManualForm] = useState({
    reviewText: '',
    productName: '',
    productCategory: 'general',
    consumerName: '',
    language: 'en',
    rating: '5',
    verifiedPurchase: true,
  })
  const [feedForm, setFeedForm] = useState({
    reviewText: '',
    productName: '',
    productCategory: 'general',
    consumerName: '',
    language: 'en',
    rating: '4',
    verifiedPurchase: true,
  })
  const [filters, setFilters] = useState({
    analysisStatus: '',
    isFake: '',
    needsHumanReview: '',
    isBotLikely: '',
    isSpamSuspected: '',
    minTrust: '',
  })

  const loadReviews = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const payload = await api.getReviews({
        limit: 50,
        analysisStatus: filters.analysisStatus,
        isFake: filters.isFake,
        needsHumanReview: filters.needsHumanReview,
        isBotLikely: filters.isBotLikely,
        isSpamSuspected: filters.isSpamSuspected,
        minTrust: filters.minTrust,
      })
      setRows(payload.items || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [
    filters.analysisStatus,
    filters.isFake,
    filters.needsHumanReview,
    filters.isBotLikely,
    filters.isSpamSuspected,
    filters.minTrust,
  ])

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadReviews()
    }, 0)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [loadReviews, refreshVersion])

  async function submitManualReview(event) {
    event.preventDefault()
    setError('')
    setImportMessage('')
    try {
      const payload = await api.importReviewsJson({
        autoAnalyze: true,
        reviews: [
          {
            reviewText: manualForm.reviewText,
            productName: manualForm.productName,
            productCategory: manualForm.productCategory,
            consumerName: manualForm.consumerName,
            language: manualForm.language,
            rating: Number(manualForm.rating),
            verifiedPurchase: Boolean(manualForm.verifiedPurchase),
          },
        ],
      })
      setImportMessage(
        `Imported ${payload.importedCount} review(s). Analysis: ${payload.analysis}.`,
      )
      setManualForm((current) => ({ ...current, reviewText: '' }))
      await loadReviews()
    } catch (err) {
      setError(err.message)
    }
  }

  async function uploadDataset() {
    if (!selectedFile) {
      setError('Select a CSV/JSON file first.')
      return
    }

    setError('')
    setImportMessage('')
    try {
      setUploading(true)
      const payload = await api.importReviewsFile({ file: selectedFile, autoAnalyze: true })
      setImportMessage(
        `Imported ${payload.importedCount} review(s), duplicates: ${payload.duplicateCount}, near-duplicates: ${payload.nearDuplicateCount}, spam-flagged: ${payload.spamFlaggedCount}, bot-flagged: ${payload.botFlaggedCount || 0}.`,
      )
      setSelectedFile(null)
      await loadReviews()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  async function submitFeedReview(event) {
    event.preventDefault()
    setError('')
    setImportMessage('')
    try {
      await api.createFeedReview({
        reviewText: feedForm.reviewText,
        productName: feedForm.productName,
        productCategory: feedForm.productCategory,
        consumerName: feedForm.consumerName,
        language: feedForm.language,
        rating: Number(feedForm.rating),
        verifiedPurchase: Boolean(feedForm.verifiedPurchase),
        immediateAnalyze: true,
      })
      setImportMessage('Simulated API feed review added and analyzed.')
      setFeedForm((current) => ({ ...current, reviewText: '' }))
      await loadReviews()
    } catch (err) {
      setError(err.message)
    }
  }

  async function runAnalyze(reviewId) {
    setError('')
    try {
      setAnalyzingId(reviewId)
      await api.analyzeReview(reviewId)
      await loadReviews()
    } catch (err) {
      setError(err.message)
    } finally {
      setAnalyzingId('')
    }
  }

  return (
    <section>
      <header className="section-header">
        <div>
          <h2 className="section-title">Review Explorer</h2>
          <p className="section-subtitle">
            Upload review datasets, trigger analysis, and inspect fake/sarcasm/trust outputs.
          </p>
        </div>
      </header>

      <div className="actions-row">
        <input
          type="file"
          accept=".csv,.json"
          onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
        />
        <button onClick={uploadDataset} disabled={uploading}>
          {uploading ? 'Uploading...' : 'Upload Dataset'}
        </button>
        {selectedFile ? <span className="muted">Selected: {selectedFile.name}</span> : null}
      </div>

      <form onSubmit={submitFeedReview}>
        <div className="section-subblock">
          <h3 className="section-title" style={{ fontSize: 16, margin: 0 }}>Simulated API Feed</h3>
          <div className="form-grid" style={{ marginTop: 10 }}>
            <input
              placeholder="Product name"
              value={feedForm.productName}
              onChange={(event) =>
                setFeedForm((current) => ({ ...current, productName: event.target.value }))
              }
              required
            />
            <input
              placeholder="Consumer name"
              value={feedForm.consumerName}
              onChange={(event) =>
                setFeedForm((current) => ({ ...current, consumerName: event.target.value }))
              }
              required
            />
            <select
              value={feedForm.productCategory}
              onChange={(event) =>
                setFeedForm((current) => ({ ...current, productCategory: event.target.value }))
              }
            >
              <option value="general">General</option>
              <option value="electronics">Electronics</option>
              <option value="beauty">Beauty</option>
              <option value="food">Food</option>
              <option value="grocery">Grocery</option>
            </select>
          </div>
          <textarea
            placeholder="Push a single review as API feed payload..."
            value={feedForm.reviewText}
            onChange={(event) =>
              setFeedForm((current) => ({ ...current, reviewText: event.target.value }))
            }
            required
          />
          <div className="actions-row">
            <button type="submit">Push to Feed</button>
          </div>
        </div>
      </form>

      <form onSubmit={submitManualReview}>
        <div className="form-grid">
          <input
            placeholder="Product name"
            value={manualForm.productName}
            onChange={(event) =>
              setManualForm((current) => ({ ...current, productName: event.target.value }))
            }
            required
          />
          <input
            placeholder="Consumer name"
            value={manualForm.consumerName}
            onChange={(event) =>
              setManualForm((current) => ({ ...current, consumerName: event.target.value }))
            }
            required
          />
          <select
            value={manualForm.productCategory}
            onChange={(event) =>
              setManualForm((current) => ({ ...current, productCategory: event.target.value }))
            }
          >
            <option value="general">General</option>
            <option value="electronics">Electronics</option>
            <option value="beauty">Beauty</option>
            <option value="food">Food</option>
            <option value="grocery">Grocery</option>
          </select>
          <select
            value={manualForm.language}
            onChange={(event) =>
              setManualForm((current) => ({ ...current, language: event.target.value }))
            }
          >
            <option value="en">English</option>
            <option value="hi">Hindi</option>
            <option value="ta">Tamil</option>
            <option value="te">Telugu</option>
            <option value="kn">Kannada</option>
            <option value="ml">Malayalam</option>
          </select>
          <select
            value={manualForm.rating}
            onChange={(event) =>
              setManualForm((current) => ({ ...current, rating: event.target.value }))
            }
          >
            <option value="5">5</option>
            <option value="4">4</option>
            <option value="3">3</option>
            <option value="2">2</option>
            <option value="1">1</option>
          </select>
          <select
            value={manualForm.verifiedPurchase ? 'true' : 'false'}
            onChange={(event) =>
              setManualForm((current) => ({
                ...current,
                verifiedPurchase: event.target.value === 'true',
              }))
            }
          >
            <option value="true">Verified Purchase</option>
            <option value="false">Not Verified</option>
          </select>
        </div>
        <textarea
          placeholder="Paste review text here..."
          value={manualForm.reviewText}
          onChange={(event) =>
            setManualForm((current) => ({ ...current, reviewText: event.target.value }))
          }
          required
        />
        <div className="actions-row">
          <button className="primary" type="submit">
            Add + Analyze Review
          </button>
        </div>
      </form>

      <div className="actions-row">
        <select
          value={filters.analysisStatus}
          onChange={(event) =>
            setFilters((current) => ({ ...current, analysisStatus: event.target.value }))
          }
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
        <select
          value={filters.isFake}
          onChange={(event) => setFilters((current) => ({ ...current, isFake: event.target.value }))}
        >
          <option value="">All fake flags</option>
          <option value="true">Fake only</option>
          <option value="false">Non-fake only</option>
        </select>
        <select
          value={filters.needsHumanReview}
          onChange={(event) =>
            setFilters((current) => ({ ...current, needsHumanReview: event.target.value }))
          }
        >
          <option value="">All review-queue states</option>
          <option value="true">Needs human review</option>
        </select>
        <select
          value={filters.isBotLikely}
          onChange={(event) =>
            setFilters((current) => ({ ...current, isBotLikely: event.target.value }))
          }
        >
          <option value="">All bot flags</option>
          <option value="true">Bot-likely only</option>
        </select>
        <select
          value={filters.isSpamSuspected}
          onChange={(event) =>
            setFilters((current) => ({ ...current, isSpamSuspected: event.target.value }))
          }
        >
          <option value="">All spam flags</option>
          <option value="true">Spam-suspected only</option>
        </select>
        <input
          type="number"
          min="0"
          max="100"
          step="0.1"
          placeholder="Min trust"
          value={filters.minTrust}
          onChange={(event) => setFilters((current) => ({ ...current, minTrust: event.target.value }))}
        />
        <button onClick={loadReviews}>Apply filters</button>
      </div>

      {importMessage ? <p className="muted">{importMessage}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      {loading ? (
        <p className="muted">Loading reviews...</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Created</th>
                <th>Product</th>
                <th>Consumer</th>
                <th>Review</th>
                <th>Flags</th>
                <th>Trust</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {!rows.length ? (
                <tr>
                  <td colSpan={7} className="muted">
                    No reviews found.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row._id}>
                    <td>{new Date(row.createdAt).toLocaleString()}</td>
                    <td>
                      <strong>{row.productId?.name || '-'}</strong>
                      <br />
                      <span className="muted">{row.productId?.category || ''}</span>
                    </td>
                    <td>{row.consumerId?.name || '-'}</td>
                    <td>
                      <div>{row.text}</div>
                      {row.translatedText ? (
                        <div className="muted" style={{ marginTop: 6 }}>
                          EN: {row.translatedText}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <span className={confidencePill(row.fakeConfidence || 0)}>
                        Fake {(Number(row.fakeConfidence || 0) * 100).toFixed(0)}%
                      </span>
                      <br />
                      <span className={confidencePill(row.sarcasmScore || 0)}>
                        Sarcasm {(Number(row.sarcasmScore || 0) * 100).toFixed(0)}%
                      </span>
                      <br />
                      {row.flags?.isAmbiguous ? (
                        <span className="pill warn">Ambiguous</span>
                      ) : (
                        <span className="pill good">Clear sentiment</span>
                      )}
                      <br />
                      {row.flags?.isSpamSuspected ? (
                        <span className="pill warn">Spam suspected</span>
                      ) : null}
                      {row.flags?.isBotLikely ? (
                        <>
                          <br />
                          <span className="pill bad">Bot likely</span>
                        </>
                      ) : null}
                      {row.flags?.needsHumanReview ? (
                        <>
                          <br />
                          <span className="pill warn">Needs human review</span>
                        </>
                      ) : null}
                    </td>
                    <td>
                      <span className={trustPill(row.reviewTrustScore || 0)}>
                        {(row.reviewTrustScore || 0).toFixed(1)}
                      </span>
                      <br />
                      <span className="muted">{row.analysisStatus}</span>
                    </td>
                    <td>
                      <button onClick={() => runAnalyze(row._id)} disabled={analyzingId === row._id}>
                        {analyzingId === row._id ? 'Analyzing...' : 'Analyze'}
                      </button>
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
