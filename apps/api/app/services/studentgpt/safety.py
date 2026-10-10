"""Deterministic safety screen that runs before every StudentGPT reply.

High recall on purpose: a false positive costs one gentle check-in, a false negative can cost far
more. The model-based assessment in the state update is a second layer, not a replacement.
"""

import re
from dataclasses import dataclass, field
from typing import Literal

Level = Literal["none", "elevated", "crisis"]

# Verify these before every public launch. Sources: Govt. of India Tele-MANAS; TISS iCall.
HELPLINES: list[dict[str, str]] = [
    {
        "name": "Tele-MANAS (Govt. of India, 24x7, free)",
        "contact": "14416 or 1-800-891-4416",
        "href": "tel:14416",
    },
    {
        "name": "iCall (TISS) psychosocial helpline",
        "contact": "9152987821 (Mon-Sat, 10am-8pm)",
        "href": "tel:+919152987821",
    },
    {"name": "Emergency services (India)", "contact": "112", "href": "tel:112"},
    {
        "name": "Outside India",
        "contact": "Find a local helpline at findahelpline.com",
        "href": "https://findahelpline.com",
    },
]

_CRISIS_PATTERNS: dict[str, list[str]] = {
    "suicide_self_harm": [
        r"\bkill(ing)?\s+my\s*self\b",
        r"\bend(ing)?\s+(my|it)\s+(life|all)\b",
        r"\bend\s+it\s+all\b",
        r"\bsuicid(e|al)\b",
        r"\bwant(ed)?\s+to\s+die\b",
        r"\b(don'?t|do\s+not)\s+want\s+to\s+(live|be\s+alive|exist)\b",
        r"\bno\s+(reason|point)\s+(to|in)\s+(live|living|being alive)\b",
        r"\bbetter\s+off\s+(dead|without\s+me)\b",
        r"\b(cut|cutting|hurt|hurting|harm|harming)\s+my\s*self\b",
        r"\bself[-\s]?harm\b",
        r"\btake\s+my\s+(own\s+)?life\b",
        r"\boverdose\b",
        r"\bjump\s+(off|from)\s+(the\s+)?(roof|building|bridge)\b",
        r"\bkhud\s*ku(shi|shee)\b",
        r"\bmar\s+jaa?n[ae]\b",
        r"\bmarna\s+chaht[ai]\b",
        r"\bjeen[ae]\s+ka\s+(mann?|man)\s+nahi\b",
        r"\bjeena\s+nahi\s+chaht[ai]\b",
        r"\bkhatam\s+kar\s+(dun|doon|lun|loon)\b",
    ],
    "harm_to_others": [
        r"\bkill\s+(him|her|them|my\s+(father|mother|dad|mom|brother|sister|teacher))\b",
        r"\bhurt\s+(someone|somebody|people)\b",
    ],
}

_ELEVATED_PATTERNS: dict[str, list[str]] = {
    "hopelessness": [
        r"\bhopeless\b",
        r"\bno\s+hope\b",
        r"\bcan'?t\s+(go\s+on|take\s+(it|this)\s+any\s*more)\b",
        r"\bnothing\s+(matters|will\s+ever\s+change)\b",
        r"\bi'?m\s+(worthless|a\s+burden)\b",
        r"\bbojh\s+hoon\b",
    ],
    "severe_distress": [
        r"\bpanic\s+attacks?\b",
        r"\bhaven'?t\s+(slept|eaten)\s+(in|for)\s+days\b",
        r"\bcan'?t\s+stop\s+crying\b",
        r"\b(severely|really|clinically)\s+depressed\b",
        r"\bdepression\b",
        r"\bbreakdown\b",
    ],
    "abuse": [
        r"\b(he|she|they|my\s+\w+)\s+(hits|beats|abuses)\s+me\b",
        r"\b(sexual(ly)?\s+)?(abused|harass(ed|ment))\b",
    ],
}

_COMPILED = {
    level: {cat: [re.compile(p, re.IGNORECASE) for p in pats] for cat, pats in groups.items()}
    for level, groups in (("crisis", _CRISIS_PATTERNS), ("elevated", _ELEVATED_PATTERNS))
}


@dataclass
class SafetyResult:
    level: Level = "none"
    categories: list[str] = field(default_factory=list)

    @property
    def flagged(self) -> bool:
        return self.level != "none"


def screen(text: str) -> SafetyResult:
    for level in ("crisis", "elevated"):
        hits = [
            cat
            for cat, patterns in _COMPILED[level].items()
            if any(p.search(text) for p in patterns)
        ]
        if hits:
            return SafetyResult(level=level, categories=hits)  # type: ignore[arg-type]
    return SafetyResult()


def combine(rule_level: Level, carried_level: Level) -> Level:
    """Risk carries over from earlier turns; it can be raised by rules, never silently lowered."""
    order = {"none": 0, "elevated": 1, "crisis": 2}
    return rule_level if order[rule_level] >= order[carried_level] else carried_level


# Prompts ask every risk reply to point to help, but models don't always follow them (in testing,
# a fallback model skipped helplines on 3 of 14 crisis turns). These lines guarantee it in code.
_CRISIS_HELP = re.compile(r"14416|tele-?manas|\b112\b", re.IGNORECASE)
_SUPPORT_HELP = re.compile(
    r"14416|tele-?manas|\b112\b|helpline|counsell?(or|ing)|doctor|therapist|psycholog",
    re.IGNORECASE,
)
CRISIS_SAFETY_LINE = (
    "\n\nIf you might be in danger, please call **Tele-MANAS at 14416** (free, 24x7) or **112** "
    "right now. I'm still here with you."
)
ELEVATED_SUPPORT_LINE = (
    "\n\nIf this has been going on for a while, a college counsellor, a doctor or Tele-MANAS "
    "(call **14416**, free, 24x7) can help alongside our conversation."
)
CRISIS_SAFETY_LINE_HINGLISH = (
    "\n\nAgar tumhe lag raha hai ki tum khatre mein ho, toh abhi **Tele-MANAS ko 14416** par call "
    "karo (free, 24x7), ya **112** par. Main yahin hoon, tumhare saath."
)
ELEVATED_SUPPORT_LINE_HINGLISH = (
    "\n\nAgar yeh kaafi samay se chal raha hai, toh college counsellor, doctor ya Tele-MANAS "
    "(**14416** par call karo, free, 24x7) is baatcheet ke saath-saath madad kar sakte hain."
)

# Common Hindi words in Latin script. Two or more, making up a fair share of the message, means
# the student is writing Hinglish; Devanagari means Hindi.
_HINGLISH_WORDS = frozenset(
    "hai hain nahi nahin mujhe mera meri mere kya kyun kyon yaar toh bhi raha rahi rahe ho hoon "
    "gaya gayi lagta lagti sab kuch abhi bahut kaise aur karna karke kar ki ke se mein bas pata "
    "accha acha theek matlab koi kabhi sach".split()
)


def looks_hinglish(text: str) -> bool:
    if re.search(r"[ऀ-ॿ]", text):
        return True
    words = re.findall(r"[a-z]+", text.lower())
    hits = sum(w in _HINGLISH_WORDS for w in words)
    return hits >= 2 and hits >= 0.15 * len(words)


def safety_addendum(
    risk_level: str, reply: str, earlier_replies: list[str], student_message: str = ""
) -> str:
    """A line to add when the model's reply leaves out the route to help, in the student's
    language (English or Hinglish).

    Crisis: every reply must name a helpline. Elevated: support must have been mentioned at
    least once in the recent conversation (repeating it on every turn would feel like a script).
    """
    hinglish = looks_hinglish(student_message)
    if risk_level == "crisis" and not _CRISIS_HELP.search(reply):
        return CRISIS_SAFETY_LINE_HINGLISH if hinglish else CRISIS_SAFETY_LINE
    if risk_level == "elevated" and not any(
        _SUPPORT_HELP.search(r) for r in [reply, *earlier_replies]
    ):
        return ELEVATED_SUPPORT_LINE_HINGLISH if hinglish else ELEVATED_SUPPORT_LINE
    return ""


CRISIS_FALLBACK_REPLY = (
    "I'm really glad you told me this. What you're carrying sounds incredibly heavy, and you "
    "don't have to hold it alone right now.\n\n"
    "Please reach out to someone who can be with you in this moment. In India you can call "
    "**Tele-MANAS at 14416** (free, 24x7), or **112** if you are in immediate danger. If you can, "
    "tell someone you trust nearby (a friend, roommate, or family member) how you're feeling.\n\n"
    "I'm still here with you. Are you safe right now?"
)
