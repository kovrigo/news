import { describe, expect, test } from 'bun:test';
import { checkTitle } from '../src/demo/domain/directory.ts';
import { bestQuote, findSource } from '../src/demo/domain/finder.ts';
import { splitSentence } from '../src/demo/domain/spans.ts';
import { fmtClock, fmtDate } from '../src/demo/format.ts';
import { stateWord, plural } from '../src/demo/texts.ts';
import { buildSeed } from '../src/demo/seed.ts';
import { computeMarks } from '../src/demo/domain/marks.ts';
import { SETS } from '../src/demo/sets.ts';
import { material } from './helpers.ts';

describe('sentence pieces', () => {
  test('only the words of a fact are cut out; the rest stays plain', () => {
    const p = splitSentence('Работы продлятся девяносто дней и обойдутся в сорок восемь миллионов рублей.', ['Работы продлятся девяносто дней']);
    expect(p.map((x) => [x.text, x.fact])).toEqual([['Работы продлятся девяносто дней', 0], [' и обойдутся в сорок восемь миллионов рублей.', null]]);
  });
  test('two facts in one sentence get their own runs; a fact without matching words owns the whole single sentence', () => {
    const p = splitSentence('Мост откроют в конце января, подрядчик обещает не сорвать сроки.', ['Мост откроют в конце января', 'Подрядчик обещает не сорвать сроки']);
    expect(p.filter((x) => x.fact !== null).map((x) => x.text)).toEqual(['Мост откроют в конце января', 'подрядчик обещает не сорвать сроки']);
    expect(splitSentence('Ура!', ['xyz'])).toEqual([{ text: 'Ура', fact: 0 }, { text: '!', fact: null }]);
  });
});

describe('the stand-in source finder', () => {
  test('finds the best fragment and a verbatim quote of three words or more', () => {
    const src = findSource('Работы продлятся девяносто дней', material)!;
    expect(src.ref).toBe('S3');
    expect(src.quote.split(' ').length).toBeGreaterThanOrEqual(3);
    expect(material.segments.find((s) => s.id === 'S3')!.text).toContain(src.quote);
  });
  test('nothing in common means no source', () => {
    expect(findSource('Совсем другая тема про погоду', material)).toBeNull();
    expect(bestQuote('слово', 'два слова')).toBeNull();
  });
});

describe('directory check and texts', () => {
  const dir = { version: 1, people: [{ id: 'a', name: 'Татьяна Рогова', position: 'пресс-секретарь' }, { id: 'b', name: 'Татьяна Рогова', position: 'начальник отдела' }], places: [] };
  test('a person with two positions matches either; another position is flagged', () => {
    expect(checkTitle(dir, 'Татьяна Рогова', 'Начальник отдела').dir).toBe('ok');
    expect(checkTitle(dir, 'Татьяна Рогова', 'директор')).toEqual({ dir: 'position', dirExpected: 'пресс-секретарь; начальник отдела' });
    expect(checkTitle(dir, 'Иван Иванов', 'директор').dir).toBe('no_name');
  });
  test('state words agree with the draft name', () => {
    expect(stateWord('leadin', 'approved', false)).toBe('Утверждена');
    expect(stateWord('titles', 'approved', false)).toBe('Утверждены');
    expect(stateWord('voiceover', 'approved', false)).toBe('Утверждён');
    expect(stateWord('leadin', 'approved', true)).toBe('Выгружена');
    expect(stateWord('titles', 'returned', false)).toBe('Возвращены');
    expect(stateWord('transcript', 'not_built', false)).toBe('Не построена');
  });
  test('time and numbers', () => {
    expect(fmtClock(14_000)).toBe('00:14');
    expect(fmtClock(3_725_000)).toBe('01:02:05');
    expect(fmtClock(14_000, true)).toBe('00:00:14');
    expect(fmtDate(Date.UTC(2026, 9, 1, 12))).toBe('1 октября 2026');
    expect([1, 2, 5, 11, 21].map((n) => plural(n, 'пометка', 'пометки', 'пометок'))).toEqual(['пометка', 'пометки', 'пометок', 'пометок', 'пометка']);
  });
});

describe('the seed comes from code', () => {
  test('four stories on two days; every yellow-mark kind is there; marks come from the link checker', async () => {
    const s = await buildSeed(Date.UTC(2026, 9, 1, 12));
    expect(s.stories).toHaveLength(4);
    expect(new Set(s.stories.map((x) => new Date(x.loadedAt).toISOString().slice(0, 10))).size).toBeGreaterThanOrEqual(2);
    const kinds = new Set(s.stories.flatMap((st) => st.drafts.flatMap((d) => computeMarks(d, st).map((m) => m.kind))));
    for (const k of ['no_source', 'sentence_flag', 'title_name', 'title_position', 'title_no_source', 'place', 'unclear', 'not_russian', 'conflict', 'insufficient', 'unverifiable'])
      expect([k, kinds.has(k as never)]).toEqual([k, true]);
    const states = new Set(s.stories[0]!.drafts.map((d) => d.state));
    expect([...states].sort()).toEqual(['approved', 'draft', 'returned', 'review']);
    expect(s.stories[0]!.drafts.some((d) => d.state === 'approved' && d.exportedAt)).toBe(true);
    expect(s.stories.some((st) => st.drafts.some((d) => d.state === 'failed' && d.failure!.no > 1000))).toBe(true);
    expect(s.stories.some((st) => st.drafts.every((d) => d.state === 'approved'))).toBe(true);
    expect(s.stories.some((st) => st.drafts.some((d) => d.state === 'not_built'))).toBe(true);
    const flagged = s.stories.flatMap((st) => st.drafts.flatMap((d) => d.flags.filter((f) => f.kind === 'instruction_in_source')));
    expect(flagged.length).toBeGreaterThan(0);
    expect(s.directory.people.length).toBeGreaterThanOrEqual(6);
    expect(s.directory.people.length).toBeLessThanOrEqual(10);
    expect(s.directory.places).toHaveLength(5);
    expect(new Set(s.directory.people.map((p) => p.name)).size).toBeLessThan(s.directory.people.length);
  });
  test('built-in sets match their fixtures', async () => {
    for (const set of SETS) {
      const meta = (await Bun.file(`${set.dir}/story.json`).json()) as { title: string; videos: string[]; docs: string[] };
      expect([set.id, set.title]).toEqual([set.id, meta.title]);
      expect([set.id, set.videoNames.length]).toEqual([set.id, meta.videos.length]);
      expect([set.id, set.docNames.length]).toEqual([set.id, meta.docs.length]);
    }
  });
});
