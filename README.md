# ExplainX

**Upload any chapter PDF. Ask questions, get summaries, take quizzes, flip flashcards — all answered from your own document, by an AI that runs entirely on your machine.**

ExplainX is an offline-first, production-grade study assistant built as a Class 12 CBSE Computer Science / AI project for **UN SDG 4 — Quality Education**: making one-on-one chapter tutoring accessible to every student without paid AI subscriptions or internet dependency.

> Built by **Sahil, Yahya, Abdan, and Sarim** — Good Samaritan School

---

## What makes it different

| Other AI tools | ExplainX |
|---|---|
| Send your documents to OpenAI / Google servers | Everything runs locally — your PDF never leaves your machine |
| Require API keys and monthly subscriptions | Zero cost after setup, no accounts needed |
| Hallucinate answers from their training data | Answers come only from your uploaded PDF — if it's not there, it says so |
| Break when the internet is down | Fully offline after the first build |
| Generic chatbots | Reads your specific document and answers from it |
| No exam prep tools | Quiz mode, flashcards, follow-up chips, ELI12, bookmarks all built in |

---

## Features

### Study Tools (5 tabs per session)

| Tab | What it does |
|---|---|
| **Ask** | Ask any question about the uploaded chapter — answered directly from the PDF text |
| **Summarize** | Type any topic and get a plain-English explanation from the chapter |
| **Quiz** | Generates 5 MCQs from the chapter; shows score and explains wrong answers |
| **Flashcards** | 8 term/definition cards with a 3D flip animation |
| **Saved** | All bookmarked answers, stored permanently in the browser |

### Answer Quality
- **Source page badges** — every answer shows which page(s) it came from (`p.3`, `p.7`)
- **Confidence indicator** — green **Found** badge for confident answers, yellow **Partial match** for uncertain ones
- **"See source" toggle** — expand the exact paragraph from the PDF the answer was drawn from
- **"Explain simply"** — re-ask any answer in plain language aimed at a younger reader
- **Follow-up chips** — 2 contextual follow-up questions suggested after every answer
- **Answer length control** — Short / Normal / Detailed toggle adjusts both the prompt and token budget
- **Answer cache** — repeat questions return instantly (no LLM call)
- **Conversation history** — the last 3 Q&A pairs are passed as context, so follow-up questions like "explain that further" work
- **Markdown rendering** — bullet points, bold, and code in answers display correctly

### Student Experience
- **Student selector** — pick your name on the login screen; it's embedded in the session token
- **Study streak** — daily login streak shown as 🔥 Xd in the header; turns gold at 7+ days
- **Chat history** — conversation saved in localStorage per filename; re-upload the same file and your chat is restored
- **Export chat** — download the full conversation as a `.txt` notes file
- **Copy button** — hover any answer to copy it to clipboard
- **Bookmarks** — bookmark any answer with one click; view all saved answers in the Saved tab
- **Example question chips** — empty chat shows 3 clickable starter questions from the chapter's top keywords
- **Ctrl+K shortcut** — focuses the question input from anywhere in the app
- **Textarea auto-resize** — the input box grows as you type a longer question
- **Mobile layout** — responsive design stacks the shelf above chat on screens under 768px

### Security & Auth
- **JWT authentication** — password gate issues a signed token (8h TTL); all API calls require it
- **Session persistence** — token stored in `sessionStorage`; page refresh doesn't log you out
- **Rate limiting** — `/api/auth` capped at 5 attempts/IP/min; `/api/ask` capped at 30/IP/min
- **Password in `.env`** — never committed to git
- **CORS control** — configurable allowed origins via `ALLOWED_ORIGINS` env var
- **Session expiry UX** — when a 120-min session expires mid-chat, a banner appears with an "Upload again" button

---

## Quick start

**Requirements:** Docker Desktop installed and running. Nothing else.

```bash
git clone <repo-url> explainx
cd explainx
cp .env.example .env       # edit .env to set your password
docker compose up --build
```

Open **http://localhost** in a browser.

Default password: `explainx2024`  
Default teacher key: `teacher2024`

> **First build:** takes 5–10 minutes — downloads the language model (~380 MB). Every subsequent start is instant because the model is stored in a Docker volume.

---

## Configuration

All configuration lives in `.env` (never committed to git):

```env
APP_PASSWORD=explainx2024          # shared student password
TEACHER_KEY=teacher2024            # for the teacher dashboard
JWT_SECRET=change-this-to-random   # token signing secret — change in production
ALLOWED_ORIGINS=*                  # set to your domain in production
APP_SCHOOL=Good Samaritan School   # displayed in the UI
APP_STUDENTS=Sahil,Yahya,Abdan,Sarim  # comma-separated student names
```

To update config without rebuilding:
```bash
nano .env
docker compose up -d    # restarts containers with new env vars
```

---

## Choosing a language model

Larger model = smarter answers, slower on CPU. Pick based on your hardware:

```bash
# 0.5B — default, ~380 MB, runs on any laptop with 4 GB RAM
docker compose build

# 1.5B — better quality, ~1.1 GB, needs 6 GB RAM
docker compose build --build-arg MODEL_SIZE=1.5b backend

# 3B — high quality, ~2 GB, needs 8 GB RAM
docker compose build --build-arg MODEL_SIZE=3b backend

# 7B — best quality, ~4.5 GB, needs 16 GB RAM or a GPU
docker compose build --build-arg MODEL_SIZE=7b backend
```

Model files are stored in a persistent Docker volume (`model-cache`) — switching sizes triggers a one-time re-download, not a full rebuild.

---

## GPU deployment

For production or demo use, ExplainX runs on a GPU VM for 1–3 second answers instead of 10–30 seconds on CPU.

```bash
# One-time VM setup (Ubuntu, NVIDIA GPU)
bash setup-gpu-vm.sh

# Build and start with GPU support
docker compose -f docker-compose.gpu.yml build --build-arg MODEL_SIZE=7b
docker compose -f docker-compose.gpu.yml up -d

# Verify GPU is being used
docker compose -f docker-compose.gpu.yml logs backend | grep -i cuda
```

---

## Teacher dashboard

A read-only stats endpoint — no UI, just a JSON response:

```
GET /api/teacher?key=teacher2024
```

```json
{
  "2026-07-13": {
    "asks": 47,
    "uploads": 8,
    "no_match": 3,
    "elapsed_total_ms": 287000
  },
  "active_sessions": 2
}
```

Stats reset on container restart (in-memory only). Check before restarting.

---

## How it works

### Stage 1 — PDF Ingestion (at upload time)

1. `pdfplumber` extracts text from every page
2. Text is split into **4-sentence chunks** using `nltk`
3. Each chunk is embedded into a **384-dimensional vector** using `BAAI/bge-small-en-v1.5` via `fastembed` (ONNX, no GPU needed)
4. A **BM25 index** is built over all chunks for exact-term matching
5. Top 5 keywords are extracted using BM25 IDF scores

### Stage 2 — Query Processing (at question time)

1. **Spell correction** (`pyspellchecker`) fixes typos before anything else
2. **Cache check** — if the same question + length was asked before this session, return the cached result instantly
3. **Context selection:**
   - Small PDFs (≤1,400 tokens for 0.5B model): the **entire document** is passed to the LLM — accurate for counting and listing questions
   - Large PDFs: **hybrid retrieval** (semantic cosine similarity + 0.15× normalised BM25) selects the 18 most relevant chunks
4. **Conversation history** — the last 3 Q&A pairs are prepended so follow-up questions have context

### Stage 3 — LLM Answer Generation

The selected text + question are sent to Qwen 2.5 (running via `llama-cpp-python`). The prompt strictly instructs:
- Answer **only** from the provided text
- Respond with `NOT_FOUND` if the answer is not present
- No hallucination, no outside knowledge

The LLM inference call is protected by a `threading.Lock` — requests queue and process one at a time (llama-cpp-python is not thread-safe).

### Answer Post-processing

- If the answer is fewer than 8 words or contains hedge phrases ("might be", "seems to", "not explicitly"), it's classified as `partial` and shown with a yellow badge
- Real retrieval scores (BM25 + semantic combined) are returned in `matches[].relevance`, not a hardcoded 1.0
- Follow-up question suggestions are generated asynchronously after the answer is returned

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                          Docker Compose                               │
│                                                                       │
│  ┌──────────────────────────┐     ┌──────────────────────────────┐   │
│  │  Frontend (Nginx :80)    │     │  Backend (Flask :5000)       │   │
│  │                          │     │                              │   │
│  │  React 18 + Vite         │────▶│  pdfplumber  (PDF parse)     │   │
│  │  Tailwind CSS            │     │  fastembed   (embeddings)    │   │
│  │  react-markdown          │◀────│  rank-bm25   (keyword index) │   │
│  │                          │     │  llama-cpp   (local LLM)     │   │
│  │  5 study tabs            │     │  PyJWT       (auth)          │   │
│  │  Bookmarks, Streak       │     │  Flask-Limiter (rate limit)  │   │
│  │  Nginx proxies /api/*    │     │  pyspellchecker              │   │
│  └──────────────────────────┘     └──────────────────────────────┘   │
│                                            │                          │
│                                    model-cache volume                 │
│                                   (qwen.gguf persisted)               │
└──────────────────────────────────────────────────────────────────────┘
         ▲
         │ http://localhost (Cloudflare HTTPS in production)
      Browser
```

**No persistent database.** Sessions live in Python process memory with a 120-minute TTL. Chat history, bookmarks, and streaks live in browser `localStorage`. An answer cache (SHA-256 keyed per session) avoids redundant LLM calls.

---

## API reference

All endpoints are at `http://localhost/api/` (proxied by Nginx).

### `GET /api/health`
```json
{ "status": "ok", "llm_queue_depth": 0 }
```
Returns `503` with `"status": "loading"` while the LLM is still warming up at startup.

### `GET /api/config`
Returns school name and student list (read from env vars — no auth required):
```json
{ "school": "Good Samaritan School", "students": ["Sahil", "Yahya", "Abdan", "Sarim"] }
```

### `POST /api/auth`
```json
// Request
{ "password": "explainx2024", "student": "Sahil" }

// Response 200
{ "success": true, "token": "eyJhbGciOiJIUzI1NiJ9..." }

// Response 401
{ "success": false, "error": "Incorrect password." }
```
Rate limited: 5 attempts per IP per minute.

### `POST /api/upload`
- Body: `multipart/form-data`, field `file`, JWT in `Authorization: Bearer <token>` header
- Max size: 20 MB (configurable via `MAX_UPLOAD_MB`)

```json
// Response 200
{
  "session_id": "a1b2c3d4e5f6...",
  "filename": "chapter7.pdf",
  "page_count": 12,
  "chunk_count": 84,
  "top_keywords": ["photosynthesis", "chlorophyll", "glucose", "calvin", "thylakoid"]
}
```

### `POST /api/ask`
Rate limited: 30 requests per IP per minute.
```json
// Request
{
  "session_id": "a1b2c3d4...",
  "question": "What is the role of chlorophyll?",
  "history": [
    { "role": "user",      "content": "What is photosynthesis?" },
    { "role": "assistant", "content": "Photosynthesis is..." }
  ],
  "length": "normal"
}
```
`length` options: `"short"` (1–2 sentences), `"normal"` (default), `"detailed"` (full explanation)

```json
// Response 200
{
  "answer": "Chlorophyll is the green pigment that absorbs light energy...",
  "mode": "answer",
  "matches": [
    { "page": 3, "relevance": 0.847, "snippet": "Plants use chlorophyll to..." }
  ]
}
```
`mode` values: `"answer"` | `"partial"` | `"no_match"`

### `POST /api/summary`
```json
// Request
{ "session_id": "a1b2c3d4...", "topic": "Calvin cycle" }

// Response 200
{
  "summary": "The Calvin cycle takes place in the stroma...",
  "sources": [{ "page": 4 }, { "page": 6 }]
}
```

### `POST /api/quiz`
```json
// Response 200
{
  "questions": [
    {
      "question": "What pigment is responsible for absorbing sunlight?",
      "options": { "A": "Carotene", "B": "Chlorophyll", "C": "Xanthophyll", "D": "Anthocyanin" },
      "answer": "B",
      "explanation": "Chlorophyll absorbs red and blue light wavelengths for photosynthesis."
    }
  ]
}
```

### `POST /api/flashcards`
```json
// Response 200
{
  "cards": [
    { "term": "Chlorophyll", "definition": "The green pigment in leaves that captures light energy for photosynthesis." }
  ]
}
```

### `POST /api/eli12`
Re-states an answer in simpler language:
```json
// Request
{ "session_id": "a1b2c3d4...", "question": "What is osmosis?" }

// Response 200
{ "answer": "Osmosis is like water moving through a sieve...", "mode": "answer" }
```

### `POST /api/followups`
Suggests related questions after an answer:
```json
// Request
{ "session_id": "a1b2c3d4...", "answer": "Chlorophyll absorbs light energy..." }

// Response 200
{ "questions": ["What happens to light energy after it is absorbed?", "Where is chlorophyll located in a cell?"] }
```

### `GET /api/teacher?key=<TEACHER_KEY>`
Returns daily usage stats. See [Teacher dashboard](#teacher-dashboard) above.

---

## Project structure

```
explainx/
├── .env                        ← Secrets (git-ignored)
├── .env.example                ← Template — copy to .env
├── docker-compose.yml          ← CPU deployment
├── docker-compose.gpu.yml      ← GPU deployment (CUDA 12.1)
├── setup-gpu-vm.sh             ← One-time GPU VM setup script
├── features.md                 ← Full feature checklist (46 done, 4 planned)
│
├── backend/
│   ├── Dockerfile              ← CPU build (python:3.11-slim)
│   ├── Dockerfile.gpu          ← GPU build (nvidia/cuda:12.1.1)
│   ├── requirements.txt        ← Flask, llama-cpp-python, PyJWT, Flask-Limiter…
│   ├── model_setup.py          ← Downloads GGUF model at Docker build time
│   ├── nltk_setup.py           ← Downloads NLTK punkt tokeniser
│   ├── app.py                  ← All Flask routes, JWT auth, rate limiting, stats
│   ├── engine.py               ← ChapterEngine: PDF→chunks→embed→BM25→LLM→cache
│   └── tests/
│       └── test_engine.py      ← Unit tests for chunking and retrieval
│
├── frontend/
│   ├── Dockerfile              ← Multi-stage: node build → nginx serve
│   ├── nginx.conf              ← SPA routing + /api proxy to backend
│   ├── package.json            ← React 18, Vite, Tailwind, react-markdown
│   └── src/
│       ├── App.jsx             ← Root: streak tracking, config fetch, layout
│       ├── api.js              ← All axios calls + JWT token helpers
│       ├── constants.js        ← Fallback SCHOOL + STUDENTS values
│       ├── index.css           ← Design tokens, glassmorphism, animations
│       └── components/
│           ├── PasswordGate.jsx    ← Student selector + password form
│           ├── Header.jsx          ← Fixed top bar with streak badge
│           ├── UploadPanel.jsx     ← Drag-drop upload with progress timer
│           ├── ChatPanel.jsx       ← All 5 study tabs + export + Ctrl+K
│           ├── MessageBubble.jsx   ← Answer bubbles with badges, ELI12, bookmarks
│           ├── ChapterOutline.jsx  ← Keyword pills after upload
│           ├── EmptyState.jsx      ← Shown before any upload
│           └── RelevanceTag.jsx    ← Relevance score display
│
└── project-reports/            ← Full professional documentation (10 docs + PDFs)
    ├── 01-srs.md
    ├── 02-system-design.md
    ├── 03-feasibility-study.md
    ├── 04-project-plan.md
    ├── 05-test-plan.md
    ├── 06-technical-specification.md
    ├── 07-deployment-guide.md
    ├── 08-user-manual.md
    ├── 09-maintenance-guide.md
    ├── 10-project-report.md
    ├── convert-to-pdf.js       ← Puppeteer + mermaid PDF generator
    └── pdf-output/             ← Generated A4 PDFs (10 documents)
```

---

## Tech stack

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| Frontend framework | React | 18.3.1 | Component model, state management |
| Build tool | Vite | 5.3.1 | Fast dev server, optimised prod build |
| Styling | Tailwind CSS + custom CSS | 3.4.4 | Glassmorphism design, animated backgrounds |
| HTTP client | Axios | 1.7.2 | JWT headers, timeout, error handling |
| Markdown renderer | react-markdown | 9.0.1 | Renders LLM markdown output in bubbles |
| Backend framework | Flask | 3.0.3 | REST API |
| WSGI server | Gunicorn | 22.0.0 | Production server, single worker |
| Auth | PyJWT | 2.8.0 | HS256 token signing and validation |
| Rate limiting | Flask-Limiter | 3.7.0 | Per-IP request throttling |
| CORS | Flask-CORS | 4.0.1 | Configurable origin control |
| PDF parsing | pdfplumber | 0.11.4 | Text extraction from typed PDFs |
| Sentence tokenisation | NLTK | 3.9.1 | 4-sentence chunk splitting |
| Semantic embeddings | fastembed (BAAI/bge-small-en-v1.5) | 0.3.6 | 384-dim vectors, ONNX, CPU-only |
| Keyword retrieval | rank-bm25 | 0.2.2 | Okapi BM25 complementing semantic search |
| Spell correction | pyspellchecker | 0.8.1 | Fixes typos before query processing |
| Local LLM | llama-cpp-python (Qwen 2.5 GGUF) | 0.2.90 | CPU/GPU inference, no torch dependency |
| Containerisation | Docker + Compose | 24+ / v2 | One-command deploy |
| Reverse proxy | Nginx | 1.27-alpine | Serves SPA, proxies /api |
| GPU runtime | CUDA 12.1 + llama-cpp CUDA wheel | — | Full GPU offload on NVIDIA T4 |

---

## Developer guide

### Running without Docker

```bash
# Backend
cd backend
pip install -r requirements.txt
python model_setup.py        # downloads model files once
python app.py                # starts on http://localhost:5000

# Frontend (in another terminal)
cd frontend
npm install
npm run dev                  # starts on http://localhost:5173
```

Vite's dev server proxies `/api` to `localhost:5000` automatically via `vite.config.js`.

### Environment variables (full reference)

| Variable | Default | Description |
|---|---|---|
| `APP_PASSWORD` | `explainx2024` | Shared student password |
| `TEACHER_KEY` | `teacher2024` | Teacher dashboard access key |
| `JWT_SECRET` | Random hex | Token signing secret — set a fixed value in production |
| `JWT_TTL_HOURS` | `8` | How long a login token stays valid |
| `APP_SCHOOL` | `Good Samaritan School` | School name shown in UI (no code change needed) |
| `APP_STUDENTS` | `Sahil,Yahya,Abdan,Sarim` | Comma-separated student names for selector |
| `MAX_UPLOAD_MB` | `20` | Maximum PDF file size |
| `SESSION_TTL_MINUTES` | `120` | How long an uploaded PDF session lives |
| `ALLOWED_ORIGINS` | `*` | CORS allowed origins — set to your domain in production |
| `MODEL_SIZE` | `0.5b` | Build arg: which Qwen 2.5 GGUF to download |

### Running tests

```bash
cd backend
python -m pytest tests/test_engine.py -v
```

### Adding a new API endpoint

1. Add the route in `backend/app.py` with `@_require_token` decorator
2. Add the processing function in `backend/engine.py` on the `ChapterEngine` class
3. Add the axios call in `frontend/src/api.js` using `authHeaders()`
4. Wire it to a UI component in `ChatPanel.jsx` or a new tab

---

## Known limitations

| Limitation | Details |
|---|---|
| Scanned PDFs not supported | Needs digitally-typed PDF text — scanned images show an error |
| Session lost on restart | Uploading again required after a container restart — intentional, avoids database complexity |
| Serial LLM inference | All requests queue through a single LLM instance — one answer at a time |
| Large document enumeration | For PDFs exceeding the context window, "list every X across all pages" only searches top-18 retrieved chunks |
| English-optimised pipeline | Spell correction and BM25 tokenisation are English-only; the LLM supports multiple languages |
| In-memory sessions | Beyond ~10 concurrent users, a Redis session store would be needed for multi-worker scaling |

---

## Planned features

- [ ] **#47** Dark / light mode toggle
- [ ] **#48** Multi-chapter study set — cross-chapter Q&A across multiple uploaded PDFs
- [ ] **#49** PDF page preview on hover — thumbnail on source badge hover via pdfjs-dist
- [ ] **#50** Answer versioning — "Regenerate" button for a different phrasing

---

## Project documentation

The `project-reports/` folder contains 10 professional documents covering the full software development lifecycle, generated as A4 PDFs:

| # | Document |
|---|---|
| 01 | Software Requirements Specification (SRS) |
| 02 | System Design Document (SDD) |
| 03 | Feasibility Study |
| 04 | Project Plan (Gantt chart, WBS, milestones) |
| 05 | Test Plan (56 test cases) |
| 06 | Technical Specification (algorithms, prompts, schemas) |
| 07 | Deployment Guide |
| 08 | User Manual |
| 09 | Maintenance and Operations Guide |
| 10 | Final Project Report |

To regenerate PDFs after editing any `.md` file:
```bash
cd project-reports
npm install      # first time only
npm run pdf
```

---

## Acknowledgements

Built with open-source tools:
- [Qwen 2.5](https://huggingface.co/Qwen) by Alibaba DAMO Academy — local LLM (0.5B to 7B)
- [BAAI/bge-small-en-v1.5](https://huggingface.co/BAAI/bge-small-en-v1.5) — semantic embedding model
- [llama.cpp](https://github.com/ggerganov/llama.cpp) — CPU/GPU LLM inference engine
- [fastembed](https://github.com/qdrant/fastembed) — fast ONNX embedding inference by Qdrant
- [pdfplumber](https://github.com/jsvine/pdfplumber) — PDF text extraction
- [Flask](https://flask.palletsprojects.com/) — Python web framework
- [React](https://react.dev/) — frontend UI framework
- [Docker](https://www.docker.com/) — containerisation

---

*Built for UN SDG 4: Quality Education — making one-on-one chapter tutoring accessible without paid AI tools.*
