export default function RelevanceTag({ page, relevance }) {
  const pct = Math.round(relevance * 100)
  return (
    <div
      className="ribbon-shape inline-flex flex-col items-center justify-center px-2 pt-1 pb-3 min-w-[52px]"
      style={{ background: '#B9862E' }}
      title={`Page ${page} · ${pct}% match`}
    >
      <span className="font-mono text-white text-[10px] font-medium leading-tight">
        p.{page}
      </span>
      <span className="font-mono text-white text-[10px] leading-tight">
        {pct}%
      </span>
    </div>
  )
}
