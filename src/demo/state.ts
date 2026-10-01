import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { State } from './domain/types.ts';

export const statePath = (): string => process.env.DEMO_STATE ?? 'out/demo/state.json';
export const NO_STATE = 'Состояние демо не создано. Выполните: bun run demo-reset';
// 2 MB: the seed is 50 KB and a story about 18 KB, so this is about 100 more stories or 10 000 journal rows;
// every request reads and writes the whole file, and at this size that stays near 30 ms.
export const STATE_MAX = 2 * 1024 * 1024;
export const STATE_FULL = 'Демо заполнено: файл состояния больше 2 МБ. Удалите лишние сюжеты или выполните: bun run demo-reset';
export const BAD_STATE = 'Файл состояния демо повреждён. Выполните: bun run demo-reset';

export const stateExists = (path: string): boolean => existsSync(path);
export const loadState = (path: string): State => JSON.parse(readFileSync(path, 'utf8')) as State;

// Atomic: write a temporary file next to the state, then rename it over.
// Typed text lives here: only the owner may open the folder and the file, even if they were made wider earlier.
export function saveState(path: string, state: State): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, path);
  } finally {
    rmSync(tmp, { force: true }); // a failed write must not leave typed text in a stray copy
  }
}
