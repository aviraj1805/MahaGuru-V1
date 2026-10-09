# Single image: builds the web app, then serves it and the API from one FastAPI process.

# ---- web build ------------------------------------------------------------------------
FROM node:22-alpine AS web
WORKDIR /web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY apps/web/ ./
RUN npm run build

# ---- api runtime ----------------------------------------------------------------------
FROM python:3.12-slim AS api
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY --from=ghcr.io/astral-sh/uv:0.8.17 /uv /usr/local/bin/uv
WORKDIR /app/apps/api
COPY apps/api/pyproject.toml apps/api/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY apps/api/ ./
COPY data/ /app/data/
COPY --from=web /web/dist /app/apps/web/dist
RUN useradd --create-home --uid 10001 mahaguru && chown -R mahaguru /app
USER mahaguru
ENV PATH="/app/apps/api/.venv/bin:$PATH" WEB_DIST_DIR=/app/apps/web/dist ENV=production PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
