import { describe, expect, test } from 'bun:test';
import { inflateRawSync } from 'node:zlib';
import { fileName } from '../src/demo/domain/export.ts';
import { PAVEL, OLGA, env, key } from './demo-helpers.ts';

const dec = (b: Uint8Array): string => new TextDecoder('utf-8', { ignoreBOM: true }).decode(b);
const DEMO = 'ДЕМО — придуманные данные, не для эфира';
const KINDS = ['transcript', 'syncs', 'titles', 'voiceover', 'leadin'];

async function files(res: Response): Promise<{ name: string; data: Uint8Array }[]> {
  const b = new Uint8Array(await res.arrayBuffer());
  const v = new DataView(b.buffer);
  const out: { name: string; data: Uint8Array }[] = [];
  let o = 0;
  while (v.getUint32(o, true) === 0x04034b50) {
    const size = v.getUint32(o + 18, true);
    const nl = v.getUint16(o + 26, true);
    const name = dec(b.slice(o + 30, o + 30 + nl));
    const start = o + 30 + nl;
    out.push({ name, data: new Uint8Array(inflateRawSync(b.slice(start, start + size))) });
    o = start + size;
  }
  return out;
}

async function setup() {
  const e = await env();
  const s = e.story('читальня');
  const exp = (kinds: string[], format: 'txt' | 'docx', noHeader = false, user = PAVEL) =>
    e.call(user, 'POST', `/api/stories/${s.id}/export`, { kinds, format, noHeader, clickKey: key() });
  return { e, s, exp };
}

describe('export: refusal and demo line', () => {
  test('an unapproved draft is refused, also by a direct request; an approved one is given and starts with the demo line', async () => {
    const e = await env();
    const bad = e.story('спортзала');
    const direct = await e.call(PAVEL, 'POST', `/api/stories/${bad.id}/export`, { kinds: ['voiceover'], format: 'txt', noHeader: false, clickKey: key() });
    expect(direct.status).toBe(403);
    expect(direct.json.error).toBe('Черновик не утверждён, не выгружается');
    const mixed = e.story('Старого моста');
    const half = await e.call(PAVEL, 'POST', `/api/stories/${mixed.id}/export`, { kinds: ['leadin', 'syncs'], format: 'docx', noHeader: false, clickKey: key() });
    expect(half.status).toBe(403);
    expect(e.state().journal.filter((r) => r.action === 'export' && r.storyId === mixed.id && r.draft === 'leadin')).toHaveLength(0);
    const { exp } = await setup();
    const ok = await exp(['leadin'], 'txt');
    expect(ok.status).toBe(200);
    const text = dec(new Uint8Array(await ok.res.arrayBuffer()));
    expect(text.startsWith('\uFEFF' + DEMO + '\r\n')).toBe(true);
  });
});

describe('export: file formats', () => {
  test('text: BOM, CRLF only, header, dash line, then the text', async () => {
    const { exp } = await setup();
    const r = await exp(['leadin'], 'txt');
    const bytes = new Uint8Array(await r.res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = dec(bytes).slice(1);
    expect(text).not.toMatch(/[^\r]\n/);
    const lines = text.split('\r\n');
    expect(lines.slice(0, 5)).toEqual([
      DEMO,
      'Сюжет: Летняя читальня на набережной',
      'Черновик: Подводка',
      expect.stringMatching(/^Утвердил: Павел Тестов, \d+ \S+ 2026, \d\d:\d\d \(Europe\/Moscow\)$/),
      'Версия: 1',
    ] as string[]);
    expect(lines[5]).toBe('-'.repeat(40));
    expect(lines[6]).toBe('На набережной открылась летняя читальня.');
    expect(lines.at(-1)).toBe('');
  });

  test('the lead-in text file can go without a header, for the teleprompter', async () => {
    const { exp } = await setup();
    const r = await exp(['leadin'], 'txt', true);
    const text = dec(new Uint8Array(await r.res.arrayBuffer())).slice(1);
    expect(text.split('\r\n').slice(0, 3)).toEqual([DEMO, '', 'На набережной открылась летняя читальня.']);
    expect(text).not.toContain('Сюжет:');
  });

  test('transcript and syncs use H:MM:SS timecodes; titles are one line each', async () => {
    const { exp } = await setup();
    const t = dec(new Uint8Array(await (await exp(['transcript'], 'txt')).res.arrayBuffer()));
    expect(t).toContain('00:00:00 · Заведующая библиотекой · Спикер 1\r\nЯ Лидия Осокина, заведующая городской библиотекой.');
    const sy = dec(new Uint8Array(await (await exp(['syncs'], 'txt')).res.arrayBuffer()));
    expect(sy).toMatch(/Начало: 00:00:06\r\nКонец: 00:00:19\r\nДлительность: 00:00:13\r\nГоворящий: Спикер 1\r\nТекст: /);
    const ti = dec(new Uint8Array(await (await exp(['titles'], 'txt')).res.arrayBuffer()));
    expect(ti).toContain('Лидия Осокина — заведующая городской библиотекой\r\n');
  });

  test('DOCX: the demo line is the first paragraph; the same content in the same order', async () => {
    const { exp } = await setup();
    const r = await exp(['voiceover'], 'docx');
    expect(r.res.headers.get('content-type')).toContain('wordprocessingml.document');
    const parts = await files(r.res);
    expect(parts.map((p) => p.name)).toEqual(['[Content_Types].xml', '_rels/.rels', 'word/_rels/document.xml.rels', 'word/styles.xml', 'word/document.xml']);
    const doc = dec(parts.find((p) => p.name === 'word/document.xml')!.data);
    expect(doc.indexOf(DEMO)).toBeGreaterThan(0);
    expect(doc.indexOf(DEMO)).toBeLessThan(doc.indexOf('Сюжет:'));
    expect(doc.indexOf('Сюжет:')).toBeLessThan(doc.indexOf('Летняя читальня на набережной открылась в среду.'));
    expect(doc.match(/<w:p[ >/]/g)!.length).toBeGreaterThan(8);
    expect(doc.slice(doc.indexOf('<w:body>'), doc.indexOf('<w:body>') + 80)).toContain(DEMO.slice(0, 5));
  });

  test('several drafts make one ZIP with a file per draft', async () => {
    const { exp } = await setup();
    const r = await exp(KINDS, 'txt');
    expect(r.res.headers.get('content-type')).toBe('application/zip');
    const parts = await files(r.res);
    expect(parts.map((p) => p.name)).toEqual(KINDS.map((k) => `Летняя читальня на набережной — ${{ transcript: 'Расшифровка', syncs: 'Синхроны', titles: 'Титры', voiceover: 'Закадровый текст', leadin: 'Подводка' }[k]}.txt`));
    for (const p of parts) expect(dec(p.data).startsWith('\uFEFF' + DEMO)).toBe(true);
    expect(decodeURIComponent(r.res.headers.get('x-file-name')!)).toBe('Летняя читальня на набережной.zip');
  });

  test('file names: Windows-forbidden characters become dashes; at most 100 characters', () => {
    expect(fileName('Мост: ремонт/объезд? «да» <1> | 2 * 3 \\ "x"', 'txt')).toBe('Мост- ремонт-объезд- «да» -1- - 2 - 3 - -x-.txt');
    const long = fileName('а'.repeat(300), 'docx');
    expect(long.length).toBeLessThanOrEqual(100);
    expect(long.endsWith('.docx')).toBe(true);
    expect(fileName('Имя...', 'txt')).toBe('Имя.txt');
  });

  test('an export marks the draft "Выгружен" and writes the journal', async () => {
    const { e, s, exp } = await setup();
    await exp(['leadin'], 'docx');
    const v = (await e.call(OLGA, 'GET', `/api/stories/${s.id}`)).json;
    expect(v.drafts[4].stateWord).toBe('Выгружена');
    const row = e.state().journal.filter((r) => r.action === 'export').at(-1)!;
    expect([row.draft, row.detail, row.userName]).toEqual(['leadin', 'DOCX', 'Павел Тестов']);
  });
});
