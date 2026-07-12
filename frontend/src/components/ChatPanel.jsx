import { useEffect, useRef, useState } from 'react'
import { askQuestion } from '../api.js'
import EmptyState from './EmptyState.jsx'
import MessageBubble from './MessageBubble.jsx'

export default function ChatPanel({ sessionId }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    setMessages([])
    setInput('')
  }, [sessionId])

  const send = async () => {
    const q = input.trim()
    if (!q || !sessionId || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: q }])
    setLoading(true)
    setMessages(prev => [...prev, { role: 'bot', mode: 'typing', text: '' }])
    try {
      const res = await askQuestion(sessionId, q)
      const data = res.data
      setMessages(prev => {
        const without = prev.filter(m => m.mode !== 'typing')
        return [...without, { role: 'bot', text: data.answer, matches: data.matches, mode: data.mode }]
      })
    } catch (err) {
      const msg = err?.response?.data?.error || 'Something went wrong. Please try again.'
      setMessages(prev => {
        const without = prev.filter(m => m.mode !== 'typing')
        return [...without, { role: 'bot', text: msg, matches: [], mode: 'no_match' }]
      })
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  if (!sessionId) return <EmptyState />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Messages */}
      <div className="chat-scroll" style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-2 fade-in">
            <p className="font-display text-xl font-semibold" style={{ color: 'rgba(255,255,255,0.75)' }}>Chapter loaded.</p>
            <p className="font-body text-sm max-w-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Ask anything about what you just uploaded.
            </p>
          </div>
        )}
        {messages.map((msg, i) => <MessageBubble key={i} message={msg} />)}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div style={{ flexShrink: 0, padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(13,17,23,0.5)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            className="glass-input flex-1 resize-none px-4 py-3 text-sm font-body leading-relaxed"
            placeholder="Ask about this chapter..."
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            style={{ maxHeight: '120px', overflowY: 'auto' }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            className="send-btn"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M14 8L2 2l2.5 6L2 14l12-6z" fill="white" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
