import { describe, expect, it } from 'vitest';
import { SseParser } from './sse';

describe('SseParser', () => {
  it('parses events split across arbitrary chunks', () => {
    const p = new SseParser();
    const raw = 'event: token\ndata: {"t":"Hel"}\n\nevent: token\ndata: {"t":"lo"}\n\nevent: done\ndata: {"message_id":"m1"}\n\n';
    const events = [];
    for (let i = 0; i < raw.length; i += 7) events.push(...p.push(raw.slice(i, i + 7)));
    expect(events.map((e) => e.event)).toEqual(['token', 'token', 'done']);
    expect(events.map((e) => e.data.t ?? '').join('')).toBe('Hello');
  });

  it('handles CRLF line endings and non-JSON data', () => {
    const p = new SseParser();
    const events = p.push('event: note\r\ndata: plain text\r\n\r\n');
    expect(events).toEqual([{ event: 'note', data: 'plain text' }]);
  });

  it('keeps an incomplete event buffered', () => {
    const p = new SseParser();
    expect(p.push('event: token\ndata: {"t":"x"}')).toEqual([]);
    expect(p.push('\n\n')).toHaveLength(1);
  });
});
