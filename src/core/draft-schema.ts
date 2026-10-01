import { z } from 'zod';
import type { DraftKind } from '../adapters/llm/types.ts';

const quoted = z.strictObject({ ref: z.string(), quote: z.string() }).nullable();
const flags = z.array(
  z.strictObject({
    kind: z.enum(['conflict', 'insufficient', 'instruction_in_source']),
    refs: z.array(z.string()),
    note: z.string(),
  }),
);
const sentence = z
  .strictObject({
    text: z.string(),
    noFacts: z.boolean(),
    facts: z.array(z.strictObject({ text: z.string(), source: quoted })),
    places: z.array(z.strictObject({ surface: z.string(), lemma: z.string() })),
  })
  .refine((s) => s.noFacts || s.facts.length > 0, 'noFacts false needs at least one fact');

const voiceover = z.strictObject({ kind: z.enum(['voiceover', 'leadin']), sentences: z.array(sentence), flags });
const syncs = z.strictObject({
  kind: z.literal('syncs'),
  items: z.array(z.strictObject({ fromRef: z.string(), toRef: z.string(), note: z.string() })).min(3).max(5),
  flags,
});
const titles = z.strictObject({
  kind: z.literal('titles'),
  items: z.array(
    z.strictObject({ speaker: z.number().int(), videoId: z.string(), name: z.string(), position: z.string(), source: quoted }),
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
