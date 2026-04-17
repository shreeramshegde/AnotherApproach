export function StatCard({ label, value }) {
  return (
    <article className="card">
      <p className="card-label">{label}</p>
      <p className="card-value">{value}</p>
    </article>
  )
}
