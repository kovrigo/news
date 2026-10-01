import { verifyFact, verifySentence } from '../../core/links.ts';
import { normalize, tokens } from '../../core/normalize.ts';
import { extractNumbers } from '../../core/numbers.ts';
import type { Material } from '../../core/source.ts';
import { E } from '../texts.ts';
import { checkTitle } from './directory.ts';
import { bestQuote, findSource } from './finder.ts';
import { addJournal } from './journal.ts';
import { dropDecisions } from './marks.ts';
import { DemoError, type Ctx, type Draft, type Sentence, type State, type Story } from './types.ts';

export const LOCK_IDLE_MS = 10 * 60_000;
export const LOCK_BEAT_MS = 60_000;
export const CHECK_MS = 1500;
export const SENTENCE_MAX = 300;
export const FIELD_MAX = 120;
const SLOW_WORDS = 40; // a longer sentence fails its first source check, as a slow model would

export type EditOp =
  | { op: 'setText'; sentenceId: string; text: string }
  | { op: 'addSentence'; afterId: string | null; text: string }
  | { op: 'removeSentence'; sentenceId: string }
  | { op: 'setSource'; sentenceId: string; factIndex: number; ref: string }
  | { op: 'removeSync'; itemId: string }
  | { op: 'syncRange'; itemId: string; startMs: number; endMs: number }
  | { op: 'setTitle'; itemId: string; name: string; position: string }
  | { op: 'removeTitle'; itemId: string }
  | { op: 'setTitleSource'; itemId: string; ref: string }
  | { op: 'setSegment'; segmentId: string; text: string };

const materialOf = (story: Story): Material => ({ segments: story.segments, paragraphs: story.paragraphs });
const userName = (state: State, id: string): string => state.users.find((u) => u.id === id)?.name ?? '';

export function lockIsLive(d: Draft, now: number): boolean {
  return !!d.lock && now - d.lock.lastChangeAt <= LOCK_IDLE_MS && now - d.lock.heartbeatAt <= LOCK_BEAT_MS;
}

export function expireLocks(story: Story, now: number): boolean {
  let changed = false;
  for (const d of story.drafts)
    if (d.lock && !lockIsLive(d, now)) {
      d.lock = undefined;
      changed = true;
    }
  return changed;
}

export function acquireLock(state: State, ctx: Ctx, d: Draft, confirmed: boolean): void {
  if (['preparing', 'failed', 'not_needed'].includes(d.state)) throw new DemoError(409, E.notEditable);
  if (lockIsLive(d, ctx.now) && d.lock!.userId !== ctx.user.id) throw new DemoError(423, E.lockedBy(userName(state, d.lock!.userId)));
  if (d.lock && d.lock.userId === ctx.user.id && lockIsLive(d, ctx.now)) {
    d.lock.heartbeatAt = ctx.now;
    return;
  }
  if (d.state === 'approved' && !confirmed) throw new DemoError(409, E.needConfirm);
  d.lock = { userId: ctx.user.id, since: ctx.now, lastChangeAt: ctx.now, heartbeatAt: ctx.now };
}

export function heartbeat(ctx: Ctx, d: Draft): void {
  if (d.lock && d.lock.userId === ctx.user.id) d.lock.heartbeatAt = ctx.now;
}
export function releaseLock(ctx: Ctx, d: Draft): void {
  if (d.lock && d.lock.userId === ctx.user.id) d.lock = undefined;
}

export function toReapprove(d: Draft, reason: string): void {
  d.state = 'reapprove';
  d.reapproveReason = reason;
  d.approval = undefined;
  if (d.exportedAt) d.modifiedAfterExport = true;
}

function bump(state: State, ctx: Ctx, story: Story, d: Draft): void {
  d.version++;
  d.lastEditorId = ctx.user.id;
  d.lastEditAt = ctx.now;
  d.directoryNotice = false;
  if (d.lock) d.lock.lastChangeAt = ctx.now;
  if (d.state === 'approved') toReapprove(d, 'изменили текст');
  if (d.lock && !d.lock.journaled) {
    d.lock.journaled = true;
    addJournal(state, ctx, story, 'edit', { draft: d.kind, detail: `версия ${d.version}` });
  }
}

const clean = (text: string, max: number): string => {
  // control characters would break the DOCX export (invalid in XML)
  const t = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim();
  if (t === '') throw new DemoError(400, E.sentenceEmpty);
  if (t.length > max) throw new DemoError(400, max === SENTENCE_MAX ? E.sentenceLong : E.fieldLong);
  return t;
};

const stripEnd = (t: string): string => t.replace(/[.!?…]+$/u, '');

// The check that follows an edit: the mock finds a source, the core decides whether it holds.
export function resolveCheck(story: Story, s: Sentence): void {
  const material = materialOf(story);
  s.checkingUntil = undefined;
  const slow = tokens(s.text).length > SLOW_WORDS && !s.retry;
  s.retry = false;
  s.checkFailed = slow;
  if (slow) return;
  const text = stripEnd(s.text);
  const source = findSource(text, material);
  const names = [...s.text.matchAll(/\p{L}+/gu)].filter((m, i) => i > 0 && /^\p{Lu}/u.test(m[0]));
  if (!source && extractNumbers(s.text).length === 0 && names.length === 0) {
    s.noFacts = true;
    s.facts = [];
    s.flags = [];
    return;
  }
  s.noFacts = false;
  s.facts = [{ text, source, link: verifyFact({ text, source }, material) }];
  s.flags = verifySentence({ text: s.text, noFacts: false, facts: s.facts, places: s.places }, s.facts.map((f) => f.link));
}

export function startCheck(s: Sentence, now: number, retry = false): void {
  s.facts = [];
  s.flags = [];
  s.checkFailed = false;
  s.retry = retry;
  s.checkingUntil = now + CHECK_MS;
}

export function reverify(story: Story, d: Draft): void {
  const material = materialOf(story);
  for (const s of d.sentences) {
    if (s.checkingUntil || s.checkFailed) continue;
    const links = s.facts.map((f) => verifyFact(f, material));
    s.facts.forEach((f, i) => (f.link = links[i]!));
    s.flags = verifySentence({ text: s.text, noFacts: s.noFacts, facts: s.facts, places: s.places }, links);
  }
  for (const t of d.titles) t.link = verifyFact({ text: `${t.name}, ${t.position}`, source: t.source }, material);
}

// A change of the transcript text or of the speaker names touches the drafts that rest on it.
export function afterTranscriptChange(story: Story, reason: string, kinds: string[]): void {
  for (const d of story.drafts) {
    if (!kinds.includes(d.kind) || d.state === 'preparing') continue;
    if (d.kind !== 'transcript') reverify(story, d);
    if (d.state === 'approved') toReapprove(d, reason);
    d.basedOn = { transcript: story.transcriptVersion, speakers: story.speakersVersion };
  }
}

export function renameSpeaker(state: State, ctx: Ctx, story: Story, videoId: string, speaker: number, name: string): void {
  const key = `${videoId}:${speaker}`;
  if (!story.segments.some((s) => s.videoId === videoId && s.speaker === speaker)) throw new DemoError(400, E.noId);
  const n = clean(name, FIELD_MAX);
  const old = story.speakerNames[key] ?? `Спикер ${speaker}`;
  if (old === n) return;
  story.speakerNames[key] = n;
  story.speakersVersion++;
  const tr = story.drafts.find((d) => d.kind === 'transcript')!;
  tr.version++;
  tr.lastEditorId = ctx.user.id;
  tr.lastEditAt = ctx.now;
  afterTranscriptChange(story, 'изменили имена говорящих', ['transcript', 'syncs', 'titles']);
  addJournal(state, ctx, story, 'rename_speaker', { draft: 'transcript', detail: `${old} → ${n}` });
}

function fragmentText(story: Story, ref: string): string {
  const f = story.segments.find((s) => s.id === ref) ?? story.paragraphs.find((p) => p.id === ref);
  if (!f) throw new DemoError(400, E.noFragment);
  return f.text;
}

// An action outside edit mode (a mark decision, say) takes the lock for its own duration only.
export function editOp(state: State, ctx: Ctx, story: Story, d: Draft, baseVersion: number, op: EditOp): void {
  const had = lockIsLive(d, ctx.now) && d.lock!.userId === ctx.user.id;
  applyOp(state, ctx, story, d, baseVersion, op);
  if (!had) d.lock = undefined;
}

function applyOp(state: State, ctx: Ctx, story: Story, d: Draft, baseVersion: number, op: EditOp): void {
  if (['preparing', 'failed', 'not_needed'].includes(d.state)) throw new DemoError(409, E.notEditable);
  if (lockIsLive(d, ctx.now) && d.lock!.userId !== ctx.user.id) throw new DemoError(423, E.lockedBy(userName(state, d.lock!.userId)));
  if (baseVersion !== d.version) throw new DemoError(409, E.staleVersion);
  if (!lockIsLive(d, ctx.now) || d.lock!.userId !== ctx.user.id) acquireLock(state, ctx, d, false);
  const sentence = (id: string): Sentence => {
    const s = d.sentences.find((x) => x.id === id);
    if (!s) throw new DemoError(400, E.noId);
    return s;
  };
  const item = <T extends { id: string }>(list: T[], id: string): T => {
    const x = list.find((i) => i.id === id);
    if (!x) throw new DemoError(400, E.noId);
    return x;
  };
  switch (op.op) {
    case 'setText': {
      const s = sentence(op.sentenceId);
      const text = clean(op.text, SENTENCE_MAX);
      if (text === s.text) return;
      s.text = text;
      s.places = s.places.filter((p) => normalize(text).includes(normalize(p.surface).slice(0, 4)));
      dropDecisions(d, s.id);
      startCheck(s, ctx.now);
      return bump(state, ctx, story, d);
    }
    case 'addSentence': {
      const text = clean(op.text, SENTENCE_MAX);
      const s: Sentence = { id: `n${++state.seq}`, text, noFacts: true, facts: [], places: [], flags: [] };
      const at = op.afterId === null ? 0 : d.sentences.findIndex((x) => x.id === op.afterId) + 1;
      if (op.afterId !== null && at === 0) throw new DemoError(400, E.noId);
      d.sentences.splice(at, 0, s);
      startCheck(s, ctx.now);
      if (d.state === 'not_built') {
        d.state = 'draft';
        d.decisions['insufficient'] = { kind: 'accept', userId: ctx.user.id, at: ctx.now, reason: 'дописано вручную' };
      }
      return bump(state, ctx, story, d);
    }
    case 'removeSentence': {
      const s = sentence(op.sentenceId);
      d.sentences = d.sentences.filter((x) => x !== s);
      dropDecisions(d, s.id);
      addJournal(state, ctx, story, 'remove_phrase', { draft: d.kind, factText: s.facts.find((f) => f.link.status === 'no_source')?.text ?? s.text });
      return bump(state, ctx, story, d);
    }
    case 'setSource': {
      const s = sentence(op.sentenceId);
      const base = s.facts[op.factIndex]?.text ?? stripEnd(s.text);
      if (op.factIndex > s.facts.length || op.factIndex < 0) throw new DemoError(400, E.noId);
      const quote = bestQuote(base, fragmentText(story, op.ref));
      if (!quote) throw new DemoError(400, E.noFragment);
      const source = { ref: op.ref, quote };
      const fact = { text: base, source, link: verifyFact({ text: base, source }, materialOf(story)) };
      if (s.facts[op.factIndex]) s.facts[op.factIndex] = fact;
      else s.facts.push(fact);
      s.noFacts = false;
      s.checkFailed = false;
      // the person chose the source: a check still pending from an earlier edit must not replace it
      s.checkingUntil = undefined;
      s.retry = false;
      s.flags = verifySentence({ text: s.text, noFacts: false, facts: s.facts, places: s.places }, s.facts.map((f) => f.link));
      dropDecisions(d, s.id);
      addJournal(state, ctx, story, 'set_source', { draft: d.kind, detail: op.ref, factText: base });
      return bump(state, ctx, story, d);
    }
    case 'removeSync': {
      const it = item(d.syncs, op.itemId);
      d.syncs = d.syncs.filter((x) => x !== it);
      addJournal(state, ctx, story, 'remove_phrase', { draft: d.kind, detail: 'синхрон' });
      return bump(state, ctx, story, d);
    }
    case 'syncRange': {
      const it = item(d.syncs, op.itemId);
      const v = story.videos.find((x) => x.id === it.videoId);
      if (!v || op.startMs < 0 || op.startMs >= op.endMs || op.endMs > v.durationMs) throw new DemoError(400, E.badRange);
      it.startMs = op.startMs;
      it.endMs = op.endMs;
      return bump(state, ctx, story, d);
    }
    case 'setTitle': {
      const t = item(d.titles, op.itemId);
      t.name = clean(op.name, FIELD_MAX);
      t.position = clean(op.position, FIELD_MAX);
      t.link = verifyFact({ text: `${t.name}, ${t.position}`, source: t.source }, materialOf(story));
      Object.assign(t, { dirExpected: undefined }, checkTitle(state.directory, t.name, t.position));
      dropDecisions(d, t.id);
      return bump(state, ctx, story, d);
    }
    case 'removeTitle': {
      const t = item(d.titles, op.itemId);
      d.titles = d.titles.filter((x) => x !== t);
      dropDecisions(d, t.id);
      addJournal(state, ctx, story, 'remove_phrase', { draft: d.kind, factText: `${t.name}, ${t.position}` });
      return bump(state, ctx, story, d);
    }
    case 'setTitleSource': {
      const t = item(d.titles, op.itemId);
      const quote = bestQuote(`${t.name} ${t.position}`, fragmentText(story, op.ref));
      if (!quote) throw new DemoError(400, E.noFragment);
      t.source = { ref: op.ref, quote };
      t.link = verifyFact({ text: `${t.name}, ${t.position}`, source: t.source }, materialOf(story));
      dropDecisions(d, t.id);
      addJournal(state, ctx, story, 'set_source', { draft: d.kind, detail: op.ref, factText: `${t.name}, ${t.position}` });
      return bump(state, ctx, story, d);
    }
    case 'setSegment': {
      if (d.kind !== 'transcript') throw new DemoError(400, E.badBody);
      const seg = story.segments.find((s) => s.id === op.segmentId);
      if (!seg) throw new DemoError(400, E.noId);
      const text = clean(op.text, SENTENCE_MAX);
      if (text === seg.text) return;
      seg.text = text;
      seg.flags = seg.flags.filter((f) => f !== 'unclear');
      story.transcriptVersion++;
      bump(state, ctx, story, d);
      return afterTranscriptChange(story, 'изменили расшифровку', ['syncs', 'titles', 'voiceover', 'leadin']);
    }
  }
}
