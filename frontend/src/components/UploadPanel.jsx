import { useRef, useState, useEffect } from 'react'
import { uploadChapter } from '../api.js'
import ChapterOutline from './ChapterOutline.jsx'

export default function UploadPanel({ onChapterLoaded }) {
  const [state, setState] = useState('empty')
  const [dragOver, setDragOver] = useState(false)
  const [chapterInfo, setChapterInfo] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const inputRef = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => {
    if (state === 'uploading') {
      setElapsed(0)
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [state])

  const uploadMsg = elapsed < 5 ? 'Reading PDF...'
    : elapsed < 15 ? 'Building understanding of the text...'
    : elapsed < 40 ? `Processing (${elapsed}s) — large PDFs take up to a minute...`
    : `Still working (${elapsed}s) — almost done...`

  const handleFile = async (file) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setErrorMsg('Only PDF files are supported.')
      setState('error')
      return
    }
    setState('uploading')
    setErrorMsg('')
    try {
      const res = await uploadChapter(file)
      setChapterInfo(res.data)
      setState('loaded')
      onChapterLoaded(res.data.session_id)
    } catch (err) {
      setErrorMsg(err?.response?.data?.error || 'Upload failed. Please try again.')
      setState('error')
    }
  }

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false)
    handleFile(e.dataTransfer.files?.[0])
  }

  const reset = () => {
    setState('empty'); setChapterInfo(null); setErrorMsg(''); onChapterLoaded(null)
  }

  return (
    <div className="glass p-4">
      {state !== 'loaded' && (
        <div
          className={`drop-zone p-6 text-center transition-all ${dragOver ? 'drag-over' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        >
          <input ref={inputRef} type="file" accept=".pdf" className="hidden" onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = '' }} />

          {state === 'uploading' ? (
            <div className="flex flex-col items-center gap-4 py-2">
              {/* Spinner */}
              <div className="relative w-12 h-12">
                <div className="absolute inset-0 rounded-full border-2 border-transparent"
                  style={{ borderTopColor: 'rgba(30,111,85,0.9)', animation: 'spin 0.8s linear infinite' }} />
                <div className="absolute inset-2 rounded-full border-2 border-transparent"
                  style={{ borderTopColor: 'rgba(185,134,46,0.7)', animation: 'spin 1.2s linear infinite reverse' }} />
              </div>
              <div>
                <p className="text-sm font-body font-medium" style={{ color: 'rgba(30,111,85,0.9)' }}>{uploadMsg}</p>
                <p className="text-xs mt-1 font-body" style={{ color: 'rgba(255,255,255,0.25)' }}>Do not close this tab</p>
              </div>
              {/* Animated progress bar */}
              <div className="w-full rounded-full overflow-hidden" style={{ height: '3px', background: 'rgba(255,255,255,0.08)' }}>
                <div className="progress-bar-fill" style={{ width: `${Math.min(95, elapsed * 2)}%` }} />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(30,111,85,0.12)', border: '1px solid rgba(30,111,85,0.2)' }}>
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <path d="M11 15V4M7 8l4-4 4 4" stroke="rgba(30,111,85,0.8)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M3 17h16" stroke="rgba(30,111,85,0.5)" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <p className="text-sm font-body font-medium" style={{ color: 'rgba(255,255,255,0.70)' }}>
                Drop a chapter PDF here
              </p>
              <p className="text-xs font-body" style={{ color: 'rgba(255,255,255,0.30)' }}>or click to browse · PDF only · Max 20MB</p>
            </div>
          )}
        </div>
      )}

      {state === 'error' && (
        <div className="mt-3 p-3 rounded-xl fade-in" style={{ background: 'rgba(178,75,65,0.12)', border: '1px solid rgba(178,75,65,0.25)' }}>
          <p className="text-sm font-body" style={{ color: 'rgba(220,100,90,0.9)' }}>{errorMsg}</p>
          <button className="mt-2 text-xs font-body underline" style={{ color: 'rgba(220,100,90,0.7)' }} onClick={reset}>Try again</button>
        </div>
      )}

      {state === 'loaded' && chapterInfo && (
        <div className="fade-up">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0">
              <p className="text-sm font-body font-semibold truncate" style={{ color: 'rgba(255,255,255,0.90)' }} title={chapterInfo.filename}>
                {chapterInfo.filename}
              </p>
              <p className="text-xs font-mono mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                {chapterInfo.page_count} pages · {chapterInfo.chunk_count} chunks
              </p>
            </div>
            <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(30,111,85,0.6)', border: '1px solid rgba(30,111,85,0.5)' }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l2.5 2.5L10 3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          <ChapterOutline keywords={chapterInfo.top_keywords} />
          <button className="mt-4 text-xs font-body underline" style={{ color: 'rgba(255,255,255,0.25)' }} onClick={reset}>
            Upload a different chapter
          </button>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
