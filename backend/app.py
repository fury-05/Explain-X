import json
import logging
import os
import secrets
import signal
import threading
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from functools import wraps
from threading import Timer

import jwt
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

from engine import ChapterEngine, _llm

app = Flask(__name__)

# ── CORS ───────────────────────────────────────────────────────────────────────
_ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",") if o.strip()]
CORS(app, origins=_ALLOWED_ORIGINS)

# ── JSON structured logging ────────────────────────────────────────────────────
class _JsonFormatter(logging.Formatter):
    def format(self, record):
        log = {"ts": self.formatTime(record), "level": record.levelname, "msg": record.getMessage()}
        if record.exc_info:
            log["exc"] = self.formatException(record.exc_info)
        return json.dumps(log)

_handler = logging.StreamHandler()
_handler.setFormatter(_JsonFormatter())
app.logger.handlers = [_handler]
app.logger.setLevel(logging.INFO)
app.logger.propagate = False

# ── Config ─────────────────────────────────────────────────────────────────────
MAX_UPLOAD_MB       = int(os.environ.get("MAX_UPLOAD_MB", 20))
SESSION_TTL_MINUTES = int(os.environ.get("SESSION_TTL_MINUTES", 120))
APP_PASSWORD        = os.environ.get("APP_PASSWORD", "explainx2024")
TEACHER_KEY         = os.environ.get("TEACHER_KEY", "teacher2024")
JWT_SECRET          = os.environ.get("JWT_SECRET", secrets.token_hex(32))
JWT_TTL_HOURS       = int(os.environ.get("JWT_TTL_HOURS", 8))
APP_SCHOOL          = os.environ.get("APP_SCHOOL", "Good Samaritan School")
APP_STUDENTS        = [s.strip() for s in os.environ.get("APP_STUDENTS", "Sahil,Yahya,Abdan,Sarim").split(",") if s.strip()]

# ── Rate limiter ───────────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address, app=app, default_limits=[])

# ── Sessions ───────────────────────────────────────────────────────────────────
SESSIONS: dict = {}
_SESSIONS_LOCK = threading.Lock()

# ── LLM queue depth counter ────────────────────────────────────────────────────
_llm_queue_depth = 0
_llm_queue_lock  = threading.Lock()

# ── Usage stats (in-memory, resets on restart) ─────────────────────────────────
_stats = defaultdict(lambda: {"asks": 0, "uploads": 0, "no_match": 0, "elapsed_total_ms": 0})
_stats_lock = threading.Lock()

def _record_stat(event: str, elapsed_ms: int = 0, mode: str = ""):
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    with _stats_lock:
        _stats[day]["asks" if event == "ask" else "uploads"] += 1
        if mode == "no_match":
            _stats[day]["no_match"] += 1
        _stats[day]["elapsed_total_ms"] += elapsed_ms

# ── Graceful shutdown ──────────────────────────────────────────────────────────
_shutting_down = False

def _handle_sigterm(signum, frame):
    global _shutting_down
    _shutting_down = True
    app.logger.info("SIGTERM received — draining requests before exit.")

signal.signal(signal.SIGTERM, _handle_sigterm)


def _evict_expired():
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=SESSION_TTL_MINUTES)
    with _SESSIONS_LOCK:
        expired = [sid for sid, s in SESSIONS.items() if s["created_at"] < cutoff]
        for sid in expired:
            del SESSIONS[sid]


def _start_eviction_loop(interval_seconds: int = 600):
    def _loop():
        _evict_expired()
        t = Timer(interval_seconds, _loop)
        t.daemon = True
        t.start()
    t = Timer(interval_seconds, _loop)
    t.daemon = True
    t.start()


def _get_session(session_id: str):
    with _SESSIONS_LOCK:
        return SESSIONS.get(session_id)


def _create_session(engine: ChapterEngine, filename: str) -> str:
    with _SESSIONS_LOCK:
        while True:
            sid = secrets.token_hex(16)
            if sid not in SESSIONS:
                break
        SESSIONS[sid] = {
            "engine": engine,
            "filename": filename,
            "created_at": datetime.now(timezone.utc),
        }
    return sid


# ── JWT helpers ────────────────────────────────────────────────────────────────
def _issue_token(student: str = "") -> str:
    payload = {
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_TTL_HOURS),
        "student": student,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def _require_token(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if _shutting_down:
            return jsonify({"error": "Server is restarting. Please try again shortly."}), 503
        auth_header = request.headers.get("Authorization", "")
        token = auth_header.removeprefix("Bearer ").strip()
        if not token:
            return jsonify({"error": "Authentication required."}), 401
        try:
            jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Session expired. Please re-enter the password."}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid token."}), 401
        return f(*args, **kwargs)
    return decorated


# ── Startup ────────────────────────────────────────────────────────────────────
try:
    _llm()
    app.logger.info("LLM warmed up successfully.")
except Exception as e:
    app.logger.warning(f"LLM warm-up failed (will retry on first request): {e}")

_start_eviction_loop()


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    from engine import _LLM, _LLM_LOCK
    if _LLM is None:
        return jsonify({"status": "loading", "llm_queue_depth": 0}), 503
    locked = not _LLM_LOCK.acquire(blocking=False)
    if not locked:
        _LLM_LOCK.release()
    return jsonify({"status": "ok", "llm_queue_depth": _llm_queue_depth})


@app.get("/api/config")
def config():
    return jsonify({"school": APP_SCHOOL, "students": APP_STUDENTS})


@app.post("/api/auth")
@limiter.limit("5 per minute")
def auth():
    body = request.get_json(silent=True) or {}
    if body.get("password") == APP_PASSWORD:
        student = (body.get("student") or "").strip()
        return jsonify({"success": True, "token": _issue_token(student)})
    return jsonify({"success": False, "error": "Incorrect password."}), 401


@app.get("/api/teacher")
def teacher_stats():
    key = request.args.get("key", "")
    if key != TEACHER_KEY:
        return jsonify({"error": "Unauthorized."}), 401
    with _stats_lock:
        data = {day: dict(v) for day, v in _stats.items()}
    with _SESSIONS_LOCK:
        data["active_sessions"] = len(SESSIONS)
    return jsonify(data)


@app.post("/api/upload")
@_require_token
def upload():
    try:
        _evict_expired()

        if "file" not in request.files:
            return jsonify({"error": "Please upload a valid PDF file under 20MB."}), 400

        f = request.files["file"]
        if not f.filename or not f.filename.lower().endswith(".pdf"):
            return jsonify({"error": "Please upload a valid PDF file under 20MB."}), 400

        pdf_bytes = f.read()
        if len(pdf_bytes) == 0:
            return jsonify({"error": "Please upload a valid PDF file under 20MB."}), 400
        if len(pdf_bytes) > MAX_UPLOAD_MB * 1024 * 1024:
            return jsonify({"error": "Please upload a valid PDF file under 20MB."}), 400

        try:
            engine = ChapterEngine(pdf_bytes, f.filename)
        except ValueError as ve:
            return jsonify({"error": str(ve)}), 400

        session_id = _create_session(engine, f.filename)
        app.logger.info(json.dumps({
            "event": "upload", "session": session_id[:8],
            "filename": f.filename, "pages": engine.page_count, "chunks": engine.chunk_count,
        }))
        _record_stat("upload")
        return jsonify({
            "session_id": session_id,
            "filename": f.filename,
            "page_count": engine.page_count,
            "chunk_count": engine.chunk_count,
            "top_keywords": engine.top_keywords(5),
        })

    except Exception:
        app.logger.exception("Unexpected error in /api/upload")
        return jsonify({"error": "An unexpected error occurred. Please try again."}), 500


@app.post("/api/ask")
@_require_token
@limiter.limit("30 per minute")
def ask():
    global _llm_queue_depth
    try:
        body = request.get_json(silent=True) or {}
        session_id = body.get("session_id", "")
        question   = (body.get("question") or "").strip()
        history    = body.get("history") or []
        length     = body.get("length", "normal")
        if length not in ("short", "normal", "detailed"):
            length = "normal"

        if not question:
            return jsonify({"error": "Please provide a question."}), 400

        session = _get_session(session_id)
        if session is None:
            return jsonify({"error": "Session not found. Please upload the PDF again."}), 404

        with _llm_queue_lock:
            _llm_queue_depth += 1
        t0 = time.monotonic()
        try:
            result = session["engine"].ask(question, history, length)
        finally:
            with _llm_queue_lock:
                _llm_queue_depth -= 1

        elapsed_ms = int((time.monotonic() - t0) * 1000)
        app.logger.info(json.dumps({
            "event": "ask", "session": session_id[:8],
            "elapsed_ms": elapsed_ms, "mode": result.get("mode"), "length": length,
        }))
        _record_stat("ask", elapsed_ms, result.get("mode", ""))
        return jsonify(result)

    except Exception:
        app.logger.exception("Unexpected error in /api/ask")
        return jsonify({"error": "An unexpected error occurred. Please try again."}), 500


@app.post("/api/eli12")
@_require_token
def eli12():
    try:
        body = request.get_json(silent=True) or {}
        session_id = body.get("session_id", "")
        question   = (body.get("question") or "").strip()
        if not question:
            return jsonify({"error": "Please provide a question."}), 400
        session = _get_session(session_id)
        if session is None:
            return jsonify({"error": "Session not found. Please upload the PDF again."}), 404
        result = session["engine"].explain_simply(question)
        return jsonify(result)
    except Exception:
        app.logger.exception("Unexpected error in /api/eli12")
        return jsonify({"error": "An unexpected error occurred. Please try again."}), 500


@app.post("/api/followups")
@_require_token
def followups():
    try:
        body = request.get_json(silent=True) or {}
        session_id = body.get("session_id", "")
        answer     = (body.get("answer") or "").strip()
        if not answer:
            return jsonify({"questions": []})
        session = _get_session(session_id)
        if session is None:
            return jsonify({"error": "Session not found."}), 404
        questions = session["engine"].get_followups(answer)
        return jsonify({"questions": questions})
    except Exception:
        app.logger.exception("Unexpected error in /api/followups")
        return jsonify({"questions": []})


@app.post("/api/flashcards")
@_require_token
def flashcards():
    try:
        body = request.get_json(silent=True) or {}
        session_id = body.get("session_id", "")
        session = _get_session(session_id)
        if session is None:
            return jsonify({"error": "Session not found. Please upload the PDF again."}), 404
        t0 = time.monotonic()
        cards = session["engine"].generate_flashcards()
        elapsed_ms = int((time.monotonic() - t0) * 1000)
        app.logger.info(json.dumps({"event": "flashcards", "session": session_id[:8], "elapsed_ms": elapsed_ms, "count": len(cards)}))
        return jsonify({"cards": cards})
    except Exception:
        app.logger.exception("Unexpected error in /api/flashcards")
        return jsonify({"error": "An unexpected error occurred. Please try again."}), 500


@app.post("/api/summary")
@_require_token
def summary():
    try:
        body = request.get_json(silent=True) or {}
        session_id = body.get("session_id", "")
        topic = (body.get("topic") or "").strip()
        if not topic:
            return jsonify({"error": "Please provide a topic."}), 400
        session = _get_session(session_id)
        if session is None:
            return jsonify({"error": "Session not found. Please upload the PDF again."}), 404
        t0 = time.monotonic()
        result = session["engine"].summarize(topic)
        elapsed_ms = int((time.monotonic() - t0) * 1000)
        app.logger.info(json.dumps({"event": "summary", "session": session_id[:8], "elapsed_ms": elapsed_ms}))
        return jsonify(result)
    except Exception:
        app.logger.exception("Unexpected error in /api/summary")
        return jsonify({"error": "An unexpected error occurred. Please try again."}), 500


@app.post("/api/quiz")
@_require_token
def quiz():
    try:
        body = request.get_json(silent=True) or {}
        session_id = body.get("session_id", "")
        session = _get_session(session_id)
        if session is None:
            return jsonify({"error": "Session not found. Please upload the PDF again."}), 404
        t0 = time.monotonic()
        questions = session["engine"].generate_quiz()
        elapsed_ms = int((time.monotonic() - t0) * 1000)
        app.logger.info(json.dumps({"event": "quiz", "session": session_id[:8], "elapsed_ms": elapsed_ms, "count": len(questions)}))
        return jsonify({"questions": questions})
    except Exception:
        app.logger.exception("Unexpected error in /api/quiz")
        return jsonify({"error": "An unexpected error occurred. Please try again."}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
