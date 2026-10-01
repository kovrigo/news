import { mockAsr } from '../../adapters/asr/mock.ts';
import { mockModel } from '../../adapters/llm/mock.ts';
import type { DraftModel } from '../../adapters/llm/types.ts';
import type { SyncsDraft, TitlesDraft } from '../../core/draft-schema.ts';
import { verifyFact, verifySentence } from '../../core/links.ts';
import type { Material } from '../../core/source.ts';
import { runStory, type DraftResult, type StoryResult } from '../../pipeline/run-story.ts';
import type { SetInfo } from '../sets.ts';
import { checkTitle, placeInDir } from './directory.ts';
import { KINDS, type Draft, type Kind, type State, type Story, type Step } from './types.ts';

export const STEP_PARSE_MS = 1500;
export const STEP_ASR_MS = 2000;
export const STEP_DRAFT_MS = 1500;
const SIMULATED_FAILURE = 'Имитация сбоя: заглушка отказывает один раз, повтор проходит';

// The only processing path: recorded answers of the mock adapters. failKind makes that one draft fail once.
export async function runSet(set: SetInfo, failKind?: string): Promise<StoryResult> {
  const base = mockModel(set.dir);
  const model: DraftModel = failKind
    ? { name: base.name, build: (req) => (req.kind === failKind ? Promise.reject(new Error(SIMULATED_FAILURE)) : base.build(req)) }
    : base;
  return runStory(set.dir, { asr: mockAsr(set.dir), model });
}

export const newDraft = (kind: Kind, story: Pick<Story, 'transcriptVersion' | 'speakersVersion'>, dirVersion: number): Draft => ({
  kind, state: 'draft', version: 1, lastEditorId: null, lastEditAt: null, sentences: [], syncs: [], titles: [], flags: [], decisions: {},
  dirVersion, basedOn: { transcript: story.transcriptVersion, speakers: story.speakersVersion },
});

function fromResult(kind: Kind, res: DraftResult | undefined, story: Story, state: State): Partial<Draft> {
  const material: Material = { segments: story.segments, paragraphs: story.paragraphs };
  const dir = state.directory;
  if (kind === 'transcript') return { state: 'draft' };
  if (!res) return { state: 'failed', failure: { no: ++state.failSeq, text: 'Черновик не построен' } };
  if (!res.ok || !res.draft) return { state: 'failed', failure: { no: ++state.failSeq, text: res.failure!.text, detail: res.failure!.detail } };
  const d = res.draft;
  const out: Partial<Draft> = { state: 'draft', flags: [] };
  if (d.kind === 'voiceover' || d.kind === 'leadin') {
    out.sentences = d.sentences.map((s, i) => {
      const links = s.facts.map((f) => verifyFact(f, material));
      return {
        id: `s${i + 1}`,
        text: s.text,
        noFacts: s.noFacts,
        facts: s.facts.map((f, k) => ({ text: f.text, source: f.source, link: links[k]! })),
        places: s.places.map((p) => ({ ...p, inDir: placeInDir(dir, p.lemma) })),
        flags: verifySentence(s, links),
      };
    });
  } else if (d.kind === 'syncs') {
    out.syncs = (d as SyncsDraft).items.flatMap((it, i) => {
      const a = material.segments.find((s) => s.id === it.fromRef);
      const b = material.segments.find((s) => s.id === it.toRef);
      if (!a || !b || a.videoId !== b.videoId) return [];
      return [{ id: `y${i + 1}`, videoId: a.videoId, startMs: Math.min(a.startMs, b.startMs), endMs: Math.max(a.endMs, b.endMs), note: it.note }];
    });
  } else {
    out.titles = (d as TitlesDraft).items.map((it, i) => {
      const link = verifyFact({ text: `${it.name}, ${it.position}`, source: it.source }, material);
      return { id: `t${i + 1}`, speaker: it.speaker, videoId: it.videoId, name: it.name, position: it.position, source: it.source, link, ...checkTitle(dir, it.name, it.position) };
    });
  }
  out.flags = d.flags.map((f, i) => {
    const sentence = out.sentences?.find((s) => s.facts.some((x) => x.source && f.refs.includes(x.source.ref)));
    return { id: `f${i + 1}`, kind: f.kind, refs: f.refs, note: f.note, sentenceId: f.kind === 'conflict' ? sentence?.id : undefined, sentenceText: sentence?.text };
  });
  const insufficient = out.flags.find((f) => f.kind === 'insufficient');
  if (insufficient) {
    out.state = 'not_built';
    out.notBuiltNote = insufficient.note;
  }
  return out;
}

// Result of runStory -> a prepared draft for one kind (also used by "Повторить").
export const preparedDraft = (kind: Kind, result: StoryResult, story: Story, state: State): Partial<Draft> =>
  fromResult(kind, result.drafts.find((x) => x.kind === kind), story, state);

export function createStory(
  state: State,
  a: { id: string; set: SetInfo; result: StoryResult; correspondentId: string; now: number },
): Story {
  const { set, result } = a;
  const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => String(i + 1));
  const videos = ids(set.videoNames.length).map((n, i) => ({
    id: `V${n}`,
    name: set.videoNames[i]!,
    durationMs: Math.max(0, ...result.material.segments.filter((s) => s.videoId === `V${n}`).map((s) => s.endMs)),
  }));
  const steps: Step[] = [];
  let t = a.now;
  const step = (label: string, ms: number): number => {
    steps.push({ label, startAt: t, endAt: t + ms });
    t += ms;
    return t;
  };
  step('Разбор файлов', STEP_PARSE_MS);
  videos.forEach((v, i) => step(`Распознавание видео ${i + 1} из ${videos.length}`, STEP_ASR_MS));
  const transcriptAt = t;
  const readyAt: Record<string, number> = { transcript: transcriptAt };
  const story: Story = {
    id: a.id,
    title: set.title,
    setId: set.id,
    correspondentId: a.correspondentId,
    loadedAt: a.now,
    videos,
    docs: ids(set.docNames.length).map((n, i) => ({ id: n, name: set.docNames[i]! })),
    segments: result.material.segments,
    paragraphs: result.material.paragraphs,
    speakerNames: {},
    transcriptVersion: 1,
    speakersVersion: 1,
    drafts: [],
    steps,
  };
  for (const k of KINDS) if (k !== 'transcript') readyAt[k] = step(`Черновик: ${k === 'syncs' ? 'синхроны' : k === 'titles' ? 'титры' : k === 'voiceover' ? 'закадровый текст' : 'подводка'}`, STEP_DRAFT_MS);
  story.drafts = KINDS.map((k) => ({
    ...newDraft(k, story, state.directory.version),
    state: 'preparing' as const,
    readyAt: readyAt[k],
    prepared: preparedDraft(k, result, story, state),
  }));
  return story;
}

export function processingInfo(story: Story, now: number): { label: string; elapsedMs: number; remainingMs: number } | null {
  const waiting = story.drafts.some((d) => d.state === 'preparing');
  if (!waiting) return null;
  const last = story.steps[story.steps.length - 1]!;
  const cur = story.steps.find((s) => now >= s.startAt && now < s.endAt) ?? last;
  const readyMax = Math.max(last.endAt, ...story.drafts.map((d) => d.readyAt ?? 0));
  return { label: cur.label, elapsedMs: Math.max(0, now - story.loadedAt), remainingMs: Math.max(0, readyMax - now) };
}
