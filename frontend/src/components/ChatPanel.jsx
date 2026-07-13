import { useEffect, useRef, useState, useCallback } from 'react'
import { askQuestion, getSummary, getQuiz, getFlashcards, explainSimply, getFollowups } from '../api.js'
import EmptyState from './EmptyState.jsx'
import MessageBubble, { loadBookmarks } from './MessageBubble.jsx'

const HISTORY_KEY = (f) => `explainx_chat_${f}`

function loadSavedMessages(filename) {
  if (!filename) return []
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY(filename)) || '[]') } catch { return [] }
}
function saveMessages(filename, msgs) {
  if (!filename) return
  localStorage.setItem(HISTORY_KEY(filename), JSON.stringify(msgs.filter(m => m.mode !== 'typing')))
}

export default function ChatPanel({ sessionId, sessionFilename, onSessionExpired }) {
  const [messages, setMessages]             = useState([])
  const [input, setInput]                   = useState('')
  const [loading, setLoading]               = useState(false)
  const [expired, setExpired]               = useState(false)
  const [length, setLength]                 = useState('normal')
  const [tab, setTab]                       = useState('chat')
  const [followups, setFollowups]           = useState([])
  // summary
  const [summaryTopic, setSummaryTopic]     = useState('')
  const [summaryResult, setSummaryResult]   = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError]     = useState('')
  // quiz
  const [quiz, setQuiz]                     = useState(null)
  const [quizLoading, setQuizLoading]       = useState(false)
  const [quizError, setQuizError]           = useState('')
  const [quizAnswers, setQuizAnswers]       = useState({})
  const [quizSubmitted, setQuizSubmitted]   = useState(false)
  // flashcards
  const [cards, setCards]                   = useState(null)
  const [cardsLoading, setCardsLoading]     = useState(false)
  const [cardsError, setCardsError]         = useState('')
  const [flipped, setFlipped]               = useState({})
  // bookmarks
  const [bookmarks, setBookmarks]           = useState([])

  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  // Ctrl+K focuses input (#46)
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        if (tab !== 'chat') setTab('chat')
        setTimeout(() => inputRef.current?.focus(), 50)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [tab])

  useEffect(() => {
    setMessages(loadSavedMessages(sessionFilename))
    setInput(''); setExpired(false); setTab('chat')
    setSummaryResult(null); setSummaryTopic(''); setSummaryError('')
    setQuiz(null); setQuizAnswers({}); setQuizSubmitted(false); setQuizError('')
    setCards(null); setCardsError(''); setFlipped({})
    setFollowups([])
  }, [sessionId, sessionFilename])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => { if (sessionFilename) saveMessages(sessionFilename, messages) }, [messages, sessionFilename])
  useEffect(() => { if (tab === 'bookmarks') setBookmarks(loadBookmarks()) }, [tab])

  // textarea auto-resize (#32)
  const handleInputChange = (e) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
  }

  const buildHistory = useCallback(() =>
    messages.filter(m => m.mode !== 'typing').slice(-6)
      .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }))
  , [messages])

  const sendQuestion = async (q, hist, len = length) => {
    if (!q || !sessionId || loading) return
    setFollowups([])
    setMessages(prev => [...prev, { role: 'user', text: q }])
    setLoading(true)
    setMessages(prev => [...prev, { role: 'bot', mode: 'typing', text: '' }])
    try {
      const res = await askQuestion(sessionId, q, hist, len)
      const data = res.data
      setMessages(prev => {
        const without = prev.filter(m => m.mode !== 'typing')
        return [...without, { role: 'bot', text: data.answer, matches: data.matches, mode: data.mode }]
      })
      // fetch follow-ups in background (#36)
      if (data.mode !== 'no_match') {
        getFollowups(sessionId, data.answer).then(r => setFollowups(r.data.questions || [])).catch(() => {})
      }
    } catch (err) {
      if (err?.response?.status === 404 || err?.response?.status === 401) {
        setExpired(true); setMessages(prev => prev.filter(m => m.mode !== 'typing'))
      } else {
        const msg = err?.response?.data?.error || 'Something went wrong. Please try again.'
        setMessages(prev => { const w = prev.filter(m => m.mode !== 'typing'); return [...w, { role: 'bot', text: msg, matches: [], mode: 'no_match' }] })
      }
    } finally { setLoading(false) }
  }

  const send = () => {
    const q = input.trim(); if (!q) return
    setInput('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
    sendQuestion(q, buildHistory())
  }

  const handleEli12 = async (question) => {
    if (!sessionId || loading) return
    setFollowups([])
    setMessages(prev => [...prev, { role: 'user', text: `[Simply] ${question}` }])
    setLoading(true)
    setMessages(prev => [...prev, { role: 'bot', mode: 'typing', text: '' }])
    try {
      const res = await explainSimply(sessionId, question)
      const data = res.data
      setMessages(prev => { const w = prev.filter(m => m.mode !== 'typing'); return [...w, { role: 'bot', text: data.answer, matches: [], mode: data.mode }] })
    } catch (err) {
      if (err?.response?.status === 404 || err?.response?.status === 401) {
        setExpired(true); setMessages(prev => prev.filter(m => m.mode !== 'typing'))
      } else {
        setMessages(prev => { const w = prev.filter(m => m.mode !== 'typing'); return [...w, { role: 'bot', text: 'Something went wrong.', matches: [], mode: 'no_match' }] })
      }
    } finally { setLoading(false) }
  }

  const fetchSummary = async () => {
    const topic = summaryTopic.trim(); if (!topic || summaryLoading) return
    setSummaryLoading(true); setSummaryResult(null); setSummaryError('')
    try { const res = await getSummary(sessionId, topic); setSummaryResult(res.data) }
    catch (err) {
      if (err?.response?.status === 404 || err?.response?.status === 401) setExpired(true)
      else setSummaryError(err?.response?.data?.error || 'Something went wrong.')
    } finally { setSummaryLoading(false) }
  }

  const fetchQuiz = async () => {
    setQuizLoading(true); setQuiz(null); setQuizAnswers({}); setQuizSubmitted(false); setQuizError('')
    try {
      const res = await getQuiz(sessionId)
      if (!res.data.questions?.length) setQuizError("Couldn't generate questions from this chapter.")
      else setQuiz(res.data.questions)
    } catch (err) {
      if (err?.response?.status === 404 || err?.response?.status === 401) setExpired(true)
      else setQuizError(err?.response?.data?.error || 'Something went wrong.')
    } finally { setQuizLoading(false) }
  }

  const fetchCards = async () => {
    setCardsLoading(true); setCards(null); setCardsError(''); setFlipped({})
    try {
      const res = await getFlashcards(sessionId)
      if (!res.data.cards?.length) setCardsError("Couldn't generate flashcards from this chapter.")
      else setCards(res.data.cards)
    } catch (err) {
      if (err?.response?.status === 404 || err?.response?.status === 401) setExpired(true)
      else setCardsError(err?.response?.data?.error || 'Something went wrong.')
    } finally { setCardsLoading(false) }
  }

  const exportChat = () => {
    const lines = messages.filter(m => m.mode !== 'typing').map(m => `${m.role === 'user' ? 'You' : 'ExplainX'}: ${m.text}`)
    const blob = new Blob([lines.join('\n\n')], { type: 'text/plain' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `${sessionFilename || 'chat'}-notes.txt`; a.click(); URL.revokeObjectURL(a.href)
  }

  const quizScore = quiz ? quiz.filter((q, i) => quizAnswers[i] === q.answer).length : 0
  const handleKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }
  const hasMessages = messages.filter(m => m.mode !== 'typing').length > 0

  if (!sessionId) return <EmptyState />

  const tabs = [
    { key: 'chat',       label: 'Ask' },
    { key: 'summary',    label: 'Summarize' },
    { key: 'quiz',       label: 'Quiz' },
    { key: 'flashcards', label: 'Flashcards' },
    { key: 'bookmarks',  label: 'Saved' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>

      {/* Tab bar */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px', padding: '10px 16px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', overflowX: 'auto' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className="font-body text-xs font-medium" style={{ whiteSpace: 'nowrap', padding: '6px 12px', borderRadius: '8px 8px 0 0', border: 'none', cursor: 'pointer', background: tab === t.key ? 'rgba(30,111,85,0.18)' : 'transparent', color: tab === t.key ? 'rgba(30,111,85,0.95)' : 'rgba(255,255,255,0.35)', borderBottom: tab === t.key ? '2px solid rgba(30,111,85,0.7)' : '2px solid transparent', transition: 'all 0.15s', flexShrink: 0 }}>{t.label}</button>
        ))}
        {hasMessages && (
          <button onClick={exportChat} title="Export chat (.txt)" style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', color: 'rgba(255,255,255,0.25)', flexShrink: 0 }}
            onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.6)'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.25)'}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v8M4 6l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 11h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
          </button>
        )}
      </div>

      {/* ── CHAT TAB ── */}
      {tab === 'chat' && (
        <>
          <div className="chat-scroll" style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
            {!hasMessages && !loading && (
              <EmptyWithChips sessionFilename={sessionFilename} directSend={q => sendQuestion(q, [])} />
            )}
            {messages.map((msg, i) => (
              <MessageBubble key={i} message={msg} sessionId={sessionId}
                onEli12={msg.role === 'bot' && msg.mode !== 'typing' && msg.mode !== 'no_match' ? handleEli12 : null}
              />
            ))}
            {/* follow-up chips (#36) */}
            {followups.length > 0 && !loading && (
              <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
                <p className="font-body text-xs" style={{ color: 'rgba(255,255,255,0.25)', marginLeft: '4px' }}>Follow up:</p>
                {followups.map((q, i) => (
                  <button key={i} onClick={() => { setFollowups([]); sendQuestion(q, buildHistory()) }}
                    className="font-body text-sm text-left"
                    style={{ padding: '8px 12px', borderRadius: '10px', cursor: 'pointer', background: 'rgba(30,111,85,0.06)', border: '1px solid rgba(30,111,85,0.16)', color: 'rgba(255,255,255,0.60)', transition: 'all 0.15s', alignSelf: 'flex-start' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(30,111,85,0.14)'; e.currentTarget.style.borderColor = 'rgba(30,111,85,0.35)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(30,111,85,0.06)'; e.currentTarget.style.borderColor = 'rgba(30,111,85,0.16)' }}
                  >{q}</button>
                ))}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {expired && <ExpiryBanner onReset={onSessionExpired} />}

          {/* Length toggle (#42) */}
          <div style={{ flexShrink: 0, padding: '6px 16px 0', display: 'flex', gap: '4px' }}>
            {['short', 'normal', 'detailed'].map(l => (
              <button key={l} onClick={() => setLength(l)} className="font-body"
                style={{ fontSize: '10px', padding: '3px 10px', borderRadius: '50px', border: 'none', cursor: 'pointer', background: length === l ? 'rgba(30,111,85,0.25)' : 'rgba(255,255,255,0.05)', color: length === l ? 'rgba(37,160,122,0.95)' : 'rgba(255,255,255,0.30)', transition: 'all 0.15s', textTransform: 'capitalize' }}
              >{l}</button>
            ))}
          </div>

          <div style={{ flexShrink: 0, padding: '8px 16px 12px', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(13,17,23,0.5)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                className="glass-input flex-1 resize-none px-4 py-3 text-sm font-body leading-relaxed"
                placeholder="Ask about this chapter… (Ctrl+K)"
                rows={1}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKey}
                disabled={expired}
                style={{ overflowY: 'auto', minHeight: '44px', maxHeight: '120px' }}
              />
              <button onClick={send} disabled={!input.trim() || loading || expired} className="send-btn">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M14 8L2 2l2.5 6L2 14l12-6z" fill="white" /></svg>
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── SUMMARY TAB ── */}
      {tab === 'summary' && (
        <div className="chat-scroll" style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {!expired && (
            <div className="flex gap-2">
              <input className="glass-input flex-1 px-4 py-3 text-sm font-body" placeholder="e.g. photosynthesis, World War I causes..." value={summaryTopic} onChange={e => setSummaryTopic(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchSummary()} disabled={summaryLoading} />
              <button onClick={fetchSummary} disabled={!summaryTopic.trim() || summaryLoading} className="send-btn">
                {summaryLoading ? <Spinner /> : <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M14 8L2 2l2.5 6L2 14l12-6z" fill="white" /></svg>}
              </button>
            </div>
          )}
          {summaryError && <ErrorBox msg={summaryError} />}
          {summaryResult && (
            <div className="fade-up">
              <div className="bubble-bot px-4 py-3 text-sm font-body leading-relaxed whitespace-pre-line md-bubble">{summaryResult.summary}</div>
              {summaryResult.sources?.length > 0 && <p className="mt-2 text-xs font-mono" style={{ color: 'rgba(255,255,255,0.25)' }}>Sources: pages {summaryResult.sources.map(s => s.page).join(', ')}</p>}
            </div>
          )}
          {!summaryResult && !summaryError && !summaryLoading && (
            <div className="flex flex-col items-center justify-center flex-1 text-center gap-2 fade-in">
              <p className="font-display text-xl font-semibold" style={{ color: 'rgba(255,255,255,0.75)' }}>Topic summary</p>
              <p className="font-body text-sm max-w-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>Type any topic and get a plain-English explanation from the chapter.</p>
            </div>
          )}
          {expired && <ExpiryBanner onReset={onSessionExpired} />}
        </div>
      )}

      {/* ── QUIZ TAB ── */}
      {tab === 'quiz' && (
        <div className="chat-scroll" style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {!quiz && !quizLoading && !quizError && !expired && (
            <div className="flex flex-col items-center justify-center flex-1 text-center gap-4 fade-in">
              <p className="font-display text-xl font-semibold" style={{ color: 'rgba(255,255,255,0.75)' }}>Quiz me on this chapter</p>
              <p className="font-body text-sm max-w-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>5 multiple-choice questions generated from your PDF.</p>
              <button onClick={fetchQuiz} className="btn-glass px-6 py-2.5 text-sm font-semibold">Generate quiz</button>
            </div>
          )}
          {quizLoading && <div className="flex flex-col items-center justify-center flex-1 gap-3"><Spinner /><p className="font-body text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>Generating questions…</p></div>}
          {quizError && <ErrorBox msg={quizError} />}
          {quiz && !quizLoading && (
            <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {quiz.map((q, qi) => (
                <div key={qi} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '16px' }}>
                  <p className="font-body text-sm font-medium mb-3" style={{ color: 'rgba(255,255,255,0.85)' }}>
                    <span style={{ color: 'rgba(30,111,85,0.8)', fontWeight: 700 }}>{qi + 1}. </span>{q.question}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {Object.entries(q.options).map(([letter, text]) => {
                      const selected = quizAnswers[qi] === letter
                      const correct  = quizSubmitted && letter === q.answer
                      const wrong    = quizSubmitted && selected && letter !== q.answer
                      return (
                        <button key={letter} onClick={() => !quizSubmitted && setQuizAnswers(prev => ({ ...prev, [qi]: letter }))}
                          className="font-body text-sm text-left"
                          style={{ padding: '8px 12px', borderRadius: '10px', cursor: quizSubmitted ? 'default' : 'pointer', background: correct ? 'rgba(30,111,85,0.25)' : wrong ? 'rgba(178,75,65,0.20)' : selected ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)', border: correct ? '1px solid rgba(30,111,85,0.5)' : wrong ? '1px solid rgba(178,75,65,0.4)' : selected ? '1px solid rgba(255,255,255,0.20)' : '1px solid rgba(255,255,255,0.07)', color: correct ? 'rgba(37,160,122,0.95)' : wrong ? 'rgba(220,100,90,0.9)' : 'rgba(255,255,255,0.75)', transition: 'all 0.15s' }}
                        >
                          <span style={{ fontWeight: 600, marginRight: '8px' }}>{letter})</span>{text}
                        </button>
                      )
                    })}
                  </div>
                  {/* wrong answer explanation (#33) */}
                  {quizSubmitted && quizAnswers[qi] && quizAnswers[qi] !== q.answer && q.explanation && (
                    <div className="fade-in mt-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(30,111,85,0.08)', border: '1px solid rgba(30,111,85,0.15)', fontSize: '12px', color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
                      <strong style={{ color: 'rgba(37,160,122,0.8)' }}>Why {q.answer}?</strong> {q.explanation}
                    </div>
                  )}
                </div>
              ))}
              {!quizSubmitted ? (
                <button onClick={() => setQuizSubmitted(true)} disabled={Object.keys(quizAnswers).length < quiz.length} className="btn-glass py-2.5 text-sm font-semibold" style={{ alignSelf: 'center', padding: '10px 32px' }}>Submit answers</button>
              ) : (
                <div className="fade-in" style={{ textAlign: 'center', padding: '16px', borderRadius: '14px', background: 'rgba(30,111,85,0.10)', border: '1px solid rgba(30,111,85,0.25)' }}>
                  <p className="font-display text-2xl font-semibold" style={{ color: 'rgba(37,160,122,0.95)' }}>{quizScore} / {quiz.length}</p>
                  <p className="font-body text-sm mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>{quizScore === quiz.length ? 'Perfect score!' : quizScore >= quiz.length / 2 ? 'Good effort!' : 'Keep studying!'}</p>
                  <button onClick={fetchQuiz} className="btn-glass mt-3 px-5 py-2 text-xs font-semibold">Try again</button>
                </div>
              )}
            </div>
          )}
          {expired && <ExpiryBanner onReset={onSessionExpired} />}
        </div>
      )}

      {/* ── FLASHCARDS TAB (#35) ── */}
      {tab === 'flashcards' && (
        <div className="chat-scroll" style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {!cards && !cardsLoading && !cardsError && !expired && (
            <div className="flex flex-col items-center justify-center flex-1 text-center gap-4 fade-in">
              <p className="font-display text-xl font-semibold" style={{ color: 'rgba(255,255,255,0.75)' }}>Flashcards</p>
              <p className="font-body text-sm max-w-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>8 term/definition cards generated from your chapter.</p>
              <button onClick={fetchCards} className="btn-glass px-6 py-2.5 text-sm font-semibold">Generate flashcards</button>
            </div>
          )}
          {cardsLoading && <div className="flex flex-col items-center justify-center flex-1 gap-3"><Spinner /><p className="font-body text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>Generating flashcards…</p></div>}
          {cardsError && <ErrorBox msg={cardsError} />}
          {cards && !cardsLoading && (
            <div className="fade-up">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))', gap: '12px', marginBottom: '16px' }}>
                {cards.map((card, i) => (
                  <div key={i} onClick={() => setFlipped(f => ({ ...f, [i]: !f[i] }))}
                    style={{ minHeight: '110px', borderRadius: '14px', cursor: 'pointer', perspective: '600px', userSelect: 'none' }}
                    title="Click to flip"
                  >
                    <div style={{ position: 'relative', width: '100%', height: '110px', transformStyle: 'preserve-3d', transition: 'transform 0.4s', transform: flipped[i] ? 'rotateY(180deg)' : 'none' }}>
                      {/* Front */}
                      <div style={{ position: 'absolute', inset: 0, borderRadius: '14px', padding: '14px', background: 'rgba(30,111,85,0.10)', border: '1px solid rgba(30,111,85,0.22)', backfaceVisibility: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <p className="font-body text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>{card.term}</p>
                        <p className="font-mono" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.20)' }}>tap to reveal</p>
                      </div>
                      {/* Back */}
                      <div style={{ position: 'absolute', inset: 0, borderRadius: '14px', padding: '14px', background: 'rgba(185,134,46,0.10)', border: '1px solid rgba(185,134,46,0.22)', backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', display: 'flex', alignItems: 'center' }}>
                        <p className="font-body text-sm" style={{ color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>{card.definition}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={fetchCards} className="btn-glass px-5 py-2 text-xs font-semibold" style={{ alignSelf: 'center', display: 'block', margin: '0 auto' }}>Regenerate</button>
            </div>
          )}
          {expired && <ExpiryBanner onReset={onSessionExpired} />}
        </div>
      )}

      {/* ── BOOKMARKS TAB (#41) ── */}
      {tab === 'bookmarks' && (
        <div className="chat-scroll" style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {bookmarks.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 text-center gap-2 fade-in">
              <p className="font-display text-xl font-semibold" style={{ color: 'rgba(255,255,255,0.75)' }}>No saved answers yet</p>
              <p className="font-body text-sm max-w-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>Click the bookmark icon on any answer to save it here.</p>
            </div>
          ) : bookmarks.map((b, i) => (
            <div key={i} className="fade-up" style={{ padding: '12px 14px', borderRadius: '12px', background: 'rgba(185,134,46,0.06)', border: '1px solid rgba(185,134,46,0.15)' }}>
              <p className="font-body text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.80)' }}>{b.text}</p>
              {b.savedAt && <p className="font-mono mt-1" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.20)' }}>{new Date(b.savedAt).toLocaleDateString()}</p>}
            </div>
          ))}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

function EmptyWithChips({ sessionFilename, directSend }) {
  const keywords = (() => { try { return JSON.parse(localStorage.getItem(`explainx_keywords_${sessionFilename}`) || '[]') } catch { return [] } })()
  const chips = keywords.slice(0, 3).map(kw => `What is ${kw}?`)
  return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-4 fade-in">
      <p className="font-display text-xl font-semibold" style={{ color: 'rgba(255,255,255,0.75)' }}>Chapter loaded.</p>
      {chips.length > 0 ? (
        <>
          <p className="font-body text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>Try one of these:</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', maxWidth: '340px' }}>
            {chips.map((chip, i) => (
              <button key={i} onClick={() => directSend(chip)} className="font-body text-sm text-left"
                style={{ padding: '10px 14px', borderRadius: '12px', cursor: 'pointer', background: 'rgba(30,111,85,0.08)', border: '1px solid rgba(30,111,85,0.20)', color: 'rgba(255,255,255,0.70)', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(30,111,85,0.15)'; e.currentTarget.style.borderColor = 'rgba(30,111,85,0.40)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(30,111,85,0.08)'; e.currentTarget.style.borderColor = 'rgba(30,111,85,0.20)' }}
              >{chip}</button>
            ))}
          </div>
        </>
      ) : <p className="font-body text-sm max-w-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>Ask anything about what you just uploaded.</p>}
    </div>
  )
}

function ExpiryBanner({ onReset }) {
  return (
    <div className="fade-in" style={{ flexShrink: 0, padding: '10px 16px', background: 'rgba(178,75,65,0.12)', borderTop: '1px solid rgba(178,75,65,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
      <p className="text-sm font-body" style={{ color: 'rgba(220,100,90,0.9)' }}>Session expired — please upload the PDF again.</p>
      <button className="text-xs font-body font-medium px-3 py-1.5 rounded-lg" style={{ background: 'rgba(178,75,65,0.20)', border: '1px solid rgba(178,75,65,0.40)', color: 'rgba(220,100,90,0.9)', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={onReset}>Upload again</button>
    </div>
  )
}

function Spinner() {
  return <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full" style={{ display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
}

function ErrorBox({ msg }) {
  return <div className="p-3 rounded-xl fade-in" style={{ background: 'rgba(178,75,65,0.12)', border: '1px solid rgba(178,75,65,0.25)' }}><p className="text-sm font-body" style={{ color: 'rgba(220,100,90,0.9)' }}>{msg}</p></div>
}
