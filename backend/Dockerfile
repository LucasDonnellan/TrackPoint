# ── Backend Dockerfile ────────────────────────────────────────────────────────
# Multi-stage build keeps final image lean.

FROM python:3.12-slim AS builder

WORKDIR /build
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt


FROM python:3.12-slim

# Security: run as non-root
RUN useradd -m -u 1000 farmtrack
WORKDIR /app

COPY --from=builder /install /usr/local
COPY . .

RUN mkdir -p /var/log/farmtrack && chown farmtrack:farmtrack /var/log/farmtrack

USER farmtrack

EXPOSE 5000

# Gunicorn: 4 sync workers is enough for up to ~200 req/s.
# For 1000+ devices reporting every 30s, that's ~33 req/s — plenty of headroom.
# Scale with --workers $(nproc) or add a second EC2 instance behind ALB.
CMD ["gunicorn", "wsgi:application", \
     "--workers", "4", \
     "--worker-class", "sync", \
     "--bind", "0.0.0.0:5000", \
     "--timeout", "30", \
     "--access-logfile", "-", \
     "--error-logfile", "-"]
