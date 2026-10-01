import { describe, expect, test } from 'bun:test';
import type { VoiceoverSentence } from '../src/core/draft-schema.ts';
import { verifyFact, verifySentence, type LinkResult } from '../src/core/links.ts';
import { material } from './helpers.ts';

const fact = (ref: string | null, quote = '', text = 'факт') => ({ text, source: ref === null ? null : { ref, quote } });
const reason = (r: LinkResult) => (r.status === 'no_source' ? r.reason : r.status);

describe('verifyFact', () => {
  test('linked: video place is the segment', () => {
    expect(verifyFact(fact('S1', 'мы закрываем старый мост'), material)).toEqual({
      status: 'linked',
      place: { kind: 'video', videoId: 'V1', startMs: 0, endMs: 1000 },
    });
  });
  test('linked: doc place is the paragraph', () => {
    expect(verifyFact(fact('P1.1', 'Ремонт начнётся 1 ноября'), material)).toEqual({ status: 'linked', place: { kind: 'doc', docId: '1', n: 1 } });
  });
  test('no_ref', () => expect(reason(verifyFact(fact(null), material))).toBe('no_ref'));
  test('unknown_ref: missing segment', () => expect(reason(verifyFact(fact('S99', 'мы закрываем старый мост'), material))).toBe('unknown_ref'));
  test('unknown_ref: missing paragraph', () => expect(reason(verifyFact(fact('P9.9', 'ремонт начнётся 1 ноября'), material))).toBe('unknown_ref'));
  test('unknown_ref: bad ref shape', () => expect(reason(verifyFact(fact('X1', 'мы закрываем старый мост'), material))).toBe('unknown_ref'));
  test('quote_too_short', () => expect(reason(verifyFact(fact('S1', 'Старый мост'), material))).toBe('quote_too_short'));
  test('quote_not_found: quote cut mid-word', () => expect(reason(verifyFact(fact('S1', 'ы закрываем старый'), material))).toBe('quote_not_found'));
  test('quote_too_short: punctuation does not count', () => expect(reason(verifyFact(fact('S1', 'Старый — мост — ...'), material))).toBe('quote_too_short'));
  test('quote_not_found', () => expect(reason(verifyFact(fact('S1', 'мы открываем старый мост'), material))).toBe('quote_not_found'));
  test('quote_not_found: doc quote from another paragraph', () => expect(reason(verifyFact(fact('P1.2', 'ремонт начнётся 1 ноября'), material))).toBe('quote_not_found'));
  test('number_mismatch', () =>
    expect(reason(verifyFact(fact('S3', 'работы продлятся девяносто дней', 'Работы продлятся 80 дней'), material))).toBe('number_mismatch'));
  test('number words and digits are the same number', () =>
    expect(reason(verifyFact(fact('S3', 'работы продлятся девяносто дней', 'Работы продлятся 90 дней'), material))).toBe('linked'));
  test('insensitive to ё/е', () => expect(reason(verifyFact(fact('S3', 'дней это елка'), material))).toBe('linked'));
  test('insensitive to ё/е and case in a long quote', () =>
    expect(reason(verifyFact(fact('S3', 'ДНЕЙ, ЭТО ЕЛКА'), material))).toBe('linked'));
  test('insensitive to punctuation', () => expect(reason(verifyFact(fact('S3', 'продлятся — девяносто... дней'), material))).toBe('linked'));
  test('quote spans two adjacent segments', () =>
    expect(verifyFact(fact('S1', 'через Тишму на капитальный ремонт'), material)).toEqual({
      status: 'linked',
      place: { kind: 'video', videoId: 'V1', startMs: 0, endMs: 2000 },
    }));
  test('quote in the next segment is found from the ref', () =>
    expect(verifyFact(fact('S2', 'работы продлятся девяносто дней'), material)).toEqual({
      status: 'linked',
      place: { kind: 'video', videoId: 'V1', startMs: 2000, endMs: 3000 },
    }));
  test('quote two segments away is not found', () => expect(reason(verifyFact(fact('S1', 'работы продлятся девяносто дней'), material))).toBe('quote_not_found'));
  test('window does not cross into another video', () =>
    expect(reason(verifyFact(fact('S5', 'остались в стороне'), material))).toBe('quote_not_found'));
  test('numbers are compared with the quote, not with the paragraph', () =>
    expect(reason(verifyFact(fact('P1.1', 'начнётся 1 ноября и продлится 90 дней', 'Ремонт продлится 91 день'), material))).toBe('number_mismatch'));
});

const sentence = (text: string, facts: VoiceoverSentence['facts'], noFacts = false): VoiceoverSentence => ({ text, noFacts, facts, places: [] });
const flagsOf = (s: VoiceoverSentence) => verifySentence(s, s.facts.map((f) => verifyFact(f, material)));

describe('verifySentence', () => {
  test('fully supported sentence has no flags, declined name included', () => {
    const s = sentence('Депутата Иванова спросили про 90 дней.', [
      { text: 'Иванов остался в стороне', source: { ref: 'S4', quote: 'Омск и Иванов остались в стороне' } },
      { text: 'Работы продлятся 90 дней', source: { ref: 'S3', quote: 'работы продлятся девяносто дней' } },
    ]);
    // "Омск" is not in the sentence, so only Иванова is checked against the quotes.
    expect(flagsOf(s)).toEqual([]);
  });
  test('unsupported_number', () => {
    const s = sentence('Работы продлятся 80 дней.', [{ text: 'Работы продлятся девяносто дней', source: { ref: 'S3', quote: 'работы продлятся девяносто дней' } }]);
    expect(flagsOf(s)).toEqual(['unsupported_number']);
  });
  test('unsupported_number: the linked quote is the only support', () => {
    const s = sentence('Ремонт займёт 90 дней.', [{ text: 'Ремонт займёт 90 дней', source: null }]);
    expect(flagsOf(s)).toEqual(['unsupported_number']);
  });
  test('unsupported_name', () => {
    const s = sentence('Мост закроют на ремонт в Заречинске.', [{ text: 'Мост закроют', source: { ref: 'S1', quote: 'мы закрываем старый мост' } }]);
    expect(flagsOf(s)).toEqual(['unsupported_name']);
  });
  test('first word capital is not a name', () => {
    const s = sentence('Заречинск ждёт.', [{ text: 'Мост закроют', source: { ref: 'S1', quote: 'мы закрываем старый мост' } }]);
    expect(flagsOf(s)).toEqual([]);
  });
  test('prefix rule: 4-5 letter name loses one letter', () => {
    const s = sentence('Это было в Омске.', [{ text: 'Омск остался', source: { ref: 'S4', quote: 'Омск и Иванов остались в стороне' } }]);
    expect(flagsOf(s)).toEqual([]);
  });
  test('prefix rule: short name must match whole', () => {
    const s = sentence('Это сказал Ян.', [{ text: 'Омск остался', source: { ref: 'S4', quote: 'Омск и Иванов остались в стороне' } }]);
    expect(flagsOf(s)).toEqual(['unsupported_name']);
  });
  test('unmarked_fact: noFacts with a number', () => expect(flagsOf(sentence('Стройка идёт в три смены.', [], true))).toEqual(['unmarked_fact']));
  test('unmarked_fact: noFacts with a name', () => expect(flagsOf(sentence('Сказал это Иванов.', [], true))).toEqual(['unmarked_fact']));
  test('noFacts without numbers or names is clean', () => expect(flagsOf(sentence('Подробности в сюжете.', [], true))).toEqual([]));
  test('both number and name flags can come together', () => {
    const s = sentence('В Омске работы идут 5 дней.', [{ text: 'Работы продлятся девяносто дней', source: { ref: 'S3', quote: 'работы продлятся девяносто дней' } }]);
    expect(flagsOf(s)).toEqual(['unsupported_number', 'unsupported_name']);
  });
});
