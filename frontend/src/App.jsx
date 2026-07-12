import { useEffect, useState } from 'react'
import { checkHealth } from './api.js'
import PasswordGate from './components/PasswordGate.jsx'
import Header from './components/Header.jsx'
import UploadPanel from './components/UploadPanel.jsx'
import ChatPanel from './components/ChatPanel.jsx'

const STUDENTS = ['Sahil', 'Yahya', 'Abdan', 'Sarim']
const SCHOOL   = 'Good Samaritan School'

export default function App() {
  const [unlocked, setUnlocked] = useState(false)
  const [sessionId, setSessionId] = useState(null)
  const [backendDown, setBackendDown] = useState(false)

  useEffect(() => {
    if (unlocked) checkHealth().catch(() => setBackendDown(true))
  }, [unlocked])

  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />

  return (
    <div id="app-root">
      {/* Decorative background — purely visual, z-index 0 */}
      <div className="bg-scene" aria-hidden="true" />
      <div className="orb orb-1" aria-hidden="true" />
      <div className="orb orb-2" aria-hidden="true" />
      <div className="orb orb-3" aria-hidden="true" />

      {/* Header row */}
      <div id="app-header">
        <Header />
        {backendDown && (
          <div className="backend-warn">
            Backend is not responding. Make sure the server is running.
          </div>
        )}
      </div>

      {/* Two-pane body */}
      <div id="app-body">
        {/* Left shelf */}
        <div id="app-shelf">
          <p className="shelf-label">The Shelf</p>
          <UploadPanel onChapterLoaded={sid => setSessionId(sid)} />

          {/* School + students card */}
          <div style={{
            borderRadius: '14px',
            padding: '14px 16px',
            background: 'rgba(30,111,85,0.08)',
            border: '1px solid rgba(30,111,85,0.18)',
          }}>
            <p style={{
              fontFamily: 'Work Sans, sans-serif',
              fontSize: '10px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.10em',
              color: 'rgba(30,111,85,0.80)',
              marginBottom: '10px',
            }}>
              {SCHOOL}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {STUDENTS.map((name, i) => (
                <span key={i} style={{
                  fontFamily: 'Work Sans, sans-serif',
                  fontSize: '11px',
                  fontWeight: 500,
                  padding: '3px 10px',
                  borderRadius: '50px',
                  background: 'rgba(185,134,46,0.12)',
                  border: '1px solid rgba(185,134,46,0.28)',
                  color: 'rgba(185,134,46,0.88)',
                }}>
                  {name}
                </span>
              ))}
            </div>
          </div>

          <div className="shelf-footer">
            Built for UN SDG 4: Quality Education — making one-on-one chapter tutoring accessible without paid AI tools.
          </div>
        </div>

        {/* Right conversation */}
        <div id="app-chat">
          <ChatPanel sessionId={sessionId} />
        </div>
      </div>
    </div>
  )
}
