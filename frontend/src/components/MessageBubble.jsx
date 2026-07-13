import { useState } from 'react'
import Markdown from 'react-markdown'

const BOOKMARK_KEY = 'explainx_bookmarks'

function loadBookmarks() {
  try { return JSON.parse(localStorage.getItem(BOOKMARK_KEY) || '[]') } catch { return [] }
}
function saveBookmarks(bm) {
  try { localStorage.setItem(BOOKMARK_KEY, JSON.stringify(bm)) } catch {}
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <button onClick={copy} title="Copy" style={{ position: 'absolute', top: '8px', right: '28px', background: 'none', border: 'none', cursor: 'pointer', opacity: copied ? 1 : 0, transition: 'opacity 0.15s', padding: '3px' }} className="copy-btn">
      {copied
        ? <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 7l3 3 6-6" stroke="rgba(30,111,85,0.9)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
        : <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="4" y="1" width="8" height="8" rx="1.5" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2"/><path d="M1 4.5V11a1.5 1.5 0 0 0 1.5 1.5H9" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" strokeLinecap="round"/></svg>
      }
    </button>
  )
}

function BookmarkButton({ text }) {
  const isBookmarked = () => loadBookmarks().some(b => b.text === text)
  const [bookmarked, setBookmarked] = useState(isBookmarked)
  const toggle = () => {
    const bms = loadBookmarks()
    if (bookmarked) {
      saveBookmarks(bms.filter(b => b.text !== text))
    } else {
      saveBookmarks([{ text, savedAt: new Date().toISOString() }, ...bms])
    }
    setBookmarked(b => !b)
  }
  return (
    <button onClick={toggle} title={bookmarked ? 'Remove bookmark' : 'Bookmark answer'}
      style={{ position: 'absolute', top: '8px', right: '8px', background: 'none', border: 'none', cursor: 'pointer', opacity: bookmarked ? 1 : 0, transition: 'opacity 0.15s', padding: '3px' }}
      className="copy-btn"
    >
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
        <path d="M2 2h9v10l-4.5-3L2 12V2z" stroke={bookmarked ? 'rgba(185,134,46,0.9)' : 'rgba(255,255,255,0.35)'} strokeWidth="1.3" fill={bookmarked ? 'rgba(185,134,46,0.3)' : 'none'} strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  )
}

function SourceBadge({ mode, matches }) {
  const [open, setOpen] = useState(false)
  if (!matches || matches.length === 0) return null

  const badgeStyle = mode === 'partial'
    ? { background: 'rgba(185,134,46,0.15)', border: '1px solid rgba(185,134,46,0.35)', color: 'rgba(185,134,46,0.95)' }
    : { background: 'rgba(30,111,85,0.15)', border: '1px solid rgba(30,111,85,0.35)', color: 'rgba(37,160,122,0.95)' }
  const label = mode === 'partial' ? 'Partial match' : 'Found'
  const pages = [...new Set(matches.map(m => m.page))].sort((a, b) => a - b)

  return (
    <div style={{ marginTop: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
        <span className="font-body" style={{ fontSize: '10px', fontWeight: 600, borderRadius: '50px', padding: '2px 8px', ...badgeStyle }}>{label}</span>
        {pages.map(pg => (
          <span key={pg} className="font-mono" style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '50px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.45)' }}>p.{pg}</span>
        ))}
        {matches[0]?.snippet && (
          <button onClick={() => setOpen(o => !o)} className="font-body" style={{ fontSize: '10px', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.30)', padding: 0, textDecoration: 'underline' }}>
            {open ? 'hide source' : 'see source'}
          </button>
        )}
      </div>
      {open && (
        <div className="fade-in" style={{ marginTop: '6px', padding: '8px 10px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', fontSize: '11px', fontFamily: 'IBM Plex Mono, monospace', color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
          {matches[0].snippet}
        </div>
      )}
    </div>
  )
}

export default function MessageBubble({ message, sessionId, onEli12 }) {
  const { role, text, mode, matches } = message

  if (role === 'user') {
    return (
      <div className="flex justify-end mb-4 fade-up">
        <div className="bubble-user max-w-[72%] px-4 py-3 text-sm font-body leading-relaxed">{text}</div>
      </div>
    )
  }

  if (mode === 'typing') {
    return (
      <div className="flex justify-start mb-4 fade-in">
        <div className="bubble-bot px-5 py-4 flex items-center gap-1.5">
          <span className="dot-pulse w-2 h-2 rounded-full inline-block" style={{ background: 'rgba(30,111,85,0.8)' }} />
          <span className="dot-pulse w-2 h-2 rounded-full inline-block" style={{ background: 'rgba(30,111,85,0.8)' }} />
          <span className="dot-pulse w-2 h-2 rounded-full inline-block" style={{ background: 'rgba(30,111,85,0.8)' }} />
        </div>
      </div>
    )
  }

  if (mode === 'no_match') {
    return (
      <div className="flex justify-start mb-4 fade-up">
        <div className="bubble-nomatch max-w-[80%] px-4 py-3 text-sm font-body leading-relaxed">{text}</div>
      </div>
    )
  }

  return (
    <div className="flex justify-start mb-4 fade-up">
      <div className="bubble-bot max-w-[80%] px-4 py-3 text-sm font-body leading-relaxed relative bubble-copyable md-bubble" style={{ paddingRight: '52px' }}>
        <Markdown>{text}</Markdown>
        <SourceBadge mode={mode} matches={matches} />
        {onEli12 && (
          <button
            onClick={() => onEli12(text)}
            title="Explain simply (ELI12)"
            className="font-body"
            style={{ marginTop: '6px', fontSize: '10px', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.25)', padding: 0, textDecoration: 'underline' }}
          >
            explain simply
          </button>
        )}
        <CopyButton text={text} />
        <BookmarkButton text={text} />
      </div>
    </div>
  )
}

export { loadBookmarks }
