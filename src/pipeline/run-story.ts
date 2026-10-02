import { join } from 'node:path';
import { z } from 'zod';
import { asrOutput, type Asr } from '../adapters/asr/types.ts';
import { buildRequest } from '../adapters/llm/prompt.ts';
import type { DraftKind, DraftModel } from '../adapters/llm/types.ts';
import { parseDraft, type Draft, type Quoted } from '../core/draft-schema.ts';
import { DRAFT_FAILURES, type FailureCode, type SentenceFlag } from '../core/failures.ts';
import { verifyFact, verifySentence, type LinkResult } from '../core/links.ts';
import type { DocParagraph, Material, Segment } from '../core/source.ts';

const storyFile = z.object({ title: z.string(), videos: z.array(z.string()), docs: z.array(z.string()) });

export type Failure = { code: FailureCode; text: string; detail?: string };
export type CheckedFact = { text: string; source: Quoted; link: LinkResult };
export type DraftResult = {
  kind: DraftKind;
  ok: boolean;
  failure?: Failure;
  draft?: Draft;
  facts: CheckedFact[];
  sentenceFlags: SentenceFlag[][]; // per sentence, voiceover and leadin only
  raws: string[]; // every raw model output, for the injection check
};
export type StoryResult = { material: Material; drafts: DraftResult[]; costRub: number; ms: number };

const KINDS: DraftKind[] = ['voiceover', 'leadin', 'syncs', 'titles'];

export async function runStory(dir: string, adapters: { asr: Asr; model: DraftModel }): Promise<StoryResult> {
  const t0 = performance.now();
  const story = storyFile.parse(await Bun.file(join(dir, 'story.json')).json());

  const segments: Segment[] = [];
  for (const [i, name] of story.videos.entries()) {
    const bytes = await Bun.file(join(dir, name)).bytes();
    const out = asrOutput.parse(await adapters.asr.transcribe({ name, bytes })).sort((a, b) => a.startMs - b.startMs);
    for (const s of out) {
      segments.push({
        id: `S${segments.length + 1}`,
        videoId: `V${i + 1}`,
        startMs: s.startMs,
        endMs: s.endMs,
        speaker: s.speaker,
        text: s.text,
        flags: [...(s.confidence < 0.5 ? (['unclear'] as const) : []), ...(s.lang === 'other' ? (['not_russian'] as const) : [])],
      });
    }
  }

  const paragraphs: DocParagraph[] = [];
  for (const [d, name] of story.docs.entries()) {
    const parts = (await Bun.file(join(dir, name)).text()).split(/\r?\n[ \t]*\r?\n/).map((p) => p.trim()).filter(Boolean);
    for (const [k, text] of parts.entries()) paragraphs.push({ id: `P${d + 1}.${k + 1}`, docId: String(d + 1), n: k + 1, text });
  }
  const material: Material = { segments, paragraphs };

  let costRub = 0;
  const fail = (kind: DraftKind, code: FailureCode, raws: string[], detail?: string): DraftResult => ({
    kind, ok: false, failure: { code, text: DRAFT_FAILURES[code], detail }, facts: [], sentenceFlags: [], raws,
  });

  const build = async (kind: DraftKind): Promise<DraftResult> => {
    const req = buildRequest(kind, material);
    const raws: string[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      let out;
      try {
        out = await adapters.model.build(req);
      } catch (e) {
        return fail(kind, 'model_error', raws, e instanceof Error ? e.message : String(e));
      }
      costRub += out.costRub;
      raws.push(out.raw);
      const parsed = parseDraft(kind, out.raw);
      if (parsed.ok && syncRefsValid(parsed.draft)) return check(kind, parsed.draft, raws);
    }
    return fail(kind, 'malformed_output', raws);
  };

  // a sync must run between two pieces of one video; anything else is an answer in the wrong form, never a silently shorter draft
  const syncRefsValid = (draft: Draft): boolean => {
    if (draft.kind !== 'syncs') return true;
    const video = (ref: string): string | undefined => material.segments.find((s) => s.id === ref)?.videoId;
    return draft.items.every((it) => video(it.fromRef) !== undefined && video(it.fromRef) === video(it.toRef));
  };

  const check = (kind: DraftKind, draft: Draft, raws: string[]): DraftResult => {
    const facts: CheckedFact[] = [];
    const sentenceFlags: SentenceFlag[][] = [];
    if (draft.kind === 'voiceover' || draft.kind === 'leadin') {
      for (const s of draft.sentences) {
        const links = s.facts.map((f) => verifyFact(f, material));
        s.facts.forEach((f, i) => facts.push({ ...f, link: links[i]! }));
        sentenceFlags.push(verifySentence(s, links));
      }
    } else if (draft.kind === 'titles') {
      for (const it of draft.items) {
        const f = { text: `${it.name}, ${it.position}`, source: it.source };
        facts.push({ ...f, link: verifyFact(f, material) });
      }
    }
    return { kind, ok: true, draft, facts, sentenceFlags, raws };
  };

  const drafts = await Promise.all(KINDS.map(build));
  return { material, drafts, costRub: Math.round(costRub * 1e6) / 1e6, ms: Math.round(performance.now() - t0) };
}
