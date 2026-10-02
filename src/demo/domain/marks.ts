import { NO_SOURCE_REASONS, SENTENCE_FLAGS } from '../../core/failures.ts';
import { MARK_LABELS, E } from '../texts.ts';
import type { Decision, Draft, Story } from './types.ts';

export type MarkKind = keyof typeof MARK_LABELS;
export type Mark = {
  key: string;
  kind: MarkKind;
  label: string;
  text: string;
  actions: string[];
  target: { sentenceId?: string; factIndex?: number; itemId?: string; segmentId?: string; flagId?: string; refs?: string[] };
  decision?: Decision;
  pending: boolean;
};

// Marks are derived from the draft, the transcript and the stored directory results; only decisions are stored.
export function computeMarks(d: Draft, story: Story): Mark[] {
  const marks: Mark[] = [];
  const add = (m: Omit<Mark, 'label' | 'decision' | 'pending'>): void => {
    const decision = d.decisions[m.key];
    marks.push({ ...m, label: MARK_LABELS[m.kind], decision, pending: !decision });
  };
  const noSourceText = (t: string, reason: keyof typeof NO_SOURCE_REASONS): string => `${t}. ${NO_SOURCE_REASONS[reason]}`;

  if (d.kind === 'transcript') {
    for (const s of story.segments) {
      if (s.flags.includes('unclear')) add({ key: `seg:${s.id}:unclear`, kind: 'unclear', text: s.text, actions: ['write', 'keep'], target: { segmentId: s.id } });
      if (s.flags.includes('not_russian')) add({ key: `seg:${s.id}:ru`, kind: 'not_russian', text: s.text, actions: ['checked'], target: { segmentId: s.id } });
    }
  }
  for (const s of d.sentences) {
    if (s.checkingUntil) continue;
    if (s.checkFailed) {
      add({ key: `unver:${s.id}`, kind: 'unverifiable', text: s.text, actions: ['recheck', 'source'], target: { sentenceId: s.id } });
      continue;
    }
    s.facts.forEach((f, i) => {
      if (f.link.status === 'no_source')
        add({ key: `nosrc:${s.id}:${i}`, kind: 'no_source', text: noSourceText(f.text, f.link.reason), actions: ['remove', 'take', 'source'], target: { sentenceId: s.id, factIndex: i } });
    });
    if (s.flags.length > 0 && s.facts.every((f) => f.link.status === 'linked'))
      add({ key: `flag:${s.id}`, kind: 'sentence_flag', text: s.flags.map((f) => SENTENCE_FLAGS[f]).join('. '), actions: ['remove', 'take'], target: { sentenceId: s.id } });
    for (const p of s.places)
      if (!p.inDir) add({ key: `place:${s.id}:${p.lemma}`, kind: 'place', text: p.surface, actions: ['confirm', 'fix', 'add_dir'], target: { sentenceId: s.id } });
  }
  for (const t of d.titles) {
    const target = { itemId: t.id };
    if (t.link.status === 'no_source')
      add({ key: `tnosrc:${t.id}`, kind: 'title_no_source', text: noSourceText(`${t.name}, ${t.position}`, t.link.reason), actions: ['remove', 'take', 'source'], target });
    if (t.dir === 'no_name') add({ key: `tname:${t.id}`, kind: 'title_name', text: `${t.name}, ${t.position}`, actions: ['confirm', 'fix', 'add_dir'], target });
    if (t.dir === 'position')
      add({ key: `tpos:${t.id}`, kind: 'title_position', text: `${t.name}: в справочнике «${t.dirExpected}»`, actions: ['confirm', 'fix', 'add_dir'], target });
  }
  for (const f of d.flags) {
    if (f.kind === 'conflict') {
      const s = f.sentenceId ? d.sentences.find((x) => x.id === f.sentenceId) : undefined;
      if (f.sentenceId && (!s || s.text !== f.sentenceText)) continue; // rewritten or removed: resolved
      add({ key: `conflict:${f.id}`, kind: 'conflict', text: f.note, actions: ['pick', 'rewrite'], target: { flagId: f.id, sentenceId: f.sentenceId, refs: f.refs } });
    }
    if (f.kind === 'insufficient' && (d.state === 'not_built' || d.decisions['insufficient']))
      add({ key: 'insufficient', kind: 'insufficient', text: f.note ? `Не хватает: ${f.note}` : E.notBuiltBlock, actions: ['accept', 'write'], target: { flagId: f.id } });
  }
  return marks;
}

export const pendingCount = (d: Draft, story: Story): number => computeMarks(d, story).filter((m) => m.pending).length;

export function dropDecisions(d: Draft, id: string): void {
  for (const k of Object.keys(d.decisions)) if (k.split(':')[1] === id) delete d.decisions[k];
}
