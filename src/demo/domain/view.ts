import { NO_SOURCE_REASONS } from '../../core/failures.ts';
import type { Place as SrcPlace } from '../../core/source.ts';
import { dayOf, fmtDateTime, fmtSpan } from '../format.ts';
import { ACTION_LABELS, APPROVE_LABELS, DRAFT_NAMES, NO_EDITOR, ROLE_LABELS, STORY_DELETED, stateWord } from '../texts.ts';
import { processingInfo } from './build.ts';
import { lockIsLive } from './edit.ts';
import { approveBlock } from './flow.ts';
import { computeMarks, type Mark } from './marks.ts';
import { splitSentence, type Piece } from './spans.ts';
import { KINDS, type Ctx, type DState, type Draft, type JournalRow, type Kind, type State, type Story, type User } from './types.ts';

const nameOf = (state: State, id: string | null | undefined): string => (id ? (state.users.find((u) => u.id === id)?.name ?? '') : '');

export type PlaceView = { place: SrcPlace; label: string; sourceName: string; ref?: string };
export type FactView = {
  index: number;
  text: string;
  status: 'linked' | 'no_source' | 'taken';
  where?: PlaceView;
  manualBy?: string; // linked to a place the person chose
  reason?: string;
  takenBy?: string;
  takenReason?: string;
  markKey?: string;
};
export type SentenceView = {
  id: string;
  text: string;
  pieces: Piece[];
  facts: FactView[];
  checking: boolean;
  noFacts: boolean;
  markKeys: string[];
};
export type TitleView = {
  id: string;
  name: string;
  position: string;
  speaker: string;
  videoId: string;
  where?: PlaceView;
  status: 'linked' | 'no_source' | 'taken';
  manualBy?: string;
  reason?: string;
  takenBy?: string;
  dir: 'ok' | 'no_name' | 'position';
  dirText: string;
  overflow: string[];
  markKeys: string[];
};
export type SyncView = { id: string; videoId: string; startMs: number; endMs: number; durationMs: number; speaker: string; text: string; where: PlaceView };
export type SegmentView = { id: string; videoId: string; speaker: number; speakerName: string; startMs: number; endMs: number; text: string; flags: string[]; instruction: boolean; markKeys: string[] };
export type DraftView = {
  kind: Kind;
  name: string;
  state: DState;
  stateWord: string;
  version: number;
  basedOn: { transcript: number; speakers: number };
  pending: number;
  marks: Mark[];
  approveLabel: string;
  approveBlock: string | null;
  manualSources: number; // linked facts and titles whose source the person chose
  mayApprove: boolean;
  maySubmit: boolean;
  mayReturn: boolean;
  mayEdit: boolean;
  mayNotNeeded: boolean;
  exported: boolean;
  modifiedAfterExport: boolean;
  reapproveReason?: string;
  directoryNotice: boolean;
  notBuiltNote?: string;
  approval?: { by: string; at: number; version: number; lastEditor: string };
  returned?: { comment: string; by: string; at: number };
  submitted?: { by: string; at: number };
  failure?: { no: number; text: string; detail?: string };
  lock?: { by: string; mine: boolean };
  words: number;
  seconds: number;
  sentences: SentenceView[];
  syncs: SyncView[];
  titles: TitleView[];
  conflicts: { markKey: string; note: string; places: PlaceView[] }[];
  lastEditor: string;
  lastEditAt: number | null;
  lastJournal?: { at: number; text: string };
};
export type StoryView = {
  id: string;
  title: string;
  correspondent: string;
  loadedAt: number;
  sourceCount: number;
  videos: Story['videos'];
  docs: { id: string; name: string; paragraphs: { id: string; n: number; text: string; instruction: boolean }[] }[];
  segments: SegmentView[];
  speakers: { videoId: string; speaker: number; name: string; videoName: string }[];
  drafts: DraftView[];
  approved: number;
  total: number;
  processing: { label: string; elapsedMs: number; remainingMs: number } | null;
  noticeDraftsFailed: number;
  me: { id: string; name: string; role: string; canApprove: boolean };
  now: number;
};

const pieceOf = (story: Story, ref: string | undefined, p: SrcPlace): PlaceView => {
  if (p.kind === 'video') {
    const v = story.videos.find((x) => x.id === p.videoId);
    return { place: p, label: fmtSpan(p.startMs, p.endMs, (v?.durationMs ?? 0) >= 3600_000), sourceName: v?.name ?? p.videoId, ref };
  }
  const doc = story.docs.find((x) => x.id === p.docId);
  return { place: p, label: `Абзац ${p.n}`, sourceName: doc?.name ?? `Документ ${p.docId}`, ref };
};

export function placeOfRef(story: Story, ref: string): PlaceView | undefined {
  const seg = story.segments.find((s) => s.id === ref);
  if (seg) return pieceOf(story, ref, { kind: 'video', videoId: seg.videoId, startMs: seg.startMs, endMs: seg.endMs });
  const p = story.paragraphs.find((x) => x.id === ref);
  return p ? pieceOf(story, ref, { kind: 'doc', docId: p.docId, n: p.n }) : undefined;
}

const NAME_MAX = 32;
const POSITION_LINE = 40;
// Greedy wrap: how the position fits two lines of 40 characters.
function overflowOf(name: string, position: string): string[] {
  const out: string[] = [];
  if (name.length > NAME_MAX) out.push(`ФИО длиннее ${NAME_MAX} знаков`);
  let lines = 1;
  let len = 0;
  for (const w of position.split(' ')) {
    if (len === 0) len = w.length;
    else if (len + 1 + w.length <= POSITION_LINE) len += 1 + w.length;
    else {
      lines++;
      len = w.length;
    }
  }
  if (lines > 2) out.push(`Должность не влезает в две строки по ${POSITION_LINE} знаков`);
  return out;
}

// A chosen source is kept as a fragment id; people see the source and the place.
function detailOf(state: State, r: JournalRow): string {
  if (r.action !== 'set_source' || !r.detail) return r.detail ?? '';
  const story = state.stories.find((s) => s.id === r.storyId);
  const p = story && placeOfRef(story, r.detail);
  return p ? `${p.sourceName}, ${p.label}` : r.detail;
}

function lastJournal(state: State, story: Story, d: Draft): { at: number; text: string } | undefined {
  const row = state.journal.filter((r) => r.storyId === story.id && r.draft === d.kind).sort((a, b) => b.at - a.at || b.id - a.id)[0];
  const detail = row && detailOf(state, row);
  return row ? { at: row.at, text: `${row.userName}: ${ACTION_LABELS[row.action] ?? row.action}${detail ? ` — ${detail}` : ''}` } : undefined;
}

export function draftView(state: State, ctx: Ctx, story: Story, d: Draft): DraftView {
  const marks = computeMarks(d, story);
  const markKeys = new Set(marks.map((m) => m.key));
  const takenOf = (key: string): { by: string; reason?: string } | undefined => {
    const dec = d.decisions[key];
    return dec && dec.kind === 'take' && markKeys.has(key) ? { by: nameOf(state, dec.userId), reason: dec.reason } : undefined;
  };
  const sentences: SentenceView[] = d.sentences.map((s) => {
    const facts: FactView[] = s.facts.map((f, i) => {
      const key = `nosrc:${s.id}:${i}`;
      const taken = takenOf(key);
      const base = { index: i, text: f.text, markKey: markKeys.has(key) ? key : undefined };
      if (f.link.status === 'linked')
        return { ...base, status: 'linked' as const, where: pieceOf(story, f.source?.ref, f.link.place), manualBy: f.manual ? nameOf(state, f.manual.userId) : undefined };
      const where = f.source ? placeOfRef(story, f.source.ref) : undefined;
      return taken
        ? { ...base, status: 'taken' as const, where, takenBy: taken.by, takenReason: taken.reason }
        : { ...base, status: 'no_source' as const, reason: NO_SOURCE_REASONS[f.link.reason] };
    });
    return {
      id: s.id,
      text: s.text,
      pieces: splitSentence(s.text, s.facts.map((f) => f.text)),
      facts,
      checking: s.checkingUntil !== undefined,
      noFacts: s.noFacts,
      markKeys: marks.filter((m) => m.target.sentenceId === s.id).map((m) => m.key),
    };
  });
  const titles: TitleView[] = d.titles.map((t) => {
    const taken = takenOf(`tnosrc:${t.id}`);
    const status = t.link.status === 'linked' ? 'linked' : taken ? 'taken' : 'no_source';
    return {
      id: t.id,
      name: t.name,
      position: t.position,
      speaker: story.speakerNames[`${t.videoId}:${t.speaker}`] ?? `Спикер ${t.speaker}`,
      videoId: t.videoId,
      where: t.source ? placeOfRef(story, t.source.ref) : undefined,
      status,
      reason: t.link.status === 'no_source' ? NO_SOURCE_REASONS[t.link.reason] : undefined,
      takenBy: taken?.by,
      manualBy: status === 'linked' && t.manual ? nameOf(state, t.manual.userId) : undefined,
      dir: t.dir,
      dirText: t.dir === 'ok' ? 'Есть в справочнике' : t.dir === 'no_name' ? 'Нет в справочнике' : `Должность не совпадает со справочником: ${t.dirExpected}`,
      overflow: overflowOf(t.name, t.position),
      markKeys: marks.filter((m) => m.target.itemId === t.id).map((m) => m.key),
    };
  });
  const syncs: SyncView[] = d.syncs.map((it) => {
    const segs = story.segments.filter((s) => s.videoId === it.videoId && s.startMs < it.endMs && s.endMs > it.startMs);
    return {
      id: it.id, videoId: it.videoId, startMs: it.startMs, endMs: it.endMs, durationMs: it.endMs - it.startMs,
      speaker: segs[0] ? (story.speakerNames[`${it.videoId}:${segs[0].speaker}`] ?? `Спикер ${segs[0].speaker}`) : '',
      text: segs.map((s) => s.text).join(' '),
      where: pieceOf(story, undefined, { kind: 'video', videoId: it.videoId, startMs: it.startMs, endMs: it.endMs }),
    };
  });
  const words = d.sentences.reduce((n, s) => n + s.text.split(/\s+/).filter(Boolean).length, 0);
  const conflicts = marks
    .filter((m) => m.kind === 'conflict')
    .map((m) => ({ markKey: m.key, note: m.text, places: (m.target.refs ?? []).flatMap((r) => placeOfRef(story, r) ?? []) }));
  const block = approveBlock(state, ctx, story, d);
  const live = lockIsLive(d, ctx.now);
  const editable = !['preparing', 'failed', 'not_needed'].includes(d.state);
  const me = ctx.user;
  return {
    kind: d.kind,
    name: DRAFT_NAMES[d.kind],
    state: d.state,
    stateWord: stateWord(d.kind, d.state, !!d.exportedAt && d.state === 'approved'),
    version: d.version,
    basedOn: d.basedOn,
    pending: marks.filter((m) => m.pending).length,
    marks,
    approveLabel: APPROVE_LABELS[d.kind],
    approveBlock: block,
    manualSources: [...sentences.flatMap((s) => s.facts), ...titles].filter((x) => x.manualBy).length,
    mayApprove: me.canApprove,
    maySubmit: !me.canApprove && ['draft', 'returned', 'reapprove'].includes(d.state),
    mayReturn: me.canApprove && ['draft', 'review', 'reapprove', 'approved'].includes(d.state),
    mayEdit: editable,
    mayNotNeeded: me.canApprove && (d.state === 'not_built' || d.state === 'not_needed'),
    exported: !!d.exportedAt && d.state === 'approved',
    modifiedAfterExport: !!d.modifiedAfterExport && d.state === 'reapprove',
    reapproveReason: d.state === 'reapprove' ? d.reapproveReason : undefined,
    directoryNotice: !!d.directoryNotice && d.state !== 'approved',
    notBuiltNote: d.notBuiltNote,
    approval: d.approval && { by: nameOf(state, d.approval.userId), at: d.approval.at, version: d.approval.version, lastEditor: d.approval.lastEditorId ? nameOf(state, d.approval.lastEditorId) : NO_EDITOR },
    returned: d.returned && { comment: d.returned.comment, by: nameOf(state, d.returned.userId), at: d.returned.at },
    submitted: d.submitted && { by: nameOf(state, d.submitted.userId), at: d.submitted.at },
    failure: d.failure,
    lock: d.lock && live ? { by: nameOf(state, d.lock.userId), mine: d.lock.userId === me.id } : undefined,
    words,
    seconds: Math.ceil(words / 2.5),
    sentences,
    syncs,
    titles,
    conflicts,
    lastEditor: d.lastEditorId ? nameOf(state, d.lastEditorId) : NO_EDITOR,
    lastEditAt: d.lastEditAt,
    lastJournal: lastJournal(state, story, d),
  };
}

export const countApproved = (s: Story): { approved: number; total: number } => ({
  approved: s.drafts.filter((d) => d.state === 'approved').length,
  total: s.drafts.filter((d) => d.state !== 'not_needed').length,
});

export function storyView(state: State, ctx: Ctx, story: Story): StoryView {
  const flagged = new Set(story.drafts.flatMap((d) => d.flags.filter((f) => f.kind === 'instruction_in_source').flatMap((f) => f.refs)));
  const trMarks = computeMarks(story.drafts.find((d) => d.kind === 'transcript')!, story);
  const { approved, total } = countApproved(story);
  const speakerKeys = [...new Set(story.segments.map((s) => `${s.videoId}:${s.speaker}`))];
  return {
    id: story.id,
    title: story.title,
    correspondent: nameOf(state, story.correspondentId),
    loadedAt: story.loadedAt,
    sourceCount: story.videos.length + story.docs.length,
    videos: story.videos,
    docs: story.docs.map((doc) => ({
      id: doc.id,
      name: doc.name,
      paragraphs: story.paragraphs.filter((p) => p.docId === doc.id).map((p) => ({ id: p.id, n: p.n, text: p.text, instruction: flagged.has(p.id) })),
    })),
    segments: story.segments.map((s) => ({
      id: s.id, videoId: s.videoId, speaker: s.speaker, speakerName: story.speakerNames[`${s.videoId}:${s.speaker}`] ?? `Спикер ${s.speaker}`,
      startMs: s.startMs, endMs: s.endMs, text: s.text, flags: s.flags, instruction: flagged.has(s.id),
      markKeys: trMarks.filter((m) => m.target.segmentId === s.id).map((m) => m.key),
    })),
    speakers: speakerKeys.map((k) => {
      const [videoId, sp] = k.split(':') as [string, string];
      return { videoId, speaker: Number(sp), name: story.speakerNames[k] ?? `Спикер ${sp}`, videoName: story.videos.find((v) => v.id === videoId)?.name ?? videoId };
    }),
    drafts: KINDS.map((k) => draftView(state, ctx, story, story.drafts.find((d) => d.kind === k)!)),
    approved,
    total,
    processing: processingInfo(story, ctx.now),
    noticeDraftsFailed: story.drafts.filter((d) => d.state === 'failed').length,
    me: { id: ctx.user.id, name: ctx.user.name, role: ctx.user.role, canApprove: ctx.user.canApprove },
    now: ctx.now,
  };
}

export type StoryRow = {
  id: string;
  title: string;
  correspondent: string;
  loadedAt: number;
  day: string;
  approved: number;
  total: number;
  marks: number;
  failed: number;
  processing: boolean;
  timeToApprovalMs: number | null;
};
export type ListView = {
  stories: StoryRow[];
  returned: { storyId: string; kind: Kind; title: string; draft: string; comment: string; by: string; at: number }[];
  waiting: { storyId: string; kind: Kind; title: string; draft: string; by: string; at: number }[];
  showTimes: boolean;
  now: number;
};

export function listView(state: State, ctx: Ctx): ListView {
  const me = ctx.user;
  const showTimes = me.canApprove || me.role === 'chief';
  const stories = [...state.stories].sort((a, b) => b.loadedAt - a.loadedAt);
  return {
    now: ctx.now,
    showTimes,
    stories: stories.map((s) => {
      const { approved, total } = countApproved(s);
      const done = total > 0 && approved === total;
      return {
        id: s.id, title: s.title, correspondent: nameOf(state, s.correspondentId), loadedAt: s.loadedAt, day: dayOf(s.loadedAt),
        approved, total,
        marks: s.drafts.reduce((n, d) => n + computeMarks(d, s).filter((m) => m.pending).length, 0),
        failed: s.drafts.filter((d) => d.state === 'failed').length,
        processing: s.drafts.some((d) => d.state === 'preparing'),
        timeToApprovalMs: done ? Math.max(...s.drafts.filter((d) => d.approval).map((d) => d.approval!.at)) - s.loadedAt : null,
      };
    }),
    returned: stories
      .filter((s) => s.correspondentId === me.id)
      .flatMap((s) => s.drafts.filter((d) => d.state === 'returned' && d.returned).map((d) => ({
        storyId: s.id, kind: d.kind, title: s.title, draft: DRAFT_NAMES[d.kind], comment: d.returned!.comment, by: nameOf(state, d.returned!.userId), at: d.returned!.at,
      }))),
    waiting: me.canApprove
      ? stories.flatMap((s) => s.drafts.filter((d) => d.state === 'review' && d.submitted).map((d) => ({
          storyId: s.id, kind: d.kind, title: s.title, draft: DRAFT_NAMES[d.kind], by: nameOf(state, d.submitted!.userId), at: d.submitted!.at,
        })))
      : [],
  };
}

export const JOURNAL_PAGE = 500;
export type JournalQuery = { story?: string; user?: string; action?: string; from?: number; to?: number; taken?: boolean; limit?: number };
export function journalView(state: State, q: JournalQuery): {
  rows: { id: number; at: number; userName: string; action: string; actionLabel: string; draft: string; storyTitle: string; storyDeleted: boolean; detail: string; factText: string }[];
  total: number;
  stories: { id: string; title: string }[];
  users: { id: string; name: string }[];
  actions: { id: string; label: string }[];
} {
  const found = state.journal
    .filter((r: JournalRow) => !q.story || r.storyId === q.story)
    .filter((r) => !q.user || r.userId === q.user)
    .filter((r) => !q.action || r.action === q.action)
    .filter((r) => (q.from === undefined || r.at >= q.from) && (q.to === undefined || r.at <= q.to))
    .filter((r) => !q.taken || r.action === 'take_over')
    .sort((a, b) => b.at - a.at || b.id - a.id);
  // newest first, a page at a time; the page says how many there are in all
  const rows = found.slice(0, Math.max(JOURNAL_PAGE, Math.floor(q.limit ?? JOURNAL_PAGE)));
  // a story's first row is its upload: two stories with one title differ by that time in the filter
  const seen = new Map<string, { title: string; at: number }>();
  for (const r of state.journal) if (r.storyId) seen.set(r.storyId, { title: r.storyTitle, at: Math.min(r.at, seen.get(r.storyId)?.at ?? r.at) });
  const titles = [...seen.values()].map((x) => x.title);
  const twice = (t: string): boolean => titles.indexOf(t) !== titles.lastIndexOf(t);
  return {
    rows: rows.map((r) => ({
      id: r.id, at: r.at, userName: r.userName, action: r.action, actionLabel: ACTION_LABELS[r.action] ?? r.action,
      draft: r.draft ? DRAFT_NAMES[r.draft] : '', storyTitle: r.storyTitle, storyDeleted: !!r.storyDeleted, detail: detailOf(state, r),
      factText: r.storyDeleted && r.action === 'take_over' ? STORY_DELETED : (r.factText ?? ''),
    })),
    total: found.length,
    stories: [...seen].map(([id, x]) => ({ id, title: twice(x.title) ? `${x.title}, загружен ${fmtDateTime(x.at)}` : x.title })),
    users: state.users.map((u) => ({ id: u.id, name: u.name })),
    actions: Object.entries(ACTION_LABELS).map(([id, label]) => ({ id, label })),
  };
}

export const publicUser = (u: User): { id: string; name: string; role: string; roleLabel: string; canApprove: boolean; enabled: boolean } => ({
  // the right is shown as it is now: the chief editor can give it to a correspondent or take it from an editor
  id: u.id, name: u.name, role: u.role, roleLabel: ROLE_LABELS[u.role] + (u.canApprove && u.role !== 'chief' ? ', право утверждать' : ''), canApprove: u.canApprove, enabled: u.enabled,
});
