import type { ListView, StoryView, DraftView } from '../domain/view.ts';

export type { ListView, StoryView, DraftView };
export type Account = { id: string; name: string; role: string; roleLabel: string; canApprove: boolean; enabled: boolean };

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Network failures are reported here so the screen can show the offline band.
const listeners = new Set<(online: boolean) => void>();
export const onConnection = (fn: (online: boolean) => void): (() => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const report = (online: boolean): void => listeners.forEach((f) => f(online));
export const unauthorized = new EventTarget();

async function send(method: string, path: string, body?: unknown, keepalive = false): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(path, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json' }, keepalive });
  } catch {
    report(false);
    throw new ApiError(0, 'Нет связи');
  }
  report(true);
  if (res.status === 401 && path !== '/api/session' && path !== '/api/login') unauthorized.dispatchEvent(new Event('expired'));
  if (!res.ok) {
    let msg = 'Ошибка';
    try {
      msg = ((await res.json()) as { error: string }).error;
    } catch {
      /* keep the default */
    }
    throw new ApiError(res.status, msg);
  }
  return res;
}

export const api = async <T>(method: string, path: string, body?: unknown): Promise<T> => (await send(method, path, body)).json() as Promise<T>;
export const fireAndForget = (path: string, body: unknown): void => void send('POST', path, body, true).catch(() => undefined);

export async function download(path: string, body: unknown): Promise<string> {
  const res = await send('POST', path, body);
  const name = decodeURIComponent(res.headers.get('x-file-name') ?? 'file');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return name;
}
