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

import io
import re

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


def _embed_model() -> TextEmbedding:
    global _EMBED_MODEL_INST
    if _EMBED_MODEL_INST is None:
        _EMBED_MODEL_INST = TextEmbedding(model_name=EMBED_MODEL)
    return _EMBED_MODEL_INST


def _llm() -> Llama:
    global _LLM
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

def build_prompt(context: str, question: str) -> str:
    return (
        "You are a helpful assistant. Answer the question using ONLY the text excerpts provided below. "
        "Do not use any outside knowledge. "
        "If the answer cannot be found in the excerpts, respond with exactly: NOT_FOUND\n\n"
        f"Document excerpts:\n{context}\n\n"
        f"Question: {question}\n\n"
        "Instructions: Read every excerpt carefully before answering. "
        "For questions about organizations or companies, look for capitalized names and brand names in the text. "
        "For counting questions, count every distinct name you find. "
        "Keep your answer short and direct. "
        "Answer:"
    )


def build_summary_prompt(context: str, topic: str) -> str:
    return (
        f'Using ONLY the excerpts below, write a clear explanation of "{topic}" as covered in this document. '
        "Do not use outside knowledge. "
        "If this topic isn't covered in the excerpts, respond with exactly: NOT_FOUND\n\n"
        f"Excerpts:\n{context}\n\n"
        f'Explanation of "{topic}":'
    )


# ── Main engine class ──────────────────────────────────────────────────────────

class ChapterEngine:

    def __init__(self, pdf_bytes: bytes, filename: str):
        self.filename   = filename
        self.chunks     : list[dict]       = []
        self.embeddings : np.ndarray | None = None
        self.bm25       : BM25Okapi | None  = None
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
        chunks = []
        for i in range(0, len(nltk.sent_tokenize(text)), CHUNK_SENTENCES):
            chunk = " ".join(nltk.sent_tokenize(text)[i: i + CHUNK_SENTENCES]).strip()
            if len(chunk) >= 30:
                chunks.append({"text": chunk, "page": page_num})
        return chunks

    # ── Public API ─────────────────────────────────────────────────────────────

    def ask(self, question: str) -> dict:
        q = correct_spelling(question.strip())

        if fits_whole_document(self.chunks):
            # Small/medium doc: hand over everything in page order
            ordered = sorted(self.chunks, key=lambda c: c["page"])
            context = "\n\n".join(f"[Page {c['page']}] {c['text']}" for c in ordered)
            source_pages = sorted({c["page"] for c in ordered})
        else:
            # Large doc: retrieve top-18 chunks then let LLM read them
            top_chunks = self._hybrid_retrieve(q, top_k=RETRIEVAL_TOP_K)
            ordered = sorted(top_chunks, key=lambda c: c["page"])
            context = "\n\n".join(f"[Page {c['page']}] {c['text']}" for c in ordered)
            source_pages = sorted({c["page"] for c in ordered})

        prompt = build_prompt(context, q)
        response = _llm().create_chat_completion(
            messages=[{"role": "user", "content": prompt}],
            max_tokens=300,
            temperature=0.1,
        )
        answer_text = response["choices"][0]["message"]["content"].strip()

        if answer_text.upper().startswith("NOT_FOUND") or answer_text.upper() == "NOT_FOUND":
            return {
                "answer": (
                    "I couldn't find anything about that in this chapter. "
                    "Try rephrasing, or check if it's covered in a different chapter."
                ),
                "matches": [],
                "mode": "no_match",
            }

        # Build match objects: use first 3 source pages
        matches = []
        for pg in source_pages[:3]:
            chunk = next((c for c in self.chunks if c["page"] == pg), None)
            if chunk:
                matches.append({
                    "page": pg,
                    "relevance": 1.0,
                    "snippet": chunk["text"][:200],
                })

        return {
            "answer": answer_text,
            "matches": matches,
            "mode": "answer",
        }

    def summarize(self, topic: str) -> dict:
        topic = correct_spelling(topic.strip())
        if fits_whole_document(self.chunks):
            ordered = sorted(self.chunks, key=lambda c: c["page"])
            context = "\n\n".join(f"[Page {c['page']}] {c['text']}" for c in ordered)
            source_pages = sorted({c["page"] for c in ordered})
        else:
            top_chunks = self._hybrid_retrieve(topic, top_k=RETRIEVAL_TOP_K)
            ordered = sorted(top_chunks, key=lambda c: c["page"])
            context = "\n\n".join(f"[Page {c['page']}] {c['text']}" for c in ordered)
            source_pages = sorted({c["page"] for c in ordered})

        prompt = build_summary_prompt(context, topic)
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
