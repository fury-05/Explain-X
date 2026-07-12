export default function ChapterOutline({ keywords }) {
  if (!keywords || keywords.length === 0) return null
  return (
    <div className="mt-4">
      <p className="text-xs font-body uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.30)' }}>
        Try asking about:
      </p>
      <div className="flex flex-wrap gap-2">
        {keywords.map((kw, i) => (
          <span key={i} className="kw-pill">#{kw}</span>
        ))}
      </div>
    </div>
  )
}
