# ExplainX — Production Feature Checklist

Skipped: HTTPS (handled by Cloudflare), CI/CD (not needed during development).

---

## Security
- [x] **#1** API auth token — JWT on `/api/auth`, validated on all protected routes.
- [x] **#2** Password in .env — git-ignored `.env`, `.env.example` added.
- [x] **#3** Rate limit `/api/auth` — 5 attempts/IP/min.
- [x] **#4** Rate limit `/api/ask` — 30 req/IP/min.
- [x] **#5** Restrict CORS — reads `ALLOWED_ORIGINS` from env.

## Backend Correctness
- [x] **#6** LLM mutex — all inference calls hold `_LLM_LOCK`.
- [x] **#7** Embedding model mutex — lazy init protected by `_EMBED_LOCK`.
- [x] **#8** Background session eviction — daemon timer every 10 minutes.
- [x] **#9** Real `/api/health` — 503 while LLM loading.
- [x] **#10** Deduplicate ask/summarize — shared `_build_context()`.
- [x] **#11** Fix double tokenize — `nltk.sent_tokenize` called once.

## Infrastructure
- [x] **#12** Docker healthcheck — frontend waits `service_healthy`.
- [x] **#13** Resource limits — `mem_limit` + `cpus` on both containers.
- [x] **#14** Persist model volume — `model-cache` at `/app/models`.

## Frontend / UX Round 1
- [x] **#15** Persist auth across refresh — JWT in `sessionStorage`.
- [x] **#16** Session expiry UX — red banner + "Upload again" on 404/401.
- [x] **#17** Summary UI — "Summarize" tab calls `/api/summary`.
- [x] **#18** Conversation history — last 3 Q/A pairs in LLM prompt.
- [x] **#19** Markdown rendering — `react-markdown` in bot bubbles.
- [x] **#20** Deduplicate constants — `STUDENTS`/`SCHOOL` in `constants.js`.
- [x] **#21** Mobile layout — `@media (max-width: 768px)` stacks layout.
- [x] **#22** Copy button — clipboard icon on hover, checkmark after copy.

## Observability
- [x] **#23** Structured logging — JSON with `event`, `session`, `elapsed_ms`, `mode`.

## Round 2 Features
- [x] **#24** Source page badges — `p.X` tags under every bot answer.
- [x] **#25** "See source text" toggle — collapsible snippet from PDF.
- [x] **#26** Confidence indicator — green "Found" / yellow "Partial match".
- [x] **#27** Quiz mode — 5 MCQs, submit + score, retry.
- [x] **#28** Chat history in localStorage — restored on same file re-upload.
- [x] **#29** Example question chips — 3 clickable starters from `top_keywords`.
- [x] **#30** Export chat — download as `.txt` file.

---

## Round 3 Features

### Core Learning Quality
- [x] **#31** Answer cache — `sha256(question+history)` → skip LLM on repeat questions.
- [x] **#32** Textarea auto-resize — input grows as student types multi-line questions.
- [x] **#33** Quiz wrong answer explanation — "The answer is B because…" shown after submit.
- [x] **#34** Configurable school/students via env — `APP_SCHOOL` + `APP_STUDENTS` in `.env`.
- [x] **#35** Flashcard generator — "Flashcards" tab, 8 term/definition cards, flip animation.
- [x] **#36** Follow-up question suggestions — 2 related question chips after each answer.
- [x] **#37** Per-student login — student selector on password gate, name stored in JWT.
- [x] **#38** "Explain simply" (ELI12) — button on each answer re-states it in simpler language.

### Answer Quality
- [x] **#39** Retrieval confidence score — real BM25+semantic score in `matches[].relevance`, not hardcoded 1.0.
- [x] **#42** Answer length control — Short / Normal / Detailed toggle above the input.

### Student Engagement
- [x] **#40** Study streak — login streak tracked in `localStorage`, shown in header.
- [x] **#41** Bookmarks — heart icon saves any answer; "Saved" tab shows all bookmarks.

### Infrastructure
- [x] **#43** SIGTERM handler + queue depth — graceful shutdown; `/api/health` exposes `llm_queue_depth`.
- [x] **#44** GPU Dockerfile parity — `PyJWT` + `flask-limiter` added to `Dockerfile.gpu`.
- [x] **#45** Teacher stats endpoint — `/api/teacher?key=<pw>` returns daily usage stats (no UI needed).

### UX Polish
- [x] **#46** `Ctrl+K` shortcut — focuses the question input from anywhere.

### Future (not yet implemented)
- [ ] **#47** Dark/light mode toggle — CSS variable swap + preference in localStorage.
- [ ] **#48** Multi-chapter study set — multiple PDFs in one session.
- [ ] **#49** PDF page preview on hover — `pdfjs-dist` thumbnail on source badge hover.
- [ ] **#50** Answer versioning — "Regenerate" button reruns at `temperature: 0.4`.
