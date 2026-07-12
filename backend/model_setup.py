import os
import nltk
from huggingface_hub import hf_hub_download

nltk.download('punkt')
nltk.download('punkt_tab')

MODEL_SIZE = os.environ.get("MODEL_SIZE", "0.5b").lower().strip()

MODEL_MAP = {
    # CPU builds (local dev — no GPU)
    "0.5b": {
        "repo_id": "Qwen/Qwen2.5-0.5B-Instruct-GGUF",
        "filename": "qwen2.5-0.5b-instruct-q4_k_m.gguf",
        "n_ctx": 2048,
        "n_threads": 2,
        "n_gpu_layers": 0,
        "token_budget": 1400,
    },
    "1.5b": {
        "repo_id": "Qwen/Qwen2.5-1.5B-Instruct-GGUF",
        "filename": "qwen2.5-1.5b-instruct-q4_k_m.gguf",
        "n_ctx": 4096,
        "n_threads": 4,
        "n_gpu_layers": 0,
        "token_budget": 3000,
    },
    "3b": {
        "repo_id": "Qwen/Qwen2.5-3B-Instruct-GGUF",
        "filename": "qwen2.5-3b-instruct-q4_k_m.gguf",
        "n_ctx": 4096,
        "n_threads": 8,
        "n_gpu_layers": 0,
        "token_budget": 3000,
    },
    # GPU builds (Azure NC16as_T4_v3 — use with gpu Dockerfile)
    "7b": {
        "repo_id": "Qwen/Qwen2.5-7B-Instruct-GGUF",
        # Model is split into 2 parts — llama.cpp loads from part 1 automatically
        "filename": "qwen2.5-7b-instruct-q4_k_m-00001-of-00002.gguf",
        "extra_files": ["qwen2.5-7b-instruct-q4_k_m-00002-of-00002.gguf"],
        "n_ctx": 8192,
        "n_threads": 4,
        "n_gpu_layers": -1,
        "token_budget": 6000,
    },
    "7b-cpu": {
        "repo_id": "Qwen/Qwen2.5-7B-Instruct-GGUF",
        "filename": "qwen2.5-7b-instruct-q4_k_m-00001-of-00002.gguf",
        "extra_files": ["qwen2.5-7b-instruct-q4_k_m-00002-of-00002.gguf"],
        "n_ctx": 4096,
        "n_threads": 12,
        "n_gpu_layers": 0,
        "token_budget": 3000,
    },
}

cfg = MODEL_MAP.get(MODEL_SIZE, MODEL_MAP["0.5b"])
os.makedirs("/app/models", exist_ok=True)

print(f"Downloading model: {cfg['filename']} (size={MODEL_SIZE}) ...")
hf_hub_download(
    repo_id=cfg["repo_id"],
    filename=cfg["filename"],
    local_dir="/app/models",
    local_dir_use_symlinks=False,
)
for extra in cfg.get("extra_files", []):
    print(f"Downloading extra part: {extra} ...")
    hf_hub_download(
        repo_id=cfg["repo_id"],
        filename=extra,
        local_dir="/app/models",
        local_dir_use_symlinks=False,
    )

# Write config so engine.py knows which file to load at runtime
with open("/app/models/model_config.txt", "w") as f:
    f.write(f"path=/app/models/{cfg['filename']}\n")
    f.write(f"n_ctx={cfg['n_ctx']}\n")
    f.write(f"n_threads={cfg['n_threads']}\n")
    f.write(f"n_gpu_layers={cfg['n_gpu_layers']}\n")
    f.write(f"token_budget={cfg['token_budget']}\n")
print("Model config written.")

# Pre-download fastembed model at build time
print("Downloading fastembed BGE-small model...")
from fastembed import TextEmbedding
TextEmbedding(model_name="BAAI/bge-small-en-v1.5")
print("All models ready.")
