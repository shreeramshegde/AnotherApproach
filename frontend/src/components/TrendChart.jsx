import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

export function TrendChart({ points }) {
  const chartData = (points || []).map((point) => ({
    date: point.date,
    fakePct: Number((point.fakeRate * 100).toFixed(2)),
    sarcasmPct: Number((point.sarcasmRate * 100).toFixed(2)),
    avgTrust: Number((point.avgTrust || 0).toFixed(2)),
  }))

  if (!chartData.length) {
    return <p className="muted">No trend points yet. Import and analyze reviews first.</p>
  }

  return (
    <div style={{ width: '100%', height: 320 }}>
      <ResponsiveContainer>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line
            type="monotone"
            dataKey="fakePct"
            stroke="#dc2626"
            name="Fake %"
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="sarcasmPct"
            stroke="#f59e0b"
            name="Sarcasm %"
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="avgTrust"
            stroke="#2563eb"
            name="Avg Trust"
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
