import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/demo/api.ts';
import type { State, Story } from '../src/demo/domain/types.ts';
import { buildSeed } from '../src/demo/seed.ts';
import { saveState, loadState } from '../src/demo/state.ts';

export const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);
export const OLGA = 'u-olga';
export const PAVEL = 'u-pavel';
export const ANNA = 'u-anna';

let seed: string | undefined;

export type Env = {
  clock: { now: number };
  path: string;
  call: (user: string | null, method: string, path: string, body?: unknown) => Promise<{ status: number; json: any; res: Response }>;
  state: () => State;
  story: (part: string) => Story;
  advance: (ms: number) => void;
};

export async function env(): Promise<Env> {
  seed ??= JSON.stringify(await buildSeed(NOW));
  const path = join(mkdtempSync(join(tmpdir(), 'demo-')), 'state.json');
  saveState(path, JSON.parse(seed));
  const clock = { now: NOW };
  const app = createApp({ statePath: path, now: () => clock.now });
  return {
    clock,
    path,
    advance: (ms) => void (clock.now += ms),
    state: () => loadState(path),
    story: (part) => loadState(path).stories.find((s) => s.title.includes(part))!,
    async call(user, method, p, body) {
      const raw = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
      const res = await app.fetch(
        new Request(`http://127.0.0.1${p}`, {
          method,
          body: raw,
          headers: { ...(user ? { cookie: `demo_user=${user}` } : {}), 'content-type': 'application/json' },
        }),
      );
      const text = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
      return { status: res.status, json: text, res };
    },
  };
}

export const draftOf = (s: Story, kind: string) => s.drafts.find((d) => d.kind === kind)!;
export const key = (): string => crypto.randomUUID();
