export default function MessageBubble({ message }) {
  const { role, text, mode } = message

  if (role === 'user') {
    return (
      <div className="flex justify-end mb-4 fade-up">
        <div className="bubble-user max-w-[72%] px-4 py-3 text-sm font-body leading-relaxed">
          {text}
        </div>
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
        <div className="bubble-nomatch max-w-[80%] px-4 py-3 text-sm font-body leading-relaxed">
          {text}
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start mb-4 fade-up">
      <div className="bubble-bot max-w-[80%] px-4 py-3 text-sm font-body leading-relaxed whitespace-pre-line">
        {text}
      </div>
    </div>
  )
}
