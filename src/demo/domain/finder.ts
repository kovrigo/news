import type { Quoted } from '../../core/draft-schema.ts';
import { normalize, tokens } from '../../core/normalize.ts';
import type { Material } from '../../core/source.ts';

// Deterministic stand-in for the model that picks a source for an edited sentence.
// A stem is the word without its ending, so declension does not matter.
const stem = (w: string): string => (w.length <= 4 ? w : w.slice(0, w.length - 2));
const content = (text: string): string[] => [...new Set(tokens(text).filter((w) => w.length >= 4).map(stem))];

const words = (text: string): string[] => text.split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter(Boolean);

type Fragment = { ref: string; text: string };
const fragments = (m: Material): Fragment[] => [
  ...m.segments.map((s) => ({ ref: s.id, text: s.text })),
  ...m.paragraphs.map((p) => ({ ref: p.id, text: p.text })),
];

const hits = (stems: string[], w: string): boolean => {
  const t = normalize(w);
  return t !== '' && stems.some((s) => t.startsWith(s));
};

// Best window of 3..12 words of the fragment, verbatim.
export function bestQuote(text: string, fragment: string): string | null {
  const ws = words(fragment);
  if (ws.length < 3) return null;
  const stems = content(text);
  let best = { score: -1, from: 0, len: 0 };
  for (let len = 3; len <= Math.min(12, ws.length); len++) {
    for (let from = 0; from + len <= ws.length; from++) {
      const score = ws.slice(from, from + len).filter((w) => hits(stems, w)).length - len * 0.01;
      if (score > best.score) best = { score, from, len };
    }
  }
  return ws.slice(best.from, best.from + best.len).join(' ');
}

export function findSource(text: string, material: Material): Quoted {
  const stems = content(text);
  if (stems.length === 0) return null;
  let best: { frag: Fragment; score: number } | null = null;
  for (const frag of fragments(material)) {
    const toks = tokens(frag.text);
    const score = stems.filter((s) => toks.some((t) => t.startsWith(s))).length;
    if (score > (best?.score ?? 0)) best = { frag, score };
  }
  if (!best || best.score < 2) return null;
  const quote = bestQuote(text, best.frag.text);
  return quote ? { ref: best.frag.ref, quote } : null;
}
