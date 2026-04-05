# ═══════════════════════════════════════════════════════════════════════════════
# Meck-Grade — Docker Image
# Multi-stage build: keeps final image lean (~800 MB with OpenCV).
# ═══════════════════════════════════════════════════════════════════════════════

FROM python:3.11-slim AS base

# System dependencies for OpenCV + Tesseract
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    tesseract-ocr \
    tesseract-ocr-deu \
    tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (layer-cached)
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Create persistent-data directories
RUN mkdir -p data uploads

# Expose port
EXPOSE 8374

# Environment defaults (override in docker-compose or -e flags)
ENV MECKGRADE_HOST=0.0.0.0
ENV MECKGRADE_PORT=8374
ENV PYTHONUNBUFFERED=1

CMD ["python", "-m", "uvicorn", "backend.main:app", \
     "--host", "0.0.0.0", "--port", "8374", \
     "--workers", "1", "--log-level", "warning"]
