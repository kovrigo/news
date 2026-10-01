import { expect, test } from 'bun:test';
import { normalize, tokens } from '../src/core/normalize.ts';

test('lowercase and ё to е', () => expect(normalize('Ёлка ЁЖ')).toBe('елка еж'));
test('punctuation, quotes and dashes become space', () =>
  expect(normalize('«Мост» — «Тишма»; (вот) “так”, ‘да’ – нет…')).toBe('мост тишма вот так да нет'));
test('symbols become space', () => expect(normalize('a+b=c № $5 ©')).toBe('a b c 5'));
test('digits, letters and % stay', () => expect(normalize('Рост 40% за 2024-й')).toBe('рост 40% за 2024 й'));
test('whitespace collapses and trims', () => expect(normalize('  а \n\t б в  ')).toBe('а б в'));
test('empty and punctuation-only give empty', () => {
  expect(normalize('')).toBe('');
  expect(normalize(' — … ')).toBe('');
});
test('tokens split the normalized text', () => expect(tokens('Мост — старый, Ёлка')).toEqual(['мост', 'старый', 'елка']));
test('tokens of empty text is empty', () => expect(tokens('...')).toEqual([]));
