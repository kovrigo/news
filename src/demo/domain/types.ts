import type { Quoted } from '../../core/draft-schema.ts';
import type { LinkResult } from '../../core/links.ts';
import type { SentenceFlag } from '../../core/failures.ts';
import type { DocParagraph, Segment } from '../../core/source.ts';

export type Role = 'correspondent' | 'editor' | 'chief';
export type User = { id: string; name: string; role: Role; canApprove: boolean; enabled: boolean };

export const KINDS = ['transcript', 'syncs', 'titles', 'voiceover', 'leadin'] as const;
export type Kind = (typeof KINDS)[number];

export type DState =
  | 'preparing'
  | 'draft'
  | 'review'
  | 'returned'
  | 'approved'
  | 'reapprove'
  | 'not_built'
  | 'failed'
  | 'not_needed';

export type Place = { surface: string; lemma: string; inDir: boolean };
// A source the person chose: the code only confirmed the quote is there, not what the fact means.
export type ManualSource = { userId: string; at: number };
export type Sentence = {
  id: string;
  text: string;
  noFacts: boolean;
  facts: { text: string; source: Quoted; link: LinkResult; manual?: ManualSource }[];
  places: Place[];
  flags: SentenceFlag[];
  checkingUntil?: number; // epoch ms: the source search for an edited sentence ends then
  checkFailed?: boolean;
  retry?: boolean; // "Проверить снова": the next check does not time out
};
export type SyncItem = { id: string; videoId: string; startMs: number; endMs: number; note: string };
export type TitleItem = {
  id: string;
  speaker: number;
  videoId: string;
  name: string;
  position: string;
  source: Quoted;
  link: LinkResult;
  manual?: ManualSource;
  dir: 'ok' | 'no_name' | 'position';
  dirExpected?: string;
};
export type DraftFlag = {
  id: string;
  kind: 'conflict' | 'insufficient' | 'instruction_in_source';
  refs: string[];
  note: string;
  sentenceId?: string; // conflict: the sentence that cites a conflicting place
  sentenceText?: string;
};
export type Decision = { kind: string; userId: string; at: number; reason?: string; ref?: string };
export type Approval = {
  userId: string;
  at: number;
  version: number;
  transcriptVersion: number;
  speakersVersion: number;
  lastEditorId: string | null;
};
export type Lock = { userId: string; since: number; lastChangeAt: number; heartbeatAt: number; journaled?: boolean };
export type Failure = { no: number; text: string; detail?: string };

export type Draft = {
  kind: Kind;
  state: DState;
  version: number;
  lastEditorId: string | null;
  lastEditAt: number | null;
  sentences: Sentence[];
  syncs: SyncItem[];
  titles: TitleItem[];
  flags: DraftFlag[];
  decisions: Record<string, Decision>;
  approval?: Approval;
  returned?: { comment: string; userId: string; at: number };
  submitted?: { userId: string; at: number };
  failure?: Failure;
  notBuiltNote?: string;
  reapproveReason?: string;
  exportedAt?: number;
  modifiedAfterExport?: boolean;
  dirVersion: number;
  directoryNotice?: boolean;
  basedOn: { transcript: number; speakers: number };
  lock?: Lock;
  // set while the draft is being prepared: what it becomes at readyAt
  readyAt?: number;
  prepared?: Partial<Draft>;
};

export type Step = { label: string; startAt: number; endAt: number };
export type Story = {
  id: string;
  title: string;
  setId: string;
  correspondentId: string;
  loadedAt: number;
  videos: { id: string; name: string; durationMs: number }[];
  docs: { id: string; name: string }[];
  segments: Segment[];
  paragraphs: DocParagraph[];
  speakerNames: Record<string, string>; // "V1:1" -> name
  transcriptVersion: number;
  speakersVersion: number;
  drafts: Draft[];
  steps: Step[];
};

export type Person = { id: string; name: string; position: string };
export type Toponym = { id: string; name: string };
export type JournalRow = {
  id: number;
  at: number;
  userId: string;
  userName: string;
  action: string;
  storyId: string;
  storyTitle: string;
  storyDeleted?: boolean;
  draft?: Kind;
  detail?: string;
  factText?: string;
};
export type State = {
  v: 1;
  resetId: string; // new on every demo-reset; the browser drops offline drafts of an older one
  seq: number;
  failSeq: number;
  users: User[];
  directory: { version: number; people: Person[]; places: Toponym[] };
  stories: Story[];
  journal: JournalRow[];
  keys: Record<string, number>; // click key -> journal row id
};

export class DemoError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export type Ctx = { now: number; user: User };
