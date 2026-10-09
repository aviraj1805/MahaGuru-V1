import { API_HEADERS, ApiError, parseError } from './api';

export type SseEvent = { event: string; data: any };

/** Incremental parser for `text/event-stream` bodies (handles chunks split anywhere). */
export class SseParser {
  private buffer = '';

  push(chunk: string): SseEvent[] {
    this.buffer += chunk.replace(/\r\n/g, '\n');
    const out: SseEvent[] = [];
    let idx: number;
    while ((idx = this.buffer.indexOf('\n\n')) !== -1) {
      const block = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 2);
      let event = 'message';
      const data: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
      }
      if (data.length) {
        try {
          out.push({ event, data: JSON.parse(data.join('\n')) });
        } catch {
          out.push({ event, data: data.join('\n') });
        }
      }
    }
    return out;
  }
}

/** POST a JSON body and dispatch server-sent events until the stream closes. */
export async function postStream(
  path: string,
  body: unknown,
  onEvent: (e: SseEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: { ...API_HEADERS, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'network', 'Could not reach MahaGuru. Check your connection and try again.');
  }
  if (!res.ok || !res.body) throw await parseError(res);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parser = new SseParser();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    for (const ev of parser.push(decoder.decode(value, { stream: true }))) onEvent(ev);
  }
  for (const ev of parser.push(decoder.decode() + '\n\n')) onEvent(ev);
}
