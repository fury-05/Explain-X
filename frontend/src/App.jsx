import { useEffect, useState } from 'react'
import { checkHealth, loadToken, getConfig } from './api.js'
import PasswordGate from './components/PasswordGate.jsx'
import Header from './components/Header.jsx'
import UploadPanel from './components/UploadPanel.jsx'
import ChatPanel from './components/ChatPanel.jsx'

const STREAK_KEY = 'explainx_streak'

function updateStreak() {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const stored = JSON.parse(localStorage.getItem(STREAK_KEY) || '{}')
    if (stored.last === today) return stored.count || 1
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const count = stored.last === yesterday ? (stored.count || 1) + 1 : 1
    localStorage.setItem(STREAK_KEY, JSON.stringify({ last: today, count }))
    return count
  } catch { return 1 }
}

export default function App() {
  const [unlocked, setUnlocked]               = useState(() => !!loadToken())
  const [sessionId, setSessionId]             = useState(null)
  const [sessionFilename, setSessionFilename] = useState(null)
  const [backendDown, setBackendDown]         = useState(false)
  const [school, setSchool]                   = useState('Good Samaritan School')
  const [students, setStudents]               = useState(['Sahil', 'Yahya', 'Abdan', 'Sarim'])
  const [streak, setStreak]                   = useState(1)

  useEffect(() => {
    if (!unlocked) return
    checkHealth().catch(() => setBackendDown(true))
    getConfig().then(r => {
      if (r.data.school) setSchool(r.data.school)
      if (r.data.students?.length) setStudents(r.data.students)
    }).catch(() => {})
    setStreak(updateStreak())
  }, [unlocked])

  const handleChapterLoaded = (data) => {
    if (!data) { setSessionId(null); setSessionFilename(null); return }
    setSessionId(data.session_id)
    setSessionFilename(data.filename)
    try {
      localStorage.setItem(`explainx_keywords_${data.filename}`, JSON.stringify(data.top_keywords || []))
    } catch {}
  }

  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />

  return (
    <div id="app-root">
      <div className="bg-scene" aria-hidden="true" />
      <div className="orb orb-1" aria-hidden="true" />
      <div className="orb orb-2" aria-hidden="true" />
      <div className="orb orb-3" aria-hidden="true" />

      <div id="app-header">
        <Header streak={streak} />
        {backendDown && (
          <div className="backend-warn">
            Backend is not responding. Make sure the server is running.
          </div>
        )}
      </div>

      <div id="app-body">
        <div id="app-shelf">
          <p className="shelf-label">The Shelf</p>
          <UploadPanel onChapterLoaded={handleChapterLoaded} />

          <div style={{ borderRadius: '14px', padding: '14px 16px', background: 'rgba(30,111,85,0.08)', border: '1px solid rgba(30,111,85,0.18)' }}>
            <p style={{ fontFamily: 'Work Sans, sans-serif', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.10em', color: 'rgba(30,111,85,0.80)', marginBottom: '10px' }}>
              {school}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {students.map((name, i) => (
                <span key={i} style={{ fontFamily: 'Work Sans, sans-serif', fontSize: '11px', fontWeight: 500, padding: '3px 10px', borderRadius: '50px', background: 'rgba(185,134,46,0.12)', border: '1px solid rgba(185,134,46,0.28)', color: 'rgba(185,134,46,0.88)' }}>
                  {name}
                </span>
              ))}
            </div>
          </div>

          <div className="shelf-footer">
            Built for UN SDG 4: Quality Education — making one-on-one chapter tutoring accessible without paid AI tools.
          </div>
        </div>

        <div id="app-chat">
          <ChatPanel
            sessionId={sessionId}
            sessionFilename={sessionFilename}
            onSessionExpired={() => { setSessionId(null); setSessionFilename(null) }}
          />
        </div>
      </div>
    </div>
  )
}
