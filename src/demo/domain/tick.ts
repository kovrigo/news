import { expireLocks, resolveCheck } from './edit.ts';
import type { State } from './types.ts';

// Moves time-driven things forward: processing, source checks, edit locks. Returns true when something changed.
export function tick(state: State, now: number): boolean {
  let changed = false;
  for (const story of state.stories) {
    for (const d of story.drafts) {
      if (d.state === 'preparing' && d.readyAt !== undefined && d.readyAt <= now) {
        d.failure = undefined;
        Object.assign(d, d.prepared);
        d.prepared = undefined;
        d.readyAt = undefined;
        changed = true;
      }
      for (const s of d.sentences)
        if (s.checkingUntil !== undefined && s.checkingUntil <= now) {
          resolveCheck(story, s);
          changed = true;
        }
    }
    if (expireLocks(story, now)) changed = true;
  }
  return changed;
}
