import { normalize } from '../../core/normalize.ts';
import type { Person, State, Story, TitleItem } from './types.ts';

type Dir = State['directory'];

export function checkTitle(dir: Dir, name: string, position: string): Pick<TitleItem, 'dir' | 'dirExpected'> {
  const n = normalize(name);
  const rows = dir.people.filter((p) => normalize(p.name) === n);
  if (rows.length === 0) return { dir: 'no_name' };
  const p = normalize(position);
  if (rows.some((r) => normalize(r.position) === p)) return { dir: 'ok' };
  return { dir: 'position', dirExpected: rows.map((r) => r.position).join('; ') };
}

export const placeInDir = (dir: Dir, lemma: string): boolean => dir.places.some((t) => normalize(t.name) === normalize(lemma));

// Re-check titles and places of one draft against the directory. Touches marks only.
export function recheckDraft(dir: Dir, story: Story, kind: string): void {
  const d = story.drafts.find((x) => x.kind === kind);
  if (!d) return;
  for (const t of d.titles) Object.assign(t, { dirExpected: undefined }, checkTitle(dir, t.name, t.position));
  for (const s of d.sentences) for (const p of s.places) p.inDir = placeInDir(dir, p.lemma);
  d.dirVersion = dir.version;
}

export const samePerson = (a: Person, b: { name: string; position: string }): boolean =>
  normalize(a.name) === normalize(b.name) && normalize(a.position) === normalize(b.position);
