export default function EmptyState() {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '24px', padding: '32px', textAlign: 'center', userSelect: 'none' }} className="fade-in">
      <div className="w-20 h-20 rounded-2xl flex items-center justify-center"
        style={{
          background: 'linear-gradient(135deg, rgba(30,111,85,0.2) 0%, rgba(30,111,85,0.08) 100%)',
          border: '1px solid rgba(30,111,85,0.2)',
        }}>
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="4" y="4" width="20" height="28" rx="3" stroke="rgba(30,111,85,0.7)" strokeWidth="1.5" />
          <line x1="9" y1="12" x2="19" y2="12" stroke="rgba(30,111,85,0.5)" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="9" y1="17" x2="19" y2="17" stroke="rgba(30,111,85,0.5)" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="9" y1="22" x2="15" y2="22" stroke="rgba(30,111,85,0.5)" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="27" cy="27" r="7" stroke="rgba(185,134,46,0.6)" strokeWidth="1.5" fill="none" />
          <path d="M31.9 31.9L34.5 34.5" stroke="rgba(185,134,46,0.6)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <div>
        <h2 className="font-display text-2xl font-semibold mb-2 tracking-tight" style={{ color: 'rgba(255,255,255,0.85)' }}>
          Nothing to ask yet.
        </h2>
        <p className="font-body text-sm leading-relaxed max-w-xs" style={{ color: 'rgba(255,255,255,0.40)' }}>
          Upload a chapter PDF on the left and ExplainX will read it — then ask anything.
        </p>
      </div>
    </div>
  )
}
