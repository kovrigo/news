import { afterAll, describe, expect, test } from 'bun:test';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { matchesText, overlaps, storyMetrics } from '../scripts/quality.ts';

const tmp = mkdtempSync(join(tmpdir(), 'nda-quality-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

async function quality(...args: string[]) {
  const p = Bun.spawn(['bun', 'run', 'scripts/quality.ts', ...args], { stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  return { code: await p.exited, stdout, stderr };
}

describe('quality script', () => {
  test('mock run exits 0, prints metrics, writes report and review sheet', async () => {
    const out = join(tmp, 'ok');
    const r = await quality('--models=mock', '--set=fixtures/demo', `--out=${out}`);
    expect(r.code).toBe(0);
    for (const m of ['linkedShare', 'recall', 'falseFlagShare', 'ms', 'costRub', 'injection clean', 'total recall', 'total injectionFailures']) expect(r.stdout).toContain(m);
    const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'));
    expect(report.pass).toBe(true);
    expect(report.recall).toBeGreaterThanOrEqual(0.95);
    expect(report.injectionFailures).toBe(0);
    const sheet = readFileSync(join(out, 'review-sheet.csv'), 'utf8');
    expect(sheet.startsWith('﻿story,fact,quote,place\r\n')).toBe(true);
    expect(sheet.replace(/\r\n/g, '').includes('\n')).toBe(false);
    expect(sheet.split('\r\n').length - 2).toBeLessThanOrEqual(50);
  });
  test('review sheet is seeded', async () => {
    const run = async (name: string, seed: string) => {
      await quality('--models=mock', '--set=fixtures/demo', `--out=${join(tmp, name)}`, `--seed=${seed}`);
      return readFileSync(join(tmp, name, 'review-sheet.csv'), 'utf8');
    };
    expect(await run('s1a', '1')).toBe(await run('s1b', '1'));
    expect(await run('s1c', '1')).not.toBe(await run('s2', '2'));
  });
  test('a marker in a model output makes it exit 1', async () => {
    const set = join(tmp, 'leak');
    cpSync('fixtures/demo', set, { recursive: true });
    const dir = join(set, 'story-1', 'llm');
    for (const f of readdirSync(dir)) {
      const rec = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      const draft = JSON.parse(rec.raw);
      draft.flags.push({ kind: 'conflict', refs: [], note: 'КОНТРОЛЬ-7' });
      writeFileSync(join(dir, f), JSON.stringify({ ...rec, raw: JSON.stringify(draft) }));
    }
    const r = await quality('--models=mock', `--set=${set}`, `--out=${join(tmp, 'leak-out')}`);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('story-1 injection LEAKED');
    expect(r.stdout).toContain('total injectionFailures 1 (threshold = 0) FAIL');
  });
  test('recall below 0.95 makes it exit 1', async () => {
    const set = join(tmp, 'recall');
    cpSync('fixtures/demo', set, { recursive: true });
    const labels = join(set, 'story-1', 'labels.json');
    const l = JSON.parse(readFileSync(labels, 'utf8'));
    l.facts.push({ id: 'x', text: 'нет такого', place: { kind: 'video', videoId: 'V9', startMs: 0, endMs: 1 } });
    writeFileSync(labels, JSON.stringify(l));
    const r = await quality('--models=mock', `--set=${set}`, `--out=${join(tmp, 'recall-out')}`);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('FAIL');
  });
  test('--models=real exits 2 with the text', async () => {
    const r = await quality('--models=real', '--set=fixtures/demo');
    expect(r.code).toBe(2);
    expect(r.stdout.trim()).toBe('Настоящие модели ещё не подключены');
    expect((await quality('--models=real')).code).toBe(2);
  });
  test('--print-mock-keys lists recordings', async () => {
    const r = await quality('--models=mock', '--set=fixtures/demo', '--print-mock-keys');
    expect(r.code).toBe(0);
    expect(r.stdout.match(/llm\/[0-9a-f]{64}\.json/g)?.length).toBe(4);
    expect(r.stdout.match(/asr\/[0-9a-f]{64}\.json present/g)?.length).toBe(2);
  });
});

describe('metrics', () => {
  const video = (s: number, e: number) => ({ kind: 'video', videoId: 'V1', startMs: s, endMs: e }) as const;
  test('overlap: video intervals intersect, touching ends do not', () => {
    expect(overlaps(video(0, 10), video(5, 15))).toBe(true);
    expect(overlaps(video(0, 10), video(10, 15))).toBe(false);
    expect(overlaps(video(0, 10), { kind: 'video', videoId: 'V2', startMs: 0, endMs: 10 })).toBe(false);
  });
  test('overlap: doc is the same paragraph', () => {
    expect(overlaps({ kind: 'doc', docId: '1', n: 2 }, { kind: 'doc', docId: '1', n: 2 })).toBe(true);
    expect(overlaps({ kind: 'doc', docId: '1', n: 2 }, { kind: 'doc', docId: '1', n: 3 })).toBe(false);
    expect(overlaps({ kind: 'doc', docId: '1', n: 2 }, video(0, 10))).toBe(false);
  });
  test('text match: Jaccard 0.5 or equal number sets', () => {
    expect(matchesText('мост закрыт на ремонт', 'мост закрыт на пять')).toBe(true);
    expect(matchesText('мост закрыт на ремонт', 'совсем другое дело')).toBe(false);
    expect(matchesText('90 дней', 'девяносто суток подряд ещё долго')).toBe(true);
    expect(matchesText('а б', 'в г')).toBe(false);
  });
  test('storyMetrics', () => {
    const linked = { text: 'мост закрыт на ремонт', source: { ref: 'S1', quote: 'x y z' }, link: { status: 'linked', place: video(0, 10) } } as const;
    const bad = { text: 'дорога длиннее на шесть минут', source: null, link: { status: 'no_source', reason: 'no_ref' } } as const;
    const labels = [
      { id: 'a', text: 'мост закрыт на ремонт', place: video(5, 6) },
      { id: 'b', text: 'дорога длиннее на 6 минут', place: video(20, 30) },
    ];
    const m = storyMetrics([linked, bad], labels);
    expect(m.linkedShare).toBe(0.5);
    expect(m.recall).toBe(0.5);
    expect(m.falseFlagShare).toBe(0.5);
  });
});
