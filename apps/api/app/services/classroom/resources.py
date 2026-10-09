"""Learning resources: only trusted domains, and every link is checked before a student sees it."""

import asyncio
import logging
from urllib.parse import urlparse

import httpx

from app.core.config import get_settings
from app.services.classroom.schemas import ResourceSuggestion

log = logging.getLogger("mahaguru.resources")

TRUSTED_DOMAINS = {
    # Official documentation
    "docs.python.org",
    "python.org",
    "developer.mozilla.org",
    "react.dev",
    "nodejs.org",
    "typescriptlang.org",
    "scikit-learn.org",
    "pytorch.org",
    "tensorflow.org",
    "numpy.org",
    "pandas.pydata.org",
    "matplotlib.org",
    "docs.djangoproject.com",
    "fastapi.tiangolo.com",
    "flask.palletsprojects.com",
    "git-scm.com",
    "docs.github.com",
    "kubernetes.io",
    "docker.com",
    "postgresql.org",
    "sqlite.org",
    "learn.microsoft.com",
    "developer.android.com",
    "developer.apple.com",
    "go.dev",
    "rust-lang.org",
    "doc.rust-lang.org",
    "kotlinlang.org",
    "docs.oracle.com",
    "cppreference.com",
    "en.cppreference.com",
    "w3.org",
    "web.dev",
    "huggingface.co",
    "jupyter.org",
    "figma.com",
    "help.figma.com",
    "arduino.cc",
    "docs.arduino.cc",
    "raspberrypi.com",
    "aws.amazon.com",
    "cloud.google.com",
    # Learning platforms and references
    "khanacademy.org",
    "freecodecamp.org",
    "cs50.harvard.edu",
    "ocw.mit.edu",
    "roadmap.sh",
    "en.wikipedia.org",
    "coursera.org",
    "edx.org",
    "kaggle.com",
    "leetcode.com",
    "geeksforgeeks.org",
    "w3schools.com",
    "developers.google.com",
    "nptel.ac.in",
    "swayam.gov.in",
    "fast.ai",
    "course.fast.ai",
    "d2l.ai",
    "deeplearning.ai",
    "mathsisfun.com",
    "betterexplained.com",
    "3blue1brown.com",
    "exercism.org",
    "theodinproject.com",
    "javascript.info",
    "learngitbranching.js.org",
    "sqlbolt.com",
    "regexone.com",
}


def is_trusted(url: str) -> bool:
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    if parsed.scheme != "https" or not parsed.hostname:
        return False
    host = parsed.hostname.lower().removeprefix("www.")
    return any(host == d or host.endswith("." + d) for d in TRUSTED_DOMAINS)


async def _reachable(client: httpx.AsyncClient, url: str) -> bool:
    try:
        response = await client.head(url)
        if response.status_code in (403, 405) or response.status_code >= 500:
            response = await client.get(url)
        return response.status_code < 400
    except httpx.HTTPError:
        return False


async def verify_resources(suggestions: list[ResourceSuggestion]) -> list[dict]:
    """Keep trusted, reachable, de-duplicated links (max 4)."""
    seen: set[str] = set()
    candidates = []
    for s in suggestions:
        url = s.url.strip()
        if url in seen or not is_trusted(url):
            continue
        seen.add(url)
        candidates.append(s)
    candidates = candidates[:6]
    if get_settings().validate_resource_links and candidates:
        async with httpx.AsyncClient(
            timeout=6.0,
            follow_redirects=True,
            headers={"user-agent": "MahaGuruLinkCheck/1.0 (+https://github.com)"},
        ) as client:
            ok = await asyncio.gather(*(_reachable(client, c.url) for c in candidates))
        dropped = [c.url for c, good in zip(candidates, ok, strict=True) if not good]
        if dropped:
            log.info("Dropped unreachable resources: %s", dropped)
        candidates = [c for c, good in zip(candidates, ok, strict=True) if good]
    return [c.model_dump() for c in candidates[:4]]
