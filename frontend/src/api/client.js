const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

function buildUrl(path, query = {}) {
  const url = new URL(`${API_BASE_URL}${path}`, window.location.origin)
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    url.searchParams.set(key, String(value))
  }

  const baseOrigin = window.location.origin
  if (url.origin === baseOrigin) {
    return `${url.pathname}${url.search}`
  }
  return url.toString()
}

async function request(path, options = {}, query = undefined) {
  const response = await fetch(buildUrl(path, query), options)
  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text()

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload?.error
        ? payload.error
        : `Request failed with status ${response.status}`
    throw new Error(message)
  }

  return payload
}

export const api = {
  getOverview: () => request('/dashboard/overview'),
  getTrends: (params = {}) => request('/dashboard/trends', {}, params),
  getProducts: () => request('/dashboard/products'),
  getConsumers: () => request('/dashboard/consumers'),
  getModelHealth: () => request('/dashboard/health/models'),
  downloadReport: async () => {
    const response = await fetch(buildUrl('/dashboard/report'))
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`)
    }
    return response.text()
  },
  getReviews: (params = {}) => request('/reviews', {}, params),
  analyzeReview: (reviewId) =>
    request(`/reviews/${reviewId}/analyze`, {
      method: 'POST',
    }),
  importReviewsJson: (payload) =>
    request('/reviews/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  importReviewsFile: ({ file, autoAnalyze = true }) => {
    const form = new FormData()
    form.append('file', file)
    form.append('autoAnalyze', String(autoAnalyze))
    return request('/reviews/import', {
      method: 'POST',
      body: form,
    })
  },
}
