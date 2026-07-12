import { useEffect, useState } from 'react'
import { checkHealth } from './api.js'
import PasswordGate from './components/PasswordGate.jsx'
import Header from './components/Header.jsx'
import UploadPanel from './components/UploadPanel.jsx'
import ChatPanel from './components/ChatPanel.jsx'

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
