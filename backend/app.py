import os
import secrets
from datetime import datetime, timedelta

from flask import Flask, request, jsonify
from flask_cors import CORS

from engine import ChapterEngine, _llm

app = Flask(__name__)
CORS(app)

# Warm up the LLM at startup so the first real request isn't slow
try:
    _llm()
    app.logger.info("LLM warmed up successfully.")
except Exception as e:
    app.logger.warning(f"LLM warm-up failed (will retry on first request): {e}")

MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", 20))
SESSION_TTL_MINUTES = int(os.environ.get("SESSION_TTL_MINUTES", 120))
APP_PASSWORD = os.environ.get("APP_PASSWORD", "explainx2024")

SESSIONS: dict = {}


# ------------------------------------------------------------------
# Session helpers
# ------------------------------------------------------------------

def _evict_expired():
    cutoff = datetime.utcnow() - timedelta(minutes=SESSION_TTL_MINUTES)
    expired = [sid for sid, s in SESSIONS.items() if s["created_at"] < cutoff]
    for sid in expired:
        del SESSIONS[sid]


def _get_session(session_id: str):
    return SESSIONS.get(session_id)


# ------------------------------------------------------------------
# Routes
# ------------------------------------------------------------------

@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/api/auth")
def auth():
    body = request.get_json(silent=True) or {}
    if body.get("password") == APP_PASSWORD:
        return jsonify({"success": True})
    return jsonify({"success": False, "error": "Incorrect password."}), 401


@app.post("/api/upload")
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

        session_id = secrets.token_hex(4)
        SESSIONS[session_id] = {
            "engine": engine,
            "filename": f.filename,
            "created_at": datetime.utcnow(),
        }

        return jsonify({
            "session_id": session_id,
            "filename": f.filename,
            "page_count": engine.page_count,
            "chunk_count": engine.chunk_count,
            "top_keywords": engine.top_keywords(5),
        })

    except Exception as e:
        app.logger.exception("Unexpected error in /api/upload")
        return jsonify({"error": "An unexpected error occurred. Please try again."}), 500


@app.post("/api/ask")
def ask():
    try:
        body = request.get_json(silent=True) or {}
        session_id = body.get("session_id", "")
        question = (body.get("question") or "").strip()

        if not question:
            return jsonify({"error": "Please provide a question."}), 400

        session = _get_session(session_id)
        if session is None:
            return jsonify({"error": "Session not found. Please upload the PDF again."}), 404

        result = session["engine"].ask(question)
        return jsonify(result)

    except Exception:
        app.logger.exception("Unexpected error in /api/ask")
        return jsonify({"error": "An unexpected error occurred. Please try again."}), 500


@app.post("/api/summary")
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

        result = session["engine"].summarize(topic)
        return jsonify(result)

    except Exception:
        app.logger.exception("Unexpected error in /api/summary")
        return jsonify({"error": "An unexpected error occurred. Please try again."}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
