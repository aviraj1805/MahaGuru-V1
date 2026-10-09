# Deployment

MahaGuru ships as **one Docker image**: the React app is built into static files and served by the same FastAPI process as the API. Being same-origin means no CORS or third-party-cookie problems and only one service to run.

## Recommended free setup (showcase traffic)

| Piece | Choice | Cost | Notes |
|---|---|---|---|
| App (API + web) | Render free web service (`render.yaml`) | $0 | Sleeps after ~15 min idle; the first request then takes ~1 min. |
| Database | Neon free Postgres | $0 | Doesn't expire (Render's free Postgres expires after 30 days). |
| AI | Google AI Studio API key (Gemini free tier) | $0 | Rate-limited per project. MahaGuru's own quotas keep usage modest. |
| Errors | Render logs (built in); optional Sentry free tier | $0 | |
| Domain | Any registrar | about $10–15 per year for `.com` | **Not purchased.** Owner's decision. |

Alternatives: Fly.io or Railway for the app (small monthly cost, no sleeping); Supabase for Postgres; Groq's free tier via `LLM_PROVIDER=openai_compat`.

Free-tier limits change. Check them before launch: [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) and Render's and Neon's pricing pages.

## Steps (no paid services involved)

1. **Database:** create a Neon project and copy its connection string (`postgresql://…?sslmode=require`). The app normalises it automatically.
2. **AI key:** create a key at https://aistudio.google.com/apikey.
3. **Render:** New → Blueprint → pick this repo. Set `DATABASE_URL`, `GEMINI_API_KEY` and `WEB_ORIGIN` (your Render URL, e.g. `https://mahaguru.onrender.com`). `SECRET_KEY` is generated automatically.
4. Deploy. On start the container runs `alembic upgrade head`, then serves on `$PORT`. Health check: `/api/health`.
5. Smoke test: open the site, start a StudentGPT reflection, create a classroom, and confirm the demo banner is **absent**.

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ENV` | yes (prod) | `development` | `production` enables strict checks, secure cookies and hides API docs |
| `SECRET_KEY` | yes | dev value | ≥ 32 random chars in production (startup fails otherwise) |
| `DATABASE_URL` | yes | SQLite file | Postgres URL in production |
| `LLM_PROVIDER` | | `gemini` | `gemini`, `openai_compat`, or `fake` (refused in production) |
| `GEMINI_API_KEY` | if gemini | | Server-side only; never sent to the browser |
| `LLM_MODEL` / `LLM_FAST_MODEL` | | `gemini-2.5-flash` / `gemini-2.5-flash-lite` | Change when models are retired |
| `OPENAI_BASE_URL` / `OPENAI_API_KEY` | if openai_compat | Groq URL | Any OpenAI-compatible endpoint |
| `WEB_ORIGIN` | | `http://localhost:5173` | Public site URL (CORS allowlist) |
| `GUEST_DAILY_MESSAGES`, `USER_DAILY_MESSAGES`, `GUEST_DAILY_CLASSROOM_ACTIONS`, `USER_DAILY_CLASSROOM_ACTIONS`, `GUEST_MAX_CLASSROOMS`, `USER_MAX_CLASSROOMS` | | 25 / 150 / 30 / 200 / 1 / 10 | Rolling 24h quotas |

Secrets live only in the host's environment settings. `.env` files are git-ignored.

## Custom domain (when you decide to buy one)

Register the `.com`, add it to the Render service (Settings → Custom domains), create the CNAME (or ALIAS/A for the apex) records Render shows, and wait for the automatic TLS certificate. Then update `WEB_ORIGIN`.

## Production checklist

- [ ] `ENV=production`, strong `SECRET_KEY`, real `GEMINI_API_KEY`
- [ ] `/api/health` reports `database: true` and `demo_mode: false`
- [ ] StudentGPT evaluation run passes its thresholds with the production model
- [ ] Helpline numbers on `/safety` re-verified
- [ ] Privacy page reviewed by the owner
- [ ] Quotas sized to the free-tier limits of the chosen model
