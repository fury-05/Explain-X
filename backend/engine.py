"""
ExplainX answering engine — local LLM comprehension architecture.

Architecture (per docs/05_FIX_LOCAL_LLM_COMPREHENSION.md):

  Small/medium PDF (fits in context window):
    → feed the ENTIRE document text to the LLM
    → LLM reads everything, so counting/listing/naming works correctly

  Large PDF (too big for context window):
    → fastembed + BM25 hybrid retrieval narrows to top-18 chunks
    → LLM reads those chunks and answers from them

  The LLM is told to respond with exactly NOT_FOUND if the answer
  isn't in the provided text — no hallucination, no guessing.
"""

import hashlib
import io
import re
import threading

import nltk
import numpy as np
import pdfplumber
from fastembed import TextEmbedding
from llama_cpp import Llama
from rank_bm25 import BM25Okapi
from spellchecker import SpellChecker

_spell = SpellChecker()

# ── Models ─────────────────────────────────────────────────────────────────────
EMBED_MODEL = "BAAI/bge-small-en-v1.5"

# Read model config written by model_setup.py at build time
def _read_model_config() -> dict:
    cfg = {"path": "/app/models/qwen2.5-0.5b-instruct-q4_k_m.gguf",
           "n_ctx": 2048, "n_threads": 2, "n_gpu_layers": 0, "token_budget": 1400}
    try:
        with open("/app/models/model_config.txt") as f:
            for line in f:
                k, v = line.strip().split("=", 1)
                if k == "path":           cfg["path"] = v
                elif k == "n_ctx":        cfg["n_ctx"] = int(v)
                elif k == "n_threads":    cfg["n_threads"] = int(v)
                elif k == "n_gpu_layers": cfg["n_gpu_layers"] = int(v)
                elif k == "token_budget": cfg["token_budget"] = int(v)
    except FileNotFoundError:
        pass
    return cfg

_MODEL_CFG             = _read_model_config()
LLM_PATH               = _MODEL_CFG["path"]
_LLM_N_CTX             = _MODEL_CFG["n_ctx"]
_LLM_N_THREADS         = _MODEL_CFG["n_threads"]
_LLM_N_GPU_LAYERS      = _MODEL_CFG["n_gpu_layers"]
WHOLE_DOC_TOKEN_BUDGET = _MODEL_CFG["token_budget"]

# Retrieval settings for large-doc path
CHUNK_SENTENCES = 4
RETRIEVAL_TOP_K = 18

# ── Singletons — loaded once at module import, reused across all requests ──────
_EMBED_MODEL_INST: TextEmbedding | None = None
_LLM: Llama | None = None
_EMBED_LOCK = threading.Lock()
_LLM_LOCK   = threading.Lock()


def _embed_model() -> TextEmbedding:
    global _EMBED_MODEL_INST
    with _EMBED_LOCK:
        if _EMBED_MODEL_INST is None:
            _EMBED_MODEL_INST = TextEmbedding(model_name=EMBED_MODEL)
        return _EMBED_MODEL_INST


def _llm() -> Llama:
    global _LLM
    with _LLM_LOCK:
        if _LLM is None:
            _LLM = Llama(
                model_path=LLM_PATH,
                n_ctx=_LLM_N_CTX,
                n_threads=_LLM_N_THREADS,
                n_gpu_layers=_LLM_N_GPU_LAYERS,
                verbose=False,
            )
        return _LLM


def _embed(texts: list) -> np.ndarray:
    arr = np.array(list(_embed_model().embed(texts)), dtype=np.float32)
    norms = np.linalg.norm(arr, axis=1, keepdims=True)
    return arr / np.where(norms == 0, 1.0, norms)


_BM25_STOP = frozenset({
    'a','an','the','is','are','was','were','be','been','being','have','has',
    'had','do','does','did','will','would','could','should','may','might',
    'shall','can','i','me','my','we','our','you','your','he','his','she',
    'her','it','its','they','their','them','this','that','these','those',
    'what','which','who','whom','how','when','where','why','in','on','at',
    'to','for','of','with','by','from','up','about','into','and','but',
    'or','not','no','just','also','than','then','there','here','s','d',
})


def _bm25_tokens(text: str) -> list:
    words = re.findall(r'[a-zA-Z0-9]+', text.lower())
    return [w for w in words if w not in _BM25_STOP and len(w) > 1]


def _clean(text: str) -> str:
    text = re.sub(r'[✓✗•▪▸◦‣⁃·]', ' ', text)
    text = re.sub(r'\s{2,}', ' ', text)
    return text.strip()


_SPELL_PROTECTED = frozenset({
    # Common domain abbreviations that spellchecker mangles
    'ai', 'ml', 'pdf', 'ceo', 'cto', 'cfo', 'coo', 'hr', 'ui', 'ux',
    'api', 'url', 'gpu', 'cpu', 'llm', 'rag', 'nlp', 'cv', 'k12',
    'sdg', 'lms', 'iot', 'saas', 'b2b', 'b2c', 'kpi', 'roi',
})


def correct_spelling(text: str) -> str:
    """
    Correct obvious spelling mistakes in user queries.
    Skips: words already correct, proper nouns (initial capital), known abbreviations,
    and words <= 3 chars (too short for reliable correction).
    """
    words = text.split()
    corrected = []
    for word in words:
        clean = re.sub(r'[^a-zA-Z]', '', word)
        lower = clean.lower()

        # Skip: empty, 1-2 char words, capitalised (proper noun), known abbreviation
        if (not clean or len(clean) <= 2
                or clean[0].isupper()
                or lower in _SPELL_PROTECTED):
            corrected.append(word)
            continue

        # Skip words already in dictionary
        if lower in _spell:
            corrected.append(word)
            continue

        suggestion = _spell.correction(lower)
        if suggestion and suggestion != lower:
            suffix = word[len(clean):]   # preserve trailing punctuation
            corrected.append(suggestion + suffix)
        else:
            corrected.append(word)
    return ' '.join(corrected)


def estimate_tokens(text: str) -> int:
    return int(len(text.split()) * 1.3)


def fits_whole_document(chunks: list) -> bool:
    full_text = " ".join(c["text"] for c in chunks)
    return estimate_tokens(full_text) <= WHOLE_DOC_TOKEN_BUDGET


# ── Prompt builders ────────────────────────────────────────────────────────────

LENGTH_INSTRUCTIONS = {
    "short":    "Reply in 1–2 sentences only.",
    "normal":   "Keep your answer short and direct.",
    "detailed": "Give a thorough, well-structured answer with as much detail as the text supports.",
}

def build_prompt(context: str, question: str, length: str = "normal") -> str:
    length_instr = LENGTH_INSTRUCTIONS.get(length, LENGTH_INSTRUCTIONS["normal"])
    return (
        "You are a helpful assistant. Answer the question using ONLY the text excerpts provided below. "
        "Do not use any outside knowledge. "
        "If the answer cannot be found in the excerpts, respond with exactly: NOT_FOUND\n\n"
        f"Document excerpts:\n{context}\n\n"
        f"Question: {question}\n\n"
        "Instructions: Read every excerpt carefully before answering. "
        "For questions about organizations or companies, look for capitalized names and brand names in the text. "
        "For counting questions, count every distinct name you find. "
        f"{length_instr} "
        "Answer:"
    )


def build_eli12_prompt(context: str, question: str) -> str:
    return (
        "You are explaining to a 12-year-old student. Use very simple words and short sentences. "
        "Answer the question using ONLY the text excerpts below. No outside knowledge. "
        "If the answer is not in the excerpts, respond with exactly: NOT_FOUND\n\n"
        f"Document excerpts:\n{context}\n\n"
        f"Question: {question}\n\n"
        "Simple explanation:"
    )


def build_followup_prompt(answer: str) -> str:
    return (
        "A student just received this answer:\n"
        f'"{answer}"\n\n'
        "Suggest exactly 2 natural follow-up questions a student might want to ask next. "
        "Each question must be short (under 12 words) and relevant to the answer. "
        "Format: one question per line, no numbering, no extra text."
    )


def build_flashcard_prompt(context: str) -> str:
    return (
        "You are making study flashcards. Using ONLY the text excerpts below, "
        "extract exactly 8 important term-definition pairs.\n\n"
        "Format each card EXACTLY like this (no extra text):\n"
        "TERM: <term>\n"
        "DEF: <one sentence definition>\n\n"
        f"Document excerpts:\n{context}\n\n"
        "8 flashcards:"
    )


def build_quiz_prompt(context: str) -> str:
    return (
        "You are a teacher creating a quiz. Using ONLY the text excerpts below, "
        "write exactly 5 multiple-choice questions that test understanding of the key ideas.\n\n"
        "Format each question EXACTLY like this (no extra text before or after):\n"
        "Q: <question text>\n"
        "A) <option>\n"
        "B) <option>\n"
        "C) <option>\n"
        "D) <option>\n"
        "ANSWER: <letter>\n"
        "EXPLAIN: <one sentence explaining why that answer is correct>\n\n"
        f"Document excerpts:\n{context}\n\n"
        "5 multiple-choice questions:"
    )


def _is_partial_answer(text: str) -> bool:
    hedges = [
        "i'm not sure", "i am not sure", "it's unclear", "it is unclear",
        "not explicitly", "not directly", "may be", "might be", "could be",
        "seems to", "appears to", "possibly", "perhaps", "not mentioned",
        "not specified", "cannot determine", "can't determine",
    ]
    low = text.lower()
    if len(text.split()) < 8:
        return True
    return any(h in low for h in hedges)


def build_summary_prompt(context: str, topic: str) -> str:
    return (
        f'Using ONLY the excerpts below, write a clear explanation of "{topic}" as covered in this document. '
        "Do not use outside knowledge. "
        "If this topic isn't covered in the excerpts, respond with exactly: NOT_FOUND\n\n"
        f"Excerpts:\n{context}\n\n"
        f'Explanation of "{topic}":'
    )


def _parse_flashcards(raw: str) -> list:
    cards = []
    blocks = re.split(r'\n(?=TERM:)', raw.strip())
    for block in blocks:
        term = def_ = ""
        for line in block.strip().splitlines():
            line = line.strip()
            if line.upper().startswith("TERM:"):
                term = line[5:].strip()
            elif line.upper().startswith("DEF:"):
                def_ = line[4:].strip()
        if term and def_:
            cards.append({"term": term, "definition": def_})
    return cards[:8]


def _parse_quiz(raw: str) -> list:
    questions = []
    blocks = re.split(r'\n(?=Q:)', raw.strip())
    for block in blocks:
        lines = [l.strip() for l in block.strip().splitlines() if l.strip()]
        q_text = explanation = ""
        options = {}
        answer = ""
        for line in lines:
            if line.startswith("Q:"):
                q_text = line[2:].strip()
            elif line.startswith(("A)", "B)", "C)", "D)")):
                options[line[0]] = line[3:].strip()
            elif line.upper().startswith("ANSWER:"):
                answer = line.split(":", 1)[-1].strip().upper()
            elif line.upper().startswith("EXPLAIN:"):
                explanation = line.split(":", 1)[-1].strip()
        if q_text and len(options) == 4 and answer in options:
            questions.append({"question": q_text, "options": options, "answer": answer, "explanation": explanation})
    return questions[:5]


# ── Main engine class ──────────────────────────────────────────────────────────

class ChapterEngine:

    def __init__(self, pdf_bytes: bytes, filename: str):
        self.filename   = filename
        self.chunks     : list[dict]       = []
        self.embeddings : np.ndarray | None = None
        self.bm25       : BM25Okapi | None  = None
        self._cache     : dict             = {}
        self._build(pdf_bytes)

    # ── Build ──────────────────────────────────────────────────────────────────

    def _build(self, pdf_bytes: bytes):
        pages = self._read_pdf(pdf_bytes)
        if not any(t.strip() for t in pages.values()):
            raise ValueError(
                "This PDF has no extractable text. "
                "Please upload a text-based PDF, not a scanned image."
            )

        for page_num, text in sorted(pages.items()):
            self.chunks.extend(self._split(text, page_num))

        if not self.chunks:
            raise ValueError("Could not split this PDF into readable chunks.")

        texts = [c["text"] for c in self.chunks]
        self.embeddings = _embed(texts)
        self.bm25 = BM25Okapi([_bm25_tokens(t) for t in texts])

    def _read_pdf(self, pdf_bytes: bytes) -> dict:
        pages = {}
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for i, page in enumerate(pdf.pages, start=1):
                pages[i] = _clean(page.extract_text() or "")
        return pages

    def _split(self, text: str, page_num: int) -> list:
        sentences = nltk.sent_tokenize(text)
        chunks = []
        for i in range(0, len(sentences), CHUNK_SENTENCES):
            chunk = " ".join(sentences[i: i + CHUNK_SENTENCES]).strip()
            if len(chunk) >= 30:
                chunks.append({"text": chunk, "page": page_num})
        return chunks

    # ── Shared context builder ─────────────────────────────────────────────────

    def _build_context(self, query: str) -> tuple:
        """Return (context_string, source_pages) for the given query."""
        if fits_whole_document(self.chunks):
            ordered = sorted(self.chunks, key=lambda c: c["page"])
        else:
            top_chunks = self._hybrid_retrieve(query, top_k=RETRIEVAL_TOP_K)
            ordered = sorted(top_chunks, key=lambda c: c["page"])
        context = "\n\n".join(f"[Page {c['page']}] {c['text']}" for c in ordered)
        source_pages = sorted({c["page"] for c in ordered})
        return context, source_pages

    # ── Public API ─────────────────────────────────────────────────────────────

    def ask(self, question: str, history: list = None, length: str = "normal") -> dict:
        q = correct_spelling(question.strip())

        # Cache key: question + length (history intentionally excluded — context-sensitive)
        cache_key = hashlib.sha256(f"{q}|{length}".encode()).hexdigest()
        if cache_key in self._cache:
            return self._cache[cache_key]

        context, source_pages = self._build_context(q)

        system_msg = {"role": "user", "content": build_prompt(context, q, length)}
        messages = [system_msg]
        if history:
            for turn in history[-6:]:
                role = "user" if turn.get("role") == "user" else "assistant"
                messages.append({"role": role, "content": str(turn.get("content", ""))})
            messages.append({"role": "user", "content": q})

        max_tokens = {"short": 120, "normal": 300, "detailed": 500}.get(length, 300)
        with _LLM_LOCK:
            response = _llm().create_chat_completion(
                messages=messages,
                max_tokens=max_tokens,
                temperature=0.1,
            )
        answer_text = response["choices"][0]["message"]["content"].strip()

        if answer_text.upper().startswith("NOT_FOUND") or answer_text.upper() == "NOT_FOUND":
            result = {
                "answer": (
                    "I couldn't find anything about that in this chapter. "
                    "Try rephrasing, or check if it's covered in a different chapter."
                ),
                "matches": [],
                "mode": "no_match",
            }
            self._cache[cache_key] = result
            return result

        # Real relevance: use the hybrid score of the top matching chunk for each page
        q_emb = _embed([q])[0]
        sem_scores = self.embeddings.dot(q_emb).flatten()
        tokens = _bm25_tokens(q)
        bm25_raw = np.array(self.bm25.get_scores(tokens), dtype=np.float32) if tokens else np.zeros(len(self.chunks))
        bm25_max = bm25_raw.max()
        bm25_norm = bm25_raw / bm25_max if bm25_max > 0 else bm25_raw
        combined = (sem_scores + 0.15 * bm25_norm)

        matches = []
        for pg in source_pages[:3]:
            idxs = [i for i, c in enumerate(self.chunks) if c["page"] == pg]
            if not idxs:
                continue
            best_idx = max(idxs, key=lambda i: combined[i])
            relevance = float(np.clip(combined[best_idx], 0.0, 1.0))
            matches.append({
                "page": pg,
                "relevance": round(relevance, 3),
                "snippet": self.chunks[best_idx]["text"][:200],
            })

        mode = "partial" if _is_partial_answer(answer_text) else "answer"
        result = {"answer": answer_text, "matches": matches, "mode": mode}
        self._cache[cache_key] = result
        return result

    def summarize(self, topic: str) -> dict:
        topic = correct_spelling(topic.strip())
        context, source_pages = self._build_context(topic)

        prompt = build_summary_prompt(context, topic)
        with _LLM_LOCK:
            response = _llm().create_chat_completion(
                messages=[{"role": "user", "content": prompt}],
                max_tokens=400,
                temperature=0.1,
            )
        answer_text = response["choices"][0]["message"]["content"].strip()

        if answer_text.startswith("NOT_FOUND"):
            return {"summary": "This topic doesn't appear to be covered in the document.", "sources": []}

        return {
            "summary": answer_text,
            "sources": [{"page": p} for p in source_pages[:5]],
        }

    def generate_quiz(self) -> list:
        context, _ = self._build_context("key concepts important facts definitions")
        prompt = build_quiz_prompt(context)
        with _LLM_LOCK:
            response = _llm().create_chat_completion(
                messages=[{"role": "user", "content": prompt}],
                max_tokens=800,
                temperature=0.3,
            )
        raw = response["choices"][0]["message"]["content"].strip()
        return _parse_quiz(raw)

    def explain_simply(self, question: str) -> dict:
        q = correct_spelling(question.strip())
        context, source_pages = self._build_context(q)
        prompt = build_eli12_prompt(context, q)
        with _LLM_LOCK:
            response = _llm().create_chat_completion(
                messages=[{"role": "user", "content": prompt}],
                max_tokens=250,
                temperature=0.2,
            )
        answer_text = response["choices"][0]["message"]["content"].strip()
        if answer_text.upper().startswith("NOT_FOUND"):
            return {"answer": "This topic doesn't seem to be in this chapter.", "mode": "no_match"}
        return {"answer": answer_text, "mode": "answer"}

    def get_followups(self, answer: str) -> list:
        prompt = build_followup_prompt(answer)
        with _LLM_LOCK:
            response = _llm().create_chat_completion(
                messages=[{"role": "user", "content": prompt}],
                max_tokens=80,
                temperature=0.4,
            )
        raw = response["choices"][0]["message"]["content"].strip()
        lines = [l.strip().lstrip("-•123456789.) ") for l in raw.splitlines() if l.strip()]
        return [l for l in lines if len(l) > 5][:2]

    def generate_flashcards(self) -> list:
        context, _ = self._build_context("key terms definitions concepts vocabulary")
        prompt = build_flashcard_prompt(context)
        with _LLM_LOCK:
            response = _llm().create_chat_completion(
                messages=[{"role": "user", "content": prompt}],
                max_tokens=600,
                temperature=0.2,
            )
        raw = response["choices"][0]["message"]["content"].strip()
        return _parse_flashcards(raw)

    def top_keywords(self, n: int = 5) -> list:
        ranked = sorted(
            [(t, self.bm25.idf.get(t, 0)) for t in self.bm25.idf if len(t) > 2],
            key=lambda x: x[1], reverse=True,
        )
        return [t for t, _ in ranked[:n]]

    @property
    def page_count(self) -> int:
        return max((c["page"] for c in self.chunks), default=0)

    @property
    def chunk_count(self) -> int:
        return len(self.chunks)

    # ── Hybrid retrieval (large-doc path only) ─────────────────────────────────

    def _hybrid_retrieve(self, query: str, top_k: int) -> list:
        q_emb = _embed([query])[0]
        sem   = self.embeddings.dot(q_emb).flatten()

        tokens   = _bm25_tokens(query)
        bm25_raw = np.array(self.bm25.get_scores(tokens), dtype=np.float32) if tokens else np.zeros(len(self.chunks))
        bm25_max = bm25_raw.max()
        bm25_norm = bm25_raw / bm25_max if bm25_max > 0 else bm25_raw

        combined = sem + 0.15 * bm25_norm
        top_idx  = combined.argsort()[::-1][:top_k]
        return [self.chunks[i] for i in top_idx]
