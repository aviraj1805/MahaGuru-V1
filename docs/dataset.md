# StudentGPT dataset

## How the data is used

StudentGPT runs on a hosted model, guided by a detailed philosophy prompt. The dataset is **not** used for fine-tuning in V1. It does two jobs:

1. **Style reference at runtime.** For every reply, the two most relevant dialogues are retrieved (BM25 over domain, summary and student text) and shown to the model as examples of the questioning approach, never as content to copy.
2. **Evaluation.** Scenarios in `data/studentgpt/eval/` drive simulated conversations that are scored against the philosophy (see [evaluation](evaluation.md)).

That makes **quality and coverage** matter far more than volume: 40 excellent dialogues are a better reference than 400 inconsistent ones.

## Audit of the original MahaGuru dataset

The original `CONVERSATIONS.json` contains **86 conversations** (705 messages, 348 mentor turns), with two inconsistent schemas (`message` vs `text`, `intro` vs `student_intro`) and 38 domain labels written in different styles. Its strengths are real Indian-student situations and strong openings that ask why. Problems found:

- **Premature verdicts and lectures** later in conversations (for example declaring a concept "completely fake").
- **Religious, gendered and family-duty framing** ("you're a son…") that the product should not impose.
- **Unsafe handling of distress.** One student describing months of numbness and self-hatred is pressed with "results don't lie… drop the defense", and is never pointed to professional help.
- Mentor turns averaging around 100 words; many end without a question.

Because of this it is **not suitable for fine-tuning as-is**, and it is **not committed** to this public repository, since it may contain personal stories. `scripts/build_dataset.py --legacy path/to/CONVERSATIONS.json` can still include its **question-led opening exchanges** (a curation filter keeps 40 of 86 openings that ask questions, are under 120 words and contain no preachy phrasing) if the owner decides to.

## Dataset v2 (in this repo)

`data/studentgpt/authored/*.json`: **39 hand-written dialogues, 426 messages**, covering 29 situations: career confusion, branch switching, family expectations, government jobs vs startups, MBA, gap year, AI anxiety, placements, procrastination, perfectionism, comparison, backlogs, exam anxiety, motivation, imposter syndrome, burnout, first-generation students, phone and gaming overuse, breakups, loneliness, friendship conflict, self-confidence, compulsive habits, money pressure, decision paralysis, **advice-seeking** (how to respond to "just tell me what to do"), **elevated distress** (taking symptoms seriously and pointing to support), **crisis** (the safety protocol) and emotional overwhelm. Three are in Hinglish.

Every dialogue is validated by `scripts/build_dataset.py`: alternating roles starting with the student, mentor turns of at most 140 words, at least 70% of mentor turns asking a question (except crisis), and a blocklist of preachy phrasing. The script builds `apps/api/app/services/studentgpt/data/exemplars.jsonl`, and CI fails if the library is stale.

Schema:

```json
{"id": "car-001", "domain": "Career confusion", "archetype": "...", "summary": "surface problem; root underneath",
 "language": "en|hinglish", "turns": [{"role": "student|mentor", "text": "..."}]}
```

## Growing the dataset

`scripts/generate_dialogues.py --count 20` (needs a real API key) writes dialogues across a 20-topic × 8-persona grid, rejects any that fail the structural checks, then has an LLM judge reject any scoring below 4/5 on questioning, no premature advice, reaching the root, or naturalness. Survivors land in `data/studentgpt/generated/` for **human review** before you run `build_dataset.py`.

Other options considered: public emotional-support datasets (such as ESConv, or counselling Q&A sets) are licensed for research or non-commercial use, are therapy-oriented rather than reflective-mentoring, and don't match the Indian college context, so they were not used.

## When to revisit fine-tuning

Once real (consented, anonymised) conversations exist and the evaluation suite gives a baseline, a fine-tuned small model can be compared head-to-head on the same scenarios. Adopt it only if it beats the prompted model on the thresholds at lower cost.
