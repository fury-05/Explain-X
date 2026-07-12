FROM python:3.11-slim

WORKDIR /app

# ── Model selector ────────────────────────────────────────────────────────────
# Build with: docker compose build --build-arg MODEL_SIZE=0.5b   (default, laptop)
#             docker compose build --build-arg MODEL_SIZE=1.5b   (better quality)
#             docker compose build --build-arg MODEL_SIZE=3b     (high quality)
#             docker compose build --build-arg MODEL_SIZE=7b     (best, needs 16GB+)
ARG MODEL_SIZE=0.5b
ENV MODEL_SIZE=${MODEL_SIZE}

COPY requirements.txt .

# Install everything except llama-cpp-python first
RUN pip install --no-cache-dir flask==3.0.3 flask-cors==4.0.1 pdfplumber==0.11.4 \
    scikit-learn==1.5.1 nltk==3.9.1 gunicorn==22.0.0 \
    fastembed==0.3.6 rank-bm25==0.2.2 huggingface_hub pyspellchecker==0.8.1

# Install llama-cpp-python (build from source for glibc; libgomp1 stays as runtime dep)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake libgomp1 && \
    CMAKE_ARGS="-DLLAMA_BLAS=OFF" pip install --no-cache-dir llama-cpp-python==0.2.90 && \
    apt-get purge -y build-essential cmake && apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*

COPY model_setup.py .
RUN python model_setup.py

COPY . .

EXPOSE 5000

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "1", "--timeout", "300", "--graceful-timeout", "300", "app:app"]
