import { describe, expect, test } from 'bun:test';
import { parseDraft } from '../src/core/draft-schema.ts';

const sentence = { text: 'Текст.', noFacts: false, facts: [{ text: 'факт', source: { ref: 'S1', quote: 'а б в' } }], places: [{ surface: 'Тишму', lemma: 'Тишма' }] };
const voiceover = { kind: 'voiceover', sentences: [sentence], flags: [] };
const item = { fromRef: 'S1', toRef: 'S2', note: 'n' };
const syncs = { kind: 'syncs', items: [item, item, item], flags: [] };
const title = { speaker: 1, videoId: 'V1', name: 'Имя', position: 'должность', source: null };
const titles = { kind: 'titles', items: [title], flags: [] };
const ok = (kind: Parameters<typeof parseDraft>[0], o: unknown) => parseDraft(kind, JSON.stringify(o)).ok;

describe('parseDraft', () => {
  test('valid voiceover', () => expect(ok('voiceover', voiceover)).toBe(true));
  test('valid leadin', () => expect(ok('leadin', { ...voiceover, kind: 'leadin' })).toBe(true));
  test('valid syncs with 3, 4 and 5 items', () => {
    for (const n of [3, 4, 5]) expect(ok('syncs', { ...syncs, items: Array(n).fill(item) })).toBe(true);
  });
  test('valid titles, with and without source', () => {
    expect(ok('titles', titles)).toBe(true);
    expect(ok('titles', { ...titles, items: [{ ...title, source: { ref: 'S1', quote: 'а б в' } }] })).toBe(true);
  });
  test('syncs with 2 or 6 items fails', () => {
    expect(ok('syncs', { ...syncs, items: [item, item] })).toBe(false);
    expect(ok('syncs', { ...syncs, items: Array(6).fill(item) })).toBe(false);
  });
  test('kind must match the requested kind', () => {
    expect(ok('leadin', voiceover)).toBe(false);
    expect(ok('voiceover', { ...voiceover, kind: 'leadin' })).toBe(false);
    expect(ok('titles', syncs)).toBe(false);
  });
  test('not JSON fails', () => expect(parseDraft('voiceover', 'Вот ваш текст: ...').ok).toBe(false));
  test('fenced JSON fails', () => expect(parseDraft('voiceover', '```json\n' + JSON.stringify(voiceover) + '\n```').ok).toBe(false));
  test('unknown key fails', () => expect(ok('voiceover', { ...voiceover, extra: 1 })).toBe(false));
  test('noFacts false with no facts fails', () => expect(ok('voiceover', { ...voiceover, sentences: [{ ...sentence, facts: [] }] })).toBe(false));
  test('noFacts true with no facts is valid', () => expect(ok('voiceover', { ...voiceover, sentences: [{ ...sentence, noFacts: true, facts: [] }] })).toBe(true));
  test('missing quote fails', () => expect(ok('voiceover', { ...voiceover, sentences: [{ ...sentence, facts: [{ text: 'x', source: { ref: 'S1' } }] }] })).toBe(false));
  test('unknown flag kind fails', () => expect(ok('voiceover', { ...voiceover, flags: [{ kind: 'other', refs: [], note: '' }] })).toBe(false));
  test('valid flag kinds', () => {
    const flags = ['conflict', 'insufficient', 'instruction_in_source'].map((kind) => ({ kind, refs: ['P1.1'], note: 'n' }));
    expect(ok('voiceover', { ...voiceover, flags })).toBe(true);
  });
  test('titles speaker must be an integer', () => expect(ok('titles', { ...titles, items: [{ ...title, speaker: 1.5 }] })).toBe(false));
});
