import { z } from 'zod';
import type { DraftKind } from '../adapters/llm/types.ts';

// Lengths are bounded like typed text: a sentence 300, a note 500, a name or place 120.
const text = z.string().max(300);
const short = z.string().max(120);
const ref = z.string().max(32);
const quoted = z.strictObject({ ref, quote: text }).nullable();
const flags = z.array(
  z.strictObject({
    kind: z.enum(['conflict', 'insufficient', 'instruction_in_source']),
    refs: z.array(ref),
    note: z.string().max(500),
  }),
);
const sentence = z
  .strictObject({
    text,
    noFacts: z.boolean(),
    facts: z.array(z.strictObject({ text, source: quoted })),
    places: z.array(z.strictObject({ surface: short, lemma: short })),
  })
  .refine((s) => s.noFacts || s.facts.length > 0, 'noFacts false needs at least one fact');

const voiceover = z.strictObject({ kind: z.enum(['voiceover', 'leadin']), sentences: z.array(sentence), flags });
const syncs = z.strictObject({
  kind: z.literal('syncs'),
  items: z.array(z.strictObject({ fromRef: ref, toRef: ref, note: z.string().max(500) })).min(3).max(5),
  flags,
});
const titles = z.strictObject({
  kind: z.literal('titles'),
  items: z.array(
    z.strictObject({ speaker: z.number().int(), videoId: ref, name: short, position: short, source: quoted }),
  ),
  flags,
});

export type Quoted = z.infer<typeof quoted>;
export type Fact = { text: string; source: Quoted };
export type VoiceoverDraft = z.infer<typeof voiceover>;
export type VoiceoverSentence = VoiceoverDraft['sentences'][number];
export type SyncsDraft = z.infer<typeof syncs>;
export type TitlesDraft = z.infer<typeof titles>;
export type Draft = VoiceoverDraft | SyncsDraft | TitlesDraft;

const schemas = { voiceover, leadin: voiceover, syncs, titles } as const;

export type ParsedDraft = { ok: true; draft: Draft } | { ok: false; error: string };

export function parseDraft(kind: DraftKind, raw: string): ParsedDraft {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: String(e) };
  }
  const r = schemas[kind].safeParse(json);
  if (!r.success) return { ok: false, error: r.error.message };
  if (r.data.kind !== kind) return { ok: false, error: `kind is ${r.data.kind}, expected ${kind}` };
  return { ok: true, draft: r.data };
}
