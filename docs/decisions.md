# Decisions

Changes from the approved Phase 0 plan are marked **(changed)**.

1. **Fresh codebase.** Nothing was copied from the earlier MahaGuru or StudentGPT repositories. They are unchanged. Ideas carried over: the bilingual "नमस्ते" homepage with a mode toggle, the clarify-before-planning Refiner concept (now Classroom intake), and the StudentGPT starter prompts.
2. **Hosted LLM instead of the fine-tuned model.** The fine-tuned weights and training code were not available, the original dataset conflicts with the product's own philosophy in places (see [dataset](dataset.md)), and the owner chose the free tier. StudentGPT's behaviour comes from a strong prompt, an explicit conversation record, retrieved reference dialogues and evaluation.
3. **Gemini by default, behind an abstraction.** It's free through AI Studio. Swapping to Groq, OpenRouter or Ollama is configuration only, and model names are configuration because free models are retired regularly.
4. **(changed) Self-hosted auth instead of Supabase Auth.** For an open-source project that anyone should be able to clone and run, auth that needs no external account wins. Cookie sessions with Argon2 hashing, revocable sessions and guest upgrade were straightforward. Trade-off: no email verification or password-reset email yet (both need an email provider); signed-in users can change their password.
5. **(changed) Single-service deployment.** FastAPI serves the built SPA, so there's one free service, same-origin cookies and no CORS.
6. **One teaching agent, not seven.** Only the Classroom teacher converses. Assessment, curriculum, lessons, quizzes and grading are focused structured LLM functions; progress, mastery and adaptation are plain code. That is cheaper, testable and predictable.
7. **SSE instead of WebSockets** for streamed replies: simpler, proxy-friendly, and sufficient for one-way token streams.
8. **Lexical (BM25) retrieval for exemplars** rather than embeddings: there are no extra API calls or services, and it is good enough for ~40–200 short documents.
9. **Resources from a trusted allowlist plus live link checks** rather than open web search in V1: no hallucinated links, and no paid search API. Web search can be added later behind the same function.
10. **SQLite locally, Postgres in production**, with the same migrations. The test suite runs on both in CI.

## Known limitations (V1)

- No email verification or password-reset email (needs an email provider).
- In-process rate limiter for login and signup: correct for a single instance, not for multiple instances.
- Classroom cannot run student code; projects are judged on the student's written submission and links.
- The quality of real-model output is unverified until the evaluation harness runs with an API key.
