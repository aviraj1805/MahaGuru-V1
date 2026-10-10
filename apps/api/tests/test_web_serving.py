import re
from pathlib import Path

import httpx
from fastapi import FastAPI

from app.main import _mount_web

APP_TSX = Path(__file__).resolve().parents[2] / "web" / "src" / "App.tsx"


def _client_routes() -> list[str]:
    paths = re.findall(r'path="([^"]+)"', APP_TSX.read_text(encoding="utf-8"))
    assert len(paths) > 10, "routes not found in App.tsx"
    return [p for p in paths if p != "*"]


async def test_client_routes_are_200_and_unknown_paths_are_real_404s(tmp_path):
    (tmp_path / "index.html").write_text("<html>app</html>")
    (tmp_path / "favicon.svg").write_text("<svg/>")
    app = FastAPI()
    _mount_web(app, tmp_path)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        # Every route in App.tsx must be known to the server (keeps the two lists in sync).
        for route in _client_routes():
            url = re.sub(r":\w+", "3f2b9c1e-0000-4000-8000-000000000000", route)
            r = await c.get(url)
            assert r.status_code == 200 and "app" in r.text, url
        assert (await c.get("/learn/new/")).status_code == 200
        assert (await c.get("/favicon.svg")).status_code == 200

        missing = await c.get("/no-such-page")
        assert missing.status_code == 404 and "app" in missing.text  # still shows the 404 page
        assert (await c.get("/learn/x/lesson/y/extra")).status_code == 404
        assert (await c.get("/api/nope")).json()["error"]["code"] == "not_found"
