export default function Header({ streak = 0 }) {
  return (
    <header
      className="relative z-10 flex items-center px-6 shrink-0"
      style={{ height: '60px', background: 'rgba(13,17,23,0.7)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, rgba(30,111,85,0.7) 0%, rgba(30,111,85,0.35) 100%)', border: '1px solid rgba(30,111,85,0.4)' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 4h7a3 3 0 0 1 0 6H2V4z" stroke="#25a07a" strokeWidth="1.5" fill="none" />
            <circle cx="12.5" cy="12" r="2.5" stroke="rgba(185,134,46,0.8)" strokeWidth="1" fill="none" />
            <path d="M14.5 14L16 15.5" stroke="rgba(185,134,46,0.8)" strokeWidth="1" strokeLinecap="round" />
          </svg>
        </div>
        <span className="font-display text-xl font-semibold tracking-tight" style={{ color: 'rgba(255,255,255,0.95)' }}>
          ExplainX
        </span>
        <span className="hidden md:block text-xs font-body" style={{ color: 'rgba(255,255,255,0.35)' }}>
          Understand every chapter — no AI shortcuts.
        </span>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {streak > 0 && (
          <span className="text-xs font-body font-medium px-3 py-1 rounded-full flex items-center gap-1"
            style={{ background: streak >= 7 ? 'rgba(185,134,46,0.15)' : 'rgba(255,255,255,0.05)', border: `1px solid ${streak >= 7 ? 'rgba(185,134,46,0.35)' : 'rgba(255,255,255,0.10)'}`, color: streak >= 7 ? 'rgba(185,134,46,0.9)' : 'rgba(255,255,255,0.40)' }}
            title={`${streak}-day study streak`}
          >
            🔥 {streak}d
          </span>
        )}
        <span className="shrink-0 text-xs font-body px-3 py-1 rounded-full"
          style={{ border: '1px solid rgba(185,134,46,0.35)', color: 'rgba(185,134,46,0.8)' }}>
          SDG 4 · Quality Education
        </span>
      </div>
    </header>
  )
}
