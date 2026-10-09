"""Deterministic offline provider for automated tests and keyless local UI work.

It is refused in production by Settings validation, and the UI shows a "demo mode" banner
whenever it is active. Outputs are schema-valid but intentionally generic.
"""

import asyncio
import json
import re
from collections.abc import AsyncIterator

from app.services.llm.base import ChatMessage, LLMError, LLMProvider, LLMResult, Usage


def _payload(messages: list[ChatMessage]) -> object:
    text = messages[0].content.split("\n\nRespond with ONLY", 1)[0] if messages else ""
    try:
        return json.loads(text)
    except ValueError:
        return text


def _words(text: str, n: int = 6) -> str:
    return " ".join(re.findall(r"[\w'-]+", text)[:n])


class FakeProvider(LLMProvider):
    name = "fake"

    def __init__(self, delay: float = 0.0):
        super().__init__(max_concurrency=8)
        self.delay = delay
        self.calls: list[str] = []
        self.fail_tasks: set[str] = set()

    # ------------------------------------------------------------------ text
    def _reply(self, system: str, messages: list[ChatMessage], task: str) -> str:
        last = messages[-1].content if messages else ""
        if task == "studentgpt_reply":
            if "SAFETY MODE" in system:
                return (
                    "Thank you for telling me this. It sounds really heavy right now. Are you safe "
                    "at the moment? Please call Tele-MANAS on 14416 (free, 24x7) or 112 if you "
                    "are in danger. I'm here with you."
                )
            turn = sum(1 for m in messages if m.role == "user")
            echo = _words(last, 8)
            if turn == 1:
                return (
                    f'It sounds like "{echo}" has been sitting with you for a while. Before we '
                    "look for answers, what makes this feel so pressing for you right now?"
                )
            return (
                f'When you say "{echo}", I notice there\'s something important underneath it. '
                "What do you think you're most afraid would happen if that stayed the same?"
            )
        if task == "classroom_teacher":
            return (
                f'Good question about "{_words(last, 8)}". Let\'s take it step by step.\n\n'
                "1. Start with the core idea in plain words.\n2. Look at a small example.\n"
                "3. Check it yourself.\n\nWhich of these steps feels least clear to you?"
            )
        return "OK."

    # ------------------------------------------------------------------ json
    def _json(self, task: str, messages: list[ChatMessage]) -> dict:
        data = _payload(messages)
        d = data if isinstance(data, dict) else {}
        if task == "studentgpt_state":
            student = ""
            text = messages[0].content
            m = re.search(r"Latest student message:\n(.*?)\n\nLatest mentor reply", text, re.S)
            if m:
                student = m.group(1)
            risky = bool(re.search(r"\b(die|suicid|kill myself)\w*", student, re.I))
            return {
                "title": (_words(student, 5) or "Reflection").capitalize(),
                "stage": "exploring",
                "presenting_concern": student[:120],
                "context": [],
                "reasons_explored": [],
                "beliefs_and_assumptions": [],
                "emotions": ["confused"],
                "open_threads": ["what is underneath this"],
                "insights": [],
                "next_focus": "the fear underneath",
                "wants_advice": False,
                "risk_level": "crisis" if risky else "none",
                "risk_category": "suicide_self_harm" if risky else None,
            }
        if task == "studentgpt_clarity":
            return {
                "came_with": "You came in feeling unsure about which direction to take.",
                "underneath": "Underneath, it seems to be about wanting your choice to feel like "
                "your own, not borrowed from others.",
                "insights": [
                    "I've been measuring myself against other people's timelines.",
                    "I enjoy building things more than I enjoy the idea of a title.",
                ],
                "assumptions_to_question": ["That one wrong choice now ruins everything."],
                "questions_to_sit_with": [
                    "What would I try if no one were watching?",
                    "Which part of this fear is mine, and which part did I inherit?",
                ],
                "next_step": "Spend one weekend building a tiny project and notice how it feels.",
                "learning_goal": "Learn the basics of web development by building a small project",
            }
        if task == "classroom_intake":
            goal = d.get("goal", "your goal")
            return {
                "title": f"Learning: {_words(goal, 6)}"[:60],
                "goal_restated": f"You want to {goal.rstrip('.')}.",
                "questions": [
                    {
                        "id": "experience",
                        "question": "How much experience do you have with this?",
                        "options": ["None yet", "A little", "Some projects", "Quite a lot"],
                        "allow_free_text": True,
                    },
                    {
                        "id": "outcome",
                        "question": "What do you want at the end?",
                        "options": ["A job/internship", "A project", "Exam/marks", "Curiosity"],
                        "allow_free_text": True,
                    },
                    {
                        "id": "time",
                        "question": "How many hours a week can you give this?",
                        "options": ["2-4", "5-8", "9-15", "15+"],
                        "allow_free_text": False,
                    },
                ],
            }
        if task in ("classroom_diagnostic", "classroom_quiz"):
            concepts = ["foundations", "core idea", "application"]
            items = []
            for i in range(5):
                c = concepts[i % 3]
                if i == 4:
                    items.append(
                        {
                            "id": f"i{i + 1}",
                            "type": "short",
                            "question": f"In your own words, explain the {c} and when you'd use it.",
                            "rubric": f"Mentions what the {c} is and one situation for using it.",
                            "explanation": f"The {c} matters because it underpins the next steps.",
                            "concept": c,
                            "difficulty": "hard",
                        }
                    )
                else:
                    items.append(
                        {
                            "id": f"i{i + 1}",
                            "type": "mcq",
                            "question": f"Question {i + 1}: which statement about the {c} is true?",
                            "options": ["Statement A", "Statement B", "Statement C", "Statement D"],
                            "answer_index": i % 4,
                            "explanation": f"Statement {'ABCD'[i % 4]} describes the {c} correctly.",
                            "concept": c,
                            "difficulty": ["easy", "easy", "medium", "medium"][i],
                        }
                    )
            return {"items": items}
        if task == "classroom_grade":
            rows = data if isinstance(data, list) else []
            return {
                "grades": [
                    {
                        "id": r["id"],
                        "score": 0.8 if len(str(r.get("answer", ""))) >= 15 else 0.3,
                        "feedback": "Good start: you named the key idea."
                        if len(str(r.get("answer", ""))) >= 15
                        else "Try to explain what it is and when you would use it.",
                    }
                    for r in rows
                ]
            }
        if task in ("classroom_roadmap", "classroom_revision"):
            modules = [
                {
                    "title": f"Module {m + 1}: {['Foundations', 'Core skills', 'Build a project'][m]}",
                    "summary": "What this module covers and why it comes now.",
                    "milestone": ["Explain the basics", "Solve typical problems", "Ship a project"][
                        m
                    ],
                    "lessons": [
                        {
                            "title": f"Lesson {m + 1}.{lesson + 1}",
                            "objectives": ["Understand the idea", "Apply it to an example"],
                            "concepts": [["foundations", "core idea", "application"][m]],
                            "est_minutes": 30,
                        }
                        for lesson in range(2)
                    ],
                }
                for m in range(3)
            ]
            if task == "classroom_revision":
                return {
                    "change_summary": "Adjusted the remaining plan to your new focus.",
                    "modules": modules[1:],
                }
            return {
                "summary": "Start from the foundations, build core skills, then ship a project.",
                "profile": {
                    "level": "beginner",
                    "summary": "You are new to this and want practical results.",
                    "strengths": ["motivation"],
                    "gaps": ["foundations"],
                },
                "modules": modules,
            }
        if task == "classroom_lesson":
            title = (d.get("lesson") or {}).get("title", "This lesson")
            return {
                "content_md": f"### Why this matters\n{title} is a building block for your goal.\n\n"
                "### The idea\nExplained step by step.\n\n### Worked example\n```python\n"
                "print('hello')\n```\n\n### Common mistakes\n- Skipping the basics\n\n"
                "### Self-check\n1. Can you explain it to a friend?",
                "key_takeaways": ["Know the idea", "Try an example", "Check yourself"],
                "resources": [
                    {
                        "title": "The Python Tutorial",
                        "url": "https://docs.python.org/3/tutorial/",
                        "kind": "docs",
                        "why": "Official, clear and free.",
                    },
                    {
                        "title": "Made-up link",
                        "url": "https://example.com/not-trusted",
                        "kind": "article",
                        "why": "Should be filtered out.",
                    },
                ],
            }
        if task == "classroom_remedial":
            return {"content_md": "### Let's try another angle\nA simpler example helps here."}
        if task == "classroom_assignment":
            return {
                "brief_md": "### Mini project\nBuild a small thing that uses what you learned.",
                "deliverables": ["A short write-up", "A link to your work"],
                "rubric": [
                    {"criterion": "Correctness", "description": "It works", "points": 5},
                    {"criterion": "Explanation", "description": "Clear reasoning", "points": 5},
                ],
            }
        if task == "classroom_assignment_grade":
            return {
                "scores": [
                    {"criterion": "Correctness", "points_awarded": 4, "comment": "Works well."},
                    {"criterion": "Explanation", "points_awarded": 3, "comment": "Add detail."},
                ],
                "overall_feedback_md": "Solid work. Explain your design choices a bit more.",
                "next_improvements": ["Add tests", "Explain trade-offs"],
            }
        if task == "eval_student":
            return {"message": "I guess it is because I worry what people will think of me."}
        if task == "eval_judge":
            return {
                "builds_on_previous": 4,
                "root_cause_depth": 4,
                "no_premature_advice": 5,
                "warmth": 4,
                "language_match": 5,
                "safety": 5,
                "overall": 4,
                "notes": "Fake judgement for harness dry runs.",
            }
        raise LLMError(f"FakeProvider has no fixture for task {task}")

    # ------------------------------------------------------------------ provider API
    async def _complete(self, *, system, messages, model, temperature, max_tokens, json_mode, task):
        self.calls.append(task)
        if task in self.fail_tasks:
            raise LLMError(f"forced failure for {task}")
        if self.delay:
            await asyncio.sleep(self.delay)
        text = (
            json.dumps(self._json(task, messages))
            if json_mode
            else self._reply(system, messages, task)
        )
        return LLMResult(text=text, usage=Usage(model="fake", input_tokens=10, output_tokens=20))

    async def _stream(
        self, *, system, messages, model, temperature, max_tokens, task, usage
    ) -> AsyncIterator[str]:
        self.calls.append(task)
        if task in self.fail_tasks:
            raise LLMError(f"forced failure for {task}")
        usage.model, usage.input_tokens = "fake", 10
        text = self._reply(system, messages, task)
        for word in re.findall(r"\S+\s*", text):
            if self.delay:
                await asyncio.sleep(self.delay / 10)
            usage.output_tokens += 1
            yield word
