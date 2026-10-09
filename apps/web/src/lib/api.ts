/** Thin fetch wrapper: same-origin cookies, CSRF header, typed errors. */

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

export const API_HEADERS = { 'X-Requested-With': 'mahaguru' };

async function parseError(res: Response): Promise<ApiError> {
  try {
    const body = await res.json();
    const err = body?.error;
    if (err?.message) return new ApiError(res.status, err.code ?? 'error', err.message);
  } catch {
    /* not JSON */
  }
  if (res.status >= 500)
    return new ApiError(res.status, 'server_error', 'Our server had a problem. Please try again.');
  return new ApiError(res.status, 'error', `Request failed (${res.status}).`);
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
      credentials: 'include',
      headers: {
        ...API_HEADERS,
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'network', 'Could not reach MahaGuru. Check your connection and try again.');
  }
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong.';
}

export { parseError };
