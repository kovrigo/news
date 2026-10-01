import type { StoryResult } from '../../pipeline/run-story.ts';
import { E, DRAFT_NAMES } from '../texts.ts';
import type { SetInfo } from '../sets.ts';
import { createStory, preparedDraft, STEP_DRAFT_MS } from './build.ts';
import { recheckDraft, samePerson } from './directory.ts';
import { lockIsLive, releaseLock, startCheck } from './edit.ts';
import { addJournal } from './journal.ts';
import { computeMarks, pendingCount, type Mark } from './marks.ts';
import { DemoError, type Ctx, type Draft, type State, type Story } from './types.ts';

export const COMMENT_MAX = 500;
const userName = (state: State, id: string): string => state.users.find((u) => u.id === id)?.name ?? '';
export const canEditDirectory = (ctx: Ctx): boolean => ctx.user.role !== 'correspondent';

export function startStory(state: State, ctx: Ctx, set: SetInfo, result: StoryResult): Story {
  const story = createStory(state, { id: `st${++state.seq}`, set, result, correspondentId: ctx.user.id, now: ctx.now });
  state.stories.push(story);
  addJournal(state, ctx, story, 'create_story', { detail: set.title });
  return story;
}

export function deleteStory(state: State, ctx: Ctx, story: Story): void {
  if (ctx.user.role !== 'chief') throw new DemoError(403, E.forbidden);
  state.stories = state.stories.filter((s) => s !== story);
  for (const r of state.journal)
    if (r.storyId === story.id) {
      r.storyDeleted = true;
      delete r.factText;
    }
  const row = addJournal(state, ctx, story, 'delete_story');
  row.storyDeleted = true;
}

// Why the draft cannot be approved now, or null.
export function approveBlock(state: State, ctx: Ctx, story: Story, d: Draft): string | null {
  switch (d.state) {
    case 'approved': return E.alreadyApproved;
    case 'preparing': return E.preparing;
    case 'failed': return E.failedBlock;
    case 'not_built': return E.notBuiltBlock;
    case 'not_needed': return E.notNeededBlock;
    case 'returned': return E.returnedWait;
  }
  if (lockIsLive(d, ctx.now) && d.lock!.userId !== ctx.user.id) return E.lockedBy(userName(state, d.lock!.userId));
  if (d.sentences.some((s) => s.checkingUntil)) return E.checking;
  const n = pendingCount(d, story);
  return n > 0 ? E.pendingMarks(n) : null;
}

export function submitDraft(state: State, ctx: Ctx, story: Story, d: Draft): void {
  if (!['draft', 'returned', 'reapprove'].includes(d.state)) throw new DemoError(409, E.notSubmittable);
  d.state = 'review';
  d.submitted = { userId: ctx.user.id, at: ctx.now };
  d.returned = undefined;
  d.directoryNotice = false;
  releaseLock(ctx, d);
  addJournal(state, ctx, story, 'submit', { draft: d.kind });
}

export function approveDraft(state: State, ctx: Ctx, story: Story, d: Draft, version: number, clickKey: string): void {
  if (!ctx.user.canApprove) throw new DemoError(403, E.notApprover);
  const key = `approve:${story.id}:${d.kind}:${clickKey}`;
  if (key in state.keys) return;
  if (version !== d.version) throw new DemoError(409, E.staleVersion);
  const block = approveBlock(state, ctx, story, d);
  if (block) throw new DemoError(409, block);
  d.approval = {
    userId: ctx.user.id, at: ctx.now, version: d.version,
    transcriptVersion: story.transcriptVersion, speakersVersion: story.speakersVersion, lastEditorId: d.lastEditorId,
  };
  d.state = 'approved';
  d.reapproveReason = undefined;
  d.returned = undefined;
  d.submitted = undefined;
  d.exportedAt = undefined;
  d.modifiedAfterExport = false;
  d.directoryNotice = false;
  d.basedOn = { transcript: story.transcriptVersion, speakers: story.speakersVersion };
  releaseLock(ctx, d);
  state.keys[key] = addJournal(state, ctx, story, 'approve', { draft: d.kind, detail: `версия ${d.version}` }).id;
}

export function returnDraft(state: State, ctx: Ctx, story: Story, d: Draft, comment: string): void {
  if (!ctx.user.canApprove) throw new DemoError(403, E.notApprover);
  const c = comment.trim();
  if (c === '') throw new DemoError(400, E.commentEmpty);
  if (c.length > COMMENT_MAX) throw new DemoError(400, E.commentLong);
  if (!['draft', 'review', 'reapprove', 'approved'].includes(d.state)) throw new DemoError(409, E.notReturnable);
  d.state = 'returned';
  d.returned = { comment: c, userId: ctx.user.id, at: ctx.now };
  d.approval = undefined;
  d.submitted = undefined;
  d.directoryNotice = false;
  addJournal(state, ctx, story, 'return', { draft: d.kind, detail: c });
}

export function setNotNeeded(state: State, ctx: Ctx, story: Story, d: Draft, on: boolean): void {
  if (!ctx.user.canApprove) throw new DemoError(403, E.notApprover);
  if (on && d.state !== 'not_built') throw new DemoError(409, E.notEditable);
  if (!on && d.state !== 'not_needed') throw new DemoError(409, E.notEditable);
  d.state = on ? 'not_needed' : 'not_built';
  addJournal(state, ctx, story, on ? 'not_needed' : 'needed', { draft: d.kind });
}

const factTextOf = (d: Draft, m: Mark): string | undefined => {
  const { sentenceId, factIndex, itemId } = m.target;
  if (sentenceId) {
    const s = d.sentences.find((x) => x.id === sentenceId);
    return s?.facts[factIndex ?? 0]?.text ?? s?.text;
  }
  const t = d.titles.find((x) => x.id === itemId);
  return t ? `${t.name}, ${t.position}` : m.text;
};

const JOURNAL_OF: Record<string, string> = {
  take: 'take_over', confirm: 'confirm', keep: 'keep_unclear', checked: 'checked_ru', pick: 'pick_source', accept: 'accept_asis',
};

export function decide(state: State, ctx: Ctx, story: Story, d: Draft, markKey: string, action: string, reason?: string, ref?: string): void {
  const m = computeMarks(d, story).find((x) => x.key === markKey);
  if (!m) throw new DemoError(400, E.noMark);
  if (d.state === 'approved') throw new DemoError(409, E.undoApproved);
  if (action === 'undo') {
    if (!d.decisions[markKey]) throw new DemoError(400, E.badDecision);
    delete d.decisions[markKey];
    if (m.kind === 'insufficient' && d.sentences.length === 0 && d.state === 'draft') d.state = 'not_built';
    addJournal(state, ctx, story, 'undo', { draft: d.kind, detail: m.label });
    return;
  }
  if (!m.actions.includes(action) || !(action in JOURNAL_OF)) throw new DemoError(400, E.badDecision);
  if (action === 'take' && ctx.user.role === 'chief') throw new DemoError(403, E.forbidden);
  if (action === 'pick' && (!ref || !m.target.refs?.includes(ref))) throw new DemoError(400, E.noFragment);
  d.decisions[markKey] = { kind: action, userId: ctx.user.id, at: ctx.now, reason: reason || undefined, ref };
  if (action === 'accept' && d.state === 'not_built') d.state = 'draft';
  addJournal(state, ctx, story, JOURNAL_OF[action]!, {
    draft: d.kind,
    detail: [ref, reason].filter(Boolean).join(': ') || m.label,
    factText: action === 'take' ? factTextOf(d, m) : undefined,
  });
}

export function recheckSentence(ctx: Ctx, d: Draft, sentenceId: string): void {
  const s = d.sentences.find((x) => x.id === sentenceId);
  if (!s || !s.checkFailed) throw new DemoError(400, E.noMark);
  startCheck(s, ctx.now, true);
}

export function addToDirectory(state: State, ctx: Ctx, story: Story, d: Draft, markKey: string): void {
  if (!canEditDirectory(ctx)) throw new DemoError(403, E.forbidden);
  const m = computeMarks(d, story).find((x) => x.key === markKey);
  if (!m || !m.actions.includes('add_dir')) throw new DemoError(400, E.noMark);
  if (m.kind === 'place') {
    const s = d.sentences.find((x) => x.id === m.target.sentenceId);
    const p = s?.places.find((x) => `place:${s.id}:${x.lemma}` === markKey);
    if (!p) throw new DemoError(400, E.noMark);
    state.directory.places.push({ id: `tp${++state.seq}`, name: p.lemma });
  } else {
    const t = d.titles.find((x) => x.id === m.target.itemId);
    if (!t) throw new DemoError(400, E.noMark);
    const row = { name: t.name, position: t.position };
    if (!state.directory.people.some((p) => samePerson(p, row))) state.directory.people.push({ id: `p${++state.seq}`, ...row });
  }
  state.directory.version++;
  recheckDraft(state.directory, story, d.kind);
  addJournal(state, ctx, story, 'add_directory', { draft: d.kind, detail: m.text });
}

export function retryDraft(state: State, ctx: Ctx, story: Story, d: Draft, result: StoryResult): void {
  if (d.state !== 'failed') throw new DemoError(409, E.notFailed);
  d.state = 'preparing';
  d.readyAt = ctx.now + STEP_DRAFT_MS;
  d.prepared = preparedDraft(d.kind, result, story, state);
  story.steps.push({ label: `Повтор: ${DRAFT_NAMES[d.kind].toLowerCase()}`, startAt: ctx.now, endAt: d.readyAt });
  addJournal(state, ctx, story, 'retry', { draft: d.kind });
}

// Opening a story: unapproved drafts pick up directory changes (marks only, no new version).
export function syncDirectory(state: State, story: Story): boolean {
  let changed = false;
  for (const d of story.drafts) {
    if (d.state === 'preparing' || d.state === 'approved' || d.dirVersion === state.directory.version) continue;
    recheckDraft(state.directory, story, d.kind);
    d.directoryNotice = true;
    changed = true;
  }
  return changed;
}

