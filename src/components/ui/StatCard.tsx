export function StatCard({ label, value, detail, tone = 'blue' }: { label: string; value: string; detail: string; tone?: 'blue' | 'green' | 'amber' | 'slate' }) {
  return <article className={`stat-card ${tone}`}><div className="stat-top"><span>{label}</span><i /></div><strong>{value}</strong><small>{detail}</small></article>
}
