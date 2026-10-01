import type { Fact, VoiceoverSentence } from './draft-schema.ts';
import type { NoSourceReason, SentenceFlag } from './failures.ts';
import { extractNumbers } from './numbers.ts';
import { normalize, tokens } from './normalize.ts';
import type { Material, Place } from './source.ts';

export type LinkResult =
  | { status: 'linked'; place: Place }
  | { status: 'no_source'; reason: NoSourceReason };

const noSource = (reason: NoSourceReason): LinkResult => ({ status: 'no_source', reason });

// Finds the quote in the normalized window; prefers an occurrence that touches the referenced part.
// parts: normalized texts joined by one space; main: index of the referenced part.
function locate(parts: string[], main: number, quote: string): { first: number; last: number } | null {
  const starts: number[] = [];
  let pos = 0;
  for (const p of parts) {
    starts.push(pos);
    pos += p.length + 1;
  }
  // Padding with spaces makes the quote match whole words only; padded index at+1 is original index at.
  const window = ` ${parts.join(' ')} `;
  const padded = ` ${quote} `;
  let found: { first: number; last: number } | null = null;
  for (let at = window.indexOf(padded); at >= 0; at = window.indexOf(padded, at + 1)) {
    const end = at + quote.length;
    const touched = parts.flatMap((p, i) => (starts[i]! < end && starts[i]! + p.length > at ? [i] : []));
    if (touched.length === 0) continue;
    const hit = { first: touched[0]!, last: touched[touched.length - 1]! };
    if (touched.includes(main)) return hit;
    found ??= hit;
  }
  return found;
}

export function verifyFact(fact: Fact, material: Material): LinkResult {
  const src = fact.source;
  if (src === null) return noSource('no_ref');
  const quote = normalize(src.quote);
  const checks = (place: Place | null): LinkResult => {
    if (!place) return noSource('quote_not_found');
    const nums = new Set(extractNumbers(src.quote));
    if (!extractNumbers(fact.text).every((n) => nums.has(n))) return noSource('number_mismatch');
    return { status: 'linked', place };
  };

  if (src.ref.startsWith('P')) {
    const p = material.paragraphs.find((x) => x.id === src.ref);
    if (!p) return noSource('unknown_ref');
    if (tokens(src.quote).length < 3) return noSource('quote_too_short');
    const hit = ` ${normalize(p.text)} `.includes(` ${quote} `);
    return checks(hit ? { kind: 'doc', docId: p.docId, n: p.n } : null);
  }

  const seg = material.segments.find((x) => x.id === src.ref);
  if (!seg) return noSource('unknown_ref');
  if (tokens(src.quote).length < 3) return noSource('quote_too_short');
  const video = material.segments.filter((x) => x.videoId === seg.videoId);
  const at = video.indexOf(seg);
  const win = video.slice(Math.max(0, at - 1), at + 2);
  const hit = locate(win.map((s) => normalize(s.text)), win.indexOf(seg), quote);
  if (!hit) return checks(null);
  const first = win[hit.first]!;
  const last = win[hit.last]!;
  return checks({ kind: 'video', videoId: seg.videoId, startMs: first.startMs, endMs: last.endMs });
}

// Prefix of a proper name that survives declension.
function prefix(word: string): string {
  const w = normalize(word);
  return w.length >= 6 ? w.slice(0, -2) : w.length >= 4 ? w.slice(0, -1) : w;
}

// results[i] is verifyFact of sentence.facts[i].
export function verifySentence(sentence: VoiceoverSentence, results: LinkResult[]): SentenceFlag[] {
  const quotes = sentence.facts.flatMap((f, i) => (results[i]?.status === 'linked' && f.source ? [f.source.quote] : []));
  const sentenceNumbers = extractNumbers(sentence.text);
  const words = [...sentence.text.matchAll(/\p{L}+/gu)];
  const names = words.filter((m, i) => i > 0 && /^\p{Lu}/u.test(m[0])).map((m) => prefix(m[0]));

  if (sentence.noFacts) return sentenceNumbers.length > 0 || names.length > 0 ? ['unmarked_fact'] : [];

  const flags: SentenceFlag[] = [];
  const nums = new Set(quotes.flatMap(extractNumbers));
  if (!sentenceNumbers.every((n) => nums.has(n))) flags.push('unsupported_number');
  const quoteWords = quotes.flatMap(tokens);
  if (!names.every((p) => quoteWords.some((w) => w.startsWith(p)))) flags.push('unsupported_name');
  return flags;
}
