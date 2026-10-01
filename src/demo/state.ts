import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { State } from './domain/types.ts';

export const statePath = (): string => process.env.DEMO_STATE ?? 'out/demo/state.json';
export const NO_STATE = 'Состояние демо не создано. Выполните: bun run demo-reset';

export const stateExists = (path: string): boolean => existsSync(path);
export const loadState = (path: string): State => JSON.parse(readFileSync(path, 'utf8')) as State;

// Atomic: write a temporary file next to the state, then rename it over.
export function saveState(path: string, state: State): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(state));
  renameSync(tmp, path);
}
