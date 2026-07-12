"""
Sanity tests for ChapterEngine — runs against in-memory text, no real PDF needed.
"""
import sys, os, types

# Stub pdfplumber so tests don't need the library installed locally
sys.modules.setdefault("pdfplumber", types.ModuleType("pdfplumber"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import nltk
for pkg in ("punkt", "punkt_tab"):
    try:
        nltk.data.find(f"tokenizers/{pkg}")
    except LookupError:
        nltk.download(pkg)

from engine import ChapterEngine, RELEVANCE_THRESHOLD, LOW_CONF_FLOOR
from fastembed import TextEmbedding
from rank_bm25 import BM25Okapi
import numpy as np

PHOTOSYNTHESIS_CHUNKS = [
    "Photosynthesis is the process by which green plants use sunlight to synthesize glucose from carbon dioxide and water.",
    "Chlorophyll is the green pigment in leaves that absorbs light energy from the sun and drives photosynthesis.",
    "The light-dependent reactions occur in the thylakoid membranes of the chloroplast and produce ATP and NADPH.",
    "The Calvin cycle takes place in the stroma of the chloroplast and fixes carbon dioxide into organic molecules.",
    "Oxygen is released as a byproduct of the light-dependent reactions when water molecules are split.",
    "Glucose produced by photosynthesis serves as the primary energy source for the plant's growth and metabolism.",
    "The rate of photosynthesis is affected by light intensity, carbon dioxide concentration, and temperature.",
    "Plants require sunlight, water, and carbon dioxide to perform photosynthesis effectively.",
]


def _make_engine(texts: list[str]) -> ChapterEngine:
    from engine import _embed
    engine = ChapterEngine.__new__(ChapterEngine)
    engine.filename = "test.pdf"
    engine.chunks = [{"text": t, "page": i + 1} for i, t in enumerate(texts)]
    engine.chunk_embeddings = _embed(texts)
    tokenised = [t.lower().split() for t in texts]
    engine.bm25 = BM25Okapi(tokenised)
    return engine


def test_relevant_question_scores_above_threshold():
    engine = _make_engine(PHOTOSYNTHESIS_CHUNKS)
    result = engine.ask("What is the role of chlorophyll in photosynthesis?")
    assert result["mode"] in ("answer", "low_confidence"), \
        f"Expected answer/low_confidence, got '{result['mode']}'"
    assert len(result["matches"]) > 0
    assert result["matches"][0]["relevance"] >= LOW_CONF_FLOOR


def test_unrelated_question_returns_no_match():
    engine = _make_engine(PHOTOSYNTHESIS_CHUNKS)
    result = engine.ask("What is the latest score in the cricket world cup final?")
    assert result["mode"] == "no_match", \
        f"Expected no_match, got '{result['mode']}' — answer: {result['answer'][:80]}"


def test_overview_question_returns_answer():
    engine = _make_engine(PHOTOSYNTHESIS_CHUNKS)
    result = engine.ask("What is this document about?")
    assert result["mode"] == "answer"
    assert len(result["answer"]) > 50


def test_summary_returns_sources_in_page_order():
    engine = _make_engine(PHOTOSYNTHESIS_CHUNKS)
    result = engine.summarize("Calvin cycle")
    assert "sources" in result
    pages = [s["page"] for s in result["sources"]]
    assert pages == sorted(pages), "Summary sources must be in page order"


def test_top_keywords_returns_list():
    engine = _make_engine(PHOTOSYNTHESIS_CHUNKS)
    kw = engine.top_keywords(5)
    assert isinstance(kw, list) and len(kw) == 5


if __name__ == "__main__":
    test_relevant_question_scores_above_threshold()
    print("✓ relevant question")
    test_unrelated_question_returns_no_match()
    print("✓ unrelated → no_match")
    test_overview_question_returns_answer()
    print("✓ overview question")
    test_summary_returns_sources_in_page_order()
    print("✓ summary page order")
    test_top_keywords_returns_list()
    print("✓ top keywords")
    print("\nAll tests passed.")
