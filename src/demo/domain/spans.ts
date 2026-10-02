import { normalize, tokens } from '../../core/normalize.ts';

export type Piece = { text: string; fact: number | null };

const stem = (w: string): string => (w.length <= 4 ? w : w.slice(0, w.length - 2));

// Splits a sentence into plain pieces and pieces that belong to a fact.
// A fact owns the run of sentence words from its first to its last word that shares a stem with the fact text.
export function splitSentence(text: string, factTexts: string[]): Piece[] {
  const words = [...text.matchAll(/\S+/g)].map((m) => {
    const trail = /[.,;:!?…»)]+$/.exec(m[0])?.[0].length ?? 0;
    return { start: m.index!, end: m.index! + m[0].length - trail, norm: normalize(m[0]) };
  });
  const spans: Array<[number, number] | null> = factTexts.map((ft) => {
    const stems = tokens(ft).filter((w) => w.length >= 4).map(stem);
    const idx = words.flatMap((w, i) => (w.norm.length >= 4 && stems.some((s) => w.norm.startsWith(s)) ? [i] : []));
    return idx.length ? [idx[0]!, idx[idx.length - 1]!] : null;
  });
  if (factTexts.length === 1 && !spans[0]) spans[0] = [0, words.length - 1];
  const pieces: Piece[] = [];
  let pos = 0;
  let floor = 0;
  for (const [i, sp] of spans.entries()) {
    if (!sp || words.length === 0) continue;
    const a = Math.max(sp[0], floor);
    if (a > sp[1]) continue;
    const from = words[a]!.start;
    const to = words[sp[1]]!.end;
    if (from > pos) pieces.push({ text: text.slice(pos, from), fact: null });
    pieces.push({ text: text.slice(from, to), fact: i });
    pos = to;
    floor = sp[1] + 1;
  }
  if (pos < text.length) pieces.push({ text: text.slice(pos), fact: null });
  return pieces;
}
