import { useEffect, useState } from 'react'
import { verifyPassword, saveToken, getConfig } from '../api.js'

export default function PasswordGate({ onUnlock }) {
  const [pw, setPw]           = useState('')
  const [student, setStudent] = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const [shake, setShake]     = useState(false)
  const [school, setSchool]   = useState('Good Samaritan School')
  const [students, setStudents] = useState(['Sahil', 'Yahya', 'Abdan', 'Sarim'])

  useEffect(() => {
    getConfig().then(r => {
      if (r.data.school) setSchool(r.data.school)
      if (r.data.students?.length) setStudents(r.data.students)
    }).catch(() => {})
  }, [])

  const submit = async (e) => {
    e?.preventDefault()
    if (!pw.trim() || loading) return
    setLoading(true)
    setError('')
    try {
      const res = await verifyPassword(pw.trim(), student)
      saveToken(res.data.token)
      onUnlock()
    } catch {
      setError('Incorrect password. Try again.')
      setShake(true)
      setPw('')
      setTimeout(() => setShake(false), 600)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <div className="bg-scene" />
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div className="relative z-10 w-full mx-4 scale-in" style={{ maxWidth: '420px' }}>
        <div className="glass-deep flex flex-col items-center gap-5" style={{ padding: '36px 40px' }}>

          {/* Logo */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, rgba(30,111,85,0.6) 0%, rgba(30,111,85,0.3) 100%)', border: '1px solid rgba(30,111,85,0.4)' }}>
              <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                <path d="M6 8h12a6 6 0 0 1 0 12H6V8z" stroke="#25a07a" strokeWidth="2" fill="none" />
                <path d="M6 14h10" stroke="#25a07a" strokeWidth="2" strokeLinecap="round" />
                <circle cx="24" cy="24" r="5" stroke="rgba(185,134,46,0.8)" strokeWidth="1.5" fill="none" />
                <path d="M27.5 27.5L30 30" stroke="rgba(185,134,46,0.8)" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <div className="text-center">
              <h1 className="font-display text-3xl font-semibold shimmer-text tracking-tight">ExplainX</h1>
              <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>
                Understand every chapter — no AI shortcuts, just your own textbook, understood.
              </p>
            </div>
          </div>

          {/* School + student selector */}
          <div className="w-full rounded-xl px-4 py-3" style={{ background: 'rgba(30,111,85,0.10)', border: '1px solid rgba(30,111,85,0.20)' }}>
            <p className="text-xs font-body font-semibold uppercase tracking-widest mb-3 text-center" style={{ color: 'rgba(30,111,85,0.85)' }}>
              {school}
            </p>
            <div className="flex justify-center gap-2 flex-wrap">
              {students.map((name, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setStudent(name === student ? '' : name)}
                  className="text-xs font-body px-3 py-1 rounded-full transition-all"
                  style={{
                    background: student === name ? 'rgba(185,134,46,0.28)' : 'rgba(185,134,46,0.12)',
                    border: `1px solid ${student === name ? 'rgba(185,134,46,0.60)' : 'rgba(185,134,46,0.30)'}`,
                    color: student === name ? 'rgba(185,134,46,1.0)' : 'rgba(185,134,46,0.90)',
                    cursor: 'pointer',
                    fontWeight: student === name ? 700 : 500,
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
            {student && (
              <p className="text-center text-xs mt-2 font-body fade-in" style={{ color: 'rgba(30,111,85,0.70)' }}>
                Logging in as <strong>{student}</strong>
              </p>
            )}
          </div>

          <div className="w-full h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />

          <div className="flex flex-col items-center gap-1">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ color: 'var(--muted)' }}>
              <rect x="3" y="8" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" />
              <path d="M6 8V5.5a3 3 0 0 1 6 0V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <p className="text-sm font-body" style={{ color: 'var(--text-dim)' }}>Enter password to access</p>
          </div>

          <form onSubmit={submit} className="w-full flex flex-col gap-3">
            <div style={{ animation: shake ? 'shake 0.5s cubic-bezier(0.36,0.07,0.19,0.97) both' : 'none' }}>
              <input
                type="password"
                className="glass-input w-full px-5 py-3 text-sm font-body"
                placeholder="Enter password..."
                value={pw}
                onChange={e => setPw(e.target.value)}
                autoFocus
              />
            </div>
            {error && <p className="text-xs text-center fade-in" style={{ color: 'rgba(178,75,65,0.9)' }}>{error}</p>}
            <button type="submit" disabled={!pw.trim() || loading} className="btn-glass w-full py-3 text-sm font-semibold">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                  Verifying...
                </span>
              ) : student ? `Enter as ${student}` : 'Enter'}
            </button>
          </form>

          <p className="text-xs text-center" style={{ color: 'rgba(255,255,255,0.20)' }}>UN SDG 4 · Quality Education</p>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          10%, 90% { transform: translateX(-2px); }
          20%, 80% { transform: translateX(4px); }
          30%, 50%, 70% { transform: translateX(-6px); }
          40%, 60% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  )
}
