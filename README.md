# MahaGuru AI

**From confusion to clarity.** An open-source AI platform for college students with two products:

- **StudentGPT (reflect).** A reflective mentor that asks before it answers. It helps students find the root of their confusion (fears, expectations, borrowed goals) through thoughtful questions, instead of handing out advice. It has built-in safety support and ends with a clarity summary the student keeps.
- **Classroom (learn and execute).** Turns a learning goal into a personalised roadmap: clarifying questions, a short diagnostic, modules and lessons written for the student's level, an AI teacher per lesson, practice quizzes with feedback, milestone projects graded against a rubric, mastery tracking, and a roadmap that adapts.

It runs on **free-tier AI** (Google Gemini by default; any OpenAI-compatible endpoint such as Groq, OpenRouter or a local Ollama also works) and deploys as **one free web service plus a free Postgres**.

| | |
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS (custom token-based design system, light and dark) |
| Backend | FastAPI, SQLAlchemy 2 (async), Alembic, Pydantic v2 |
| Database | PostgreSQL in production, SQLite for zero-setup local development |
| AI | Provider-agnostic layer (Gemini REST, OpenAI-compatible), structured output with validation and repair |
| Tests | pytest (62), Vitest, Playwright end-to-end on desktop and mobile |

## Quick start (local)

Requirements: Python 3.11+, [uv](https://docs.astral.sh/uv/), Node 20+.

```bash
# 1. API
cd apps/api
cp .env.example .env            # add GEMINI_API_KEY (free: https://aistudio.google.com/apikey)
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8000

# 2. Web (second terminal)
cd apps/web
npm install
npm run dev                      # http://localhost:5173 (proxies /api to :8000)
```

No API key yet? Set `LLM_PROVIDER=fake` in `apps/api/.env` to click through the whole product offline. A banner makes clear the replies are placeholders, and this mode is refused in production.

Prefer Docker? `GEMINI_API_KEY=... docker compose up --build` gives you Postgres plus the app on http://localhost:8000.

## Tests

```bash
cd apps/api && uv run pytest              # API, engines, LLM layer, migrations (SQLite)
TEST_DATABASE_URL=postgresql+asyncpg://user@localhost/db uv run pytest   # same suite on Postgres
cd apps/web && npm test                   # unit tests
cd apps/web && npm run build && npm run e2e   # Playwright journeys (desktop + mobile)
```

Tests use a deterministic offline AI provider, so they are free and repeatable. The quality of the real model is measured separately with the [StudentGPT evaluation harness](docs/evaluation.md).

## Repository layout

```
apps/api/                 FastAPI backend
  app/api/routes/         auth, studentgpt, classroom, dashboard
  app/services/llm/       provider abstraction, Gemini, OpenAI-compatible, offline fake
  app/services/studentgpt safety screen, understanding record, exemplar retrieval, prompts
  app/services/classroom  intake, diagnostic, roadmap, lessons, grading, adaptation, resources
  alembic/                database migrations
  scripts/                dataset build, dialogue generation, evaluation
  tests/
apps/web/                 React app (pages, features/studentgpt, features/classroom)
data/studentgpt/          authored dialogue dataset and evaluation scenarios
docs/                     architecture, dataset, evaluation, deployment, decisions
```

## Documentation

- [Architecture](docs/architecture.md): how both products work, the data model and API.
- [StudentGPT dataset](docs/dataset.md): audit of the original data, the new dataset and how to grow it.
- [Evaluation](docs/evaluation.md): how StudentGPT's behaviour is measured.
- [Deployment](docs/deployment.md): free hosting (Render plus Neon), domain, secrets, monitoring and costs.
- [Decisions](docs/decisions.md): key technical choices and trade-offs.

## Safety

StudentGPT is a mentor for reflection, **not** a therapist or medical service. Every message passes a deterministic safety screen (English and Hinglish) before the model replies. If there are signs of crisis, the reply switches to a safety protocol and the UI shows helplines (Tele-MANAS 14416, 112). The platform is intended for students aged 18 and above. See [`/safety`](apps/web/src/pages/InfoPage.tsx) in the app.

## License

[MIT](LICENSE)
