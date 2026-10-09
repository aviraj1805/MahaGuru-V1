# Architecture

```
Browser (React SPA)
   │  same-origin HTTPS · JSON · Server-Sent Events for streamed replies
   ▼
FastAPI (one process; also serves the built SPA)
   ├─ routes/        auth · studentgpt · classroom · dashboard · health
   ├─ services/
   │    llm/         LLMProvider interface → Gemini | OpenAI-compatible | Fake (tests)
   │    studentgpt/  safety screen → prompt (record + exemplars) → stream → state update
   │    classroom/   intake · diagnostic · roadmap · lessons · grading · adaptation · resources
   │    quota.py     per-user rolling 24h allowances (guests get less)
   └─ SQLAlchemy 2 async ──► PostgreSQL (SQLite locally)
```

## Accounts and sessions

- **Guests.** The first AI action creates a guest user and an opaque session cookie (`HttpOnly`, `SameSite=Lax`, `Secure` in production). Guests have smaller quotas and one classroom.
- **Signup** upgrades the guest row in place, so nothing is lost. **Login** from a guest session moves the guest's conversations and classrooms into the account.
- Sessions are random tokens. Only an HMAC of each token is stored, so sessions are revocable (logout, password change).
- Passwords are hashed with Argon2. CSRF protection: every state-changing `/api` request must carry `X-Requested-With: mahaguru`, which browsers cannot send cross-site without a CORS preflight.
- Account deletion cascades to all of the user's data.

## LLM layer (`services/llm`)

- `LLMProvider.complete()` and `.stream()` with a shared concurrency limit, bounded retries on 429/5xx, and friendly user-facing errors (rate limit, bad key, missing model, timeout).
- `generate_structured(schema)`: JSON mode, plus the JSON Schema in the prompt, plus Pydantic validation, plus **one repair round** that feeds the validation error back. All Classroom outputs and StudentGPT state updates go through it, and nothing is saved unless it validates.
- Two model roles: `LLM_MODEL` (conversation, teaching, curriculum) and `LLM_FAST_MODEL` (state updates, grading, quizzes, intake).

## StudentGPT turn pipeline

1. **Safety screen** (`safety.py`): deterministic, high-recall patterns in English and Hinglish → `crisis` / `elevated` / `none`. Risk flagged by the model on the previous exchange carries over.
2. **Prompt** (`prompts.py`): the mentor philosophy; the student's profile; the private *understanding record* (presenting concern, context, reasons explored, beliefs, emotions, open threads, insights, next focus, stage); and **two reference dialogues** retrieved by BM25 from the curated dataset (`exemplars.py`, no API calls). Crisis or elevated modes append a protocol.
3. **Stream** the reply over SSE. Generation runs in a detached task, so the reply is saved even if the browser disconnects. If the model fails during a crisis turn, a fixed safety message with helplines is sent instead.
4. **Update the record** with the fast model (structured), including the model's own risk assessment. Failures here are logged and never break the chat.
5. **Clarity summary** (on request, after at least 3 student messages): what they came with, what sits underneath, insights in their words, assumptions to test, questions to sit with, an optional small next step, and an optional learning goal that links into Classroom.

Safety events record the level and category, never the message text.

## Classroom

| Responsibility | Implementation |
|---|---|
| Main teacher | The only conversational agent: a streamed chat per lesson with the learner context (goal, intake answers, profile, weak concepts, progress, lesson excerpt). |
| Learning assessment | LLM-generated diagnostic (around 6 items, easy to hard, one concept each). MCQs are graded deterministically; short answers are graded by LLM against a rubric in one batch. Answer keys never reach the browser. |
| Curriculum planning | Structured roadmap: 3–6 modules × 2–5 lessons with objectives, concepts, durations and milestones, plus a learner profile. Versioned in `cr_roadmap_revisions`. |
| Teaching | Lesson content generated on first open and cached: hook, explanation, worked example, common mistakes, self-check, takeaways. |
| Practice and assessment | Per-lesson quizzes (weak concepts prioritised) and module projects graded against a rubric (points capped server-side). |
| Resources | The model may only suggest links on an allowlist of trusted domains; every link is fetched and dropped if unreachable. |
| Progress tracking | Plain code: lesson status, per-concept mastery (exponential moving average), percentage done, time remaining, milestones, next lesson. |
| Adaptation | Rules: quiz ≥ 70% completes the lesson; below that, the lesson is marked *needs review* and a targeted re-explanation is generated, and review lessons are recommended next. The student can request a roadmap revision, which is shown as a proposal; completed lessons are always kept. |

## Data model (main tables)

`users`, `auth_sessions`, `usage_events` · `sg_conversations` (with `state` JSON and `clarity` JSON), `sg_messages`, `safety_events` · `classrooms`, `cr_modules`, `cr_lessons`, `cr_assessments` (items with keys, responses, results), `cr_assignments`, `cr_mastery`, `cr_teacher_messages`, `cr_roadmap_revisions`.

## API (all under `/api`)

| Area | Endpoints |
|---|---|
| Auth | `GET auth/session` · `POST auth/guest` · `POST auth/signup` · `POST auth/login` · `POST auth/logout` · `PATCH auth/me` · `POST auth/password` · `DELETE auth/me` |
| StudentGPT | `GET/POST studentgpt/conversations` · `GET/PATCH/DELETE studentgpt/conversations/{id}` · `POST …/{id}/messages` (SSE) · `POST …/{id}/clarity` |
| Classroom | `GET/POST classroom/classrooms` · `GET/DELETE …/{id}` · `POST …/{id}/intake` · `POST …/{id}/assessments/{aid}/submit` · `GET …/{id}/lessons/{lid}` · `POST …/lessons/{lid}/generate`, `/quiz`, `/complete` · `POST …/{id}/teacher` (SSE) · `POST …/modules/{mid}/assignment` · `POST …/assignments/{aid}/submit` · `POST …/{id}/revisions` · `POST …/revisions/{rid}/apply`, `/discard` |
| Other | `GET dashboard` · `GET health` |

Interactive docs are at `/api/docs` outside production.
