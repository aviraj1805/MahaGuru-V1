import asyncio
import json
from collections.abc import AsyncIterator, Awaitable, Callable

from fastapi.responses import StreamingResponse

Emit = Callable[[str], None]
_background: set[asyncio.Task] = set()


def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def detached(producer: Callable[[Emit], Awaitable[None]]) -> AsyncIterator[str]:
    """Run `producer` as a task that outlives the HTTP connection.

    If the student closes the tab or navigates away mid-reply, the reply still finishes and is
    saved; the client simply stops receiving events.
    """

    async def stream() -> AsyncIterator[str]:
        queue: asyncio.Queue[str | None] = asyncio.Queue()

        async def run() -> None:
            try:
                await producer(queue.put_nowait)
            finally:
                queue.put_nowait(None)

        task = asyncio.create_task(run())
        _background.add(task)
        task.add_done_callback(_background.discard)
        while (item := await queue.get()) is not None:
            yield item

    return stream()


def sse_response(generator: AsyncIterator[str]) -> StreamingResponse:
    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
