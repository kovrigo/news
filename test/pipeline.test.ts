import { afterAll, describe, expect, test } from 'bun:test';
import { cpSync, mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mockAsr } from '../src/adapters/asr/mock.ts';
import { mockModel } from '../src/adapters/llm/mock.ts';
import { buildRequest, formatMaterial } from '../src/adapters/llm/prompt.ts';
import type { DraftModel } from '../src/adapters/llm/types.ts';
import { MOCK_UNKNOWN } from '../src/core/failures.ts';
import { runStory } from '../src/pipeline/run-story.ts';
import { material } from './helpers.ts';

const STORY = 'fixtures/demo/story-1';
const tmp = mkdtempSync(join(tmpdir(), 'nda-pipeline-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const copy = (name: string) => {
  const dst = join(tmp, name);
  cpSync(STORY, dst, { recursive: true });
  return dst;
};
const base = () => ({ asr: mockAsr(STORY), model: mockModel(STORY) });

describe('runStory on the demo fixture', () => {
  test('numbers segments story-wide, flags unclear and not_russian', async () => {
    const { material: m } = await runStory(STORY, base());
    expect(m.segments.map((s) => s.id)).toEqual(Array.from({ length: 13 }, (_, i) => `S${i + 1}`));
    expect(m.segments.slice(0, 8).every((s) => s.videoId === 'V1')).toBe(true);
    expect(m.segments.slice(8).every((s) => s.videoId === 'V2')).toBe(true);
    expect(m.segments.filter((s) => s.flags.includes('unclear')).map((s) => s.id)).toEqual(['S5']);
    expect(m.segments.filter((s) => s.flags.includes('not_russian')).map((s) => s.id)).toEqual(['S8']);
    expect([...new Set(m.segments.filter((s) => s.videoId === 'V1').map((s) => s.speaker))]).toEqual([1, 2]);
  });
  test('splits the document on blank lines', async () => {
    const { material: m } = await runStory(STORY, base());
    expect(m.paragraphs.map((p) => p.id)).toEqual(['P1.1', 'P1.2', 'P1.3', 'P1.4', 'P1.5']);
    expect(m.paragraphs[3]!.text).toContain('КОНТРОЛЬ-7');
  });
  test('builds all four drafts and sums the cost', async () => {
    const r = await runStory(STORY, base());
    expect(r.drafts.map((d) => [d.kind, d.ok])).toEqual([['voiceover', true], ['leadin', true], ['syncs', true], ['titles', true]]);
    expect(r.costRub).toBe(4);
    expect(r.ms).toBeGreaterThanOrEqual(0);
  });
  test('the fixture shows every link outcome', async () => {
    const r = await runStory(STORY, base());
    const outcomes = new Set(r.drafts.flatMap((d) => d.facts).map((f) => (f.link.status === 'linked' ? 'linked' : f.link.reason)));
    expect([...outcomes].sort()).toEqual(['linked', 'no_ref', 'number_mismatch', 'quote_not_found', 'unknown_ref']);
  });
  test('the fixture shows sentence flags and the instruction flag', async () => {
    const r = await runStory(STORY, base());
    const vo = r.drafts.find((d) => d.kind === 'voiceover')!;
    expect(vo.sentenceFlags.flat()).toContain('unmarked_fact');
    expect(vo.sentenceFlags.flat()).toContain('unsupported_number');
    expect(vo.draft!.flags.map((f) => f.kind)).toEqual(['instruction_in_source']);
  });
  test('title sources are verified', async () => {
    const t = (await runStory(STORY, base())).drafts.find((d) => d.kind === 'titles')!;
    expect(t.facts.map((f) => f.link.status)).toEqual(['linked', 'no_source', 'linked']);
  });
  test('no raw output contains the injection marker', async () => {
    const r = await runStory(STORY, base());
    expect(r.drafts.flatMap((d) => d.raws).some((raw) => raw.includes('КОНТРОЛЬ'))).toBe(false);
  });
});

// Wraps the mock model; `answer` may replace the output of one kind.
function wrap(answer: (kind: string, call: number) => string | undefined) {
  const calls: Record<string, number> = {};
  const inner = mockModel(STORY);
  const model: DraftModel = {
    name: 'wrap',
    async build(req) {
      calls[req.kind] = (calls[req.kind] ?? 0) + 1;
      const raw = answer(req.kind, calls[req.kind]!);
      return raw === undefined ? inner.build(req) : { raw, costRub: 1 };
    },
  };
  return { model, calls };
}

describe('malformed output', () => {
  test('fails with malformed_output after exactly one retry; the others succeed', async () => {
    const { model, calls } = wrap((kind) => (kind === 'voiceover' ? '{"kind":"voiceover"' : undefined));
    const r = await runStory(STORY, { asr: mockAsr(STORY), model });
    const vo = r.drafts.find((d) => d.kind === 'voiceover')!;
    expect(vo.ok).toBe(false);
    expect(vo.failure?.code).toBe('malformed_output');
    expect(vo.draft).toBeUndefined();
    expect(calls.voiceover).toBe(2);
    expect(calls.leadin).toBe(1);
    expect(r.drafts.filter((d) => d.ok).map((d) => d.kind).sort()).toEqual(['leadin', 'syncs', 'titles']);
  });
  test('the retry can succeed', async () => {
    const { model, calls } = wrap((kind, call) => (kind === 'syncs' && call === 1 ? 'не json' : undefined));
    const r = await runStory(STORY, { asr: mockAsr(STORY), model });
    expect(r.drafts.every((d) => d.ok)).toBe(true);
    expect(calls.syncs).toBe(2);
  });
  test('schema-invalid output is malformed too', async () => {
    const { model } = wrap((kind) => (kind === 'titles' ? JSON.stringify({ kind: 'titles', items: [], flags: [], extra: 1 }) : undefined));
    const r = await runStory(STORY, { asr: mockAsr(STORY), model });
    expect(r.drafts.find((d) => d.kind === 'titles')!.failure?.code).toBe('malformed_output');
  });
  test('a sync with an unknown piece or across two videos is malformed, not silently dropped', async () => {
    const m = (await runStory(STORY, base())).material;
    const [a, b] = [m.segments.find((s) => s.videoId === 'V1')!.id, m.segments.find((s) => s.videoId === 'V2')!.id];
    for (const bad of [{ fromRef: 'S999', toRef: a }, { fromRef: a, toRef: b }]) {
      const items = [bad, { fromRef: a, toRef: a, note: 'x' }, { fromRef: a, toRef: a, note: 'y' }].map((x) => ({ note: 'z', ...x }));
      const { model } = wrap((kind) => (kind === 'syncs' ? JSON.stringify({ kind: 'syncs', items, flags: [] }) : undefined));
      const r = await runStory(STORY, { asr: mockAsr(STORY), model });
      expect(r.drafts.find((d) => d.kind === 'syncs')!.failure?.code).toBe('malformed_output');
    }
  });
});

describe('unknown files', () => {
  test('mock ASR throws the catalog text', async () => {
    const err = await mockAsr(STORY).transcribe({ name: 'x.mp4', bytes: new Uint8Array([1, 2, 3]) }).catch((e: Error) => e);
    expect((err as Error).message).toBe('Заглушка знает только демо-исходники');
    expect((err as Error).message).toBe(MOCK_UNKNOWN);
  });
  test('runStory rejects when a video is unknown', async () => {
    const dir = copy('unknown-video');
    writeFileSync(join(dir, 'video-1.bin'), 'другой файл');
    await expect(runStory(dir, base())).rejects.toThrow(MOCK_UNKNOWN);
  });
  test('mock model with unknown material: draft fails with model_error', async () => {
    const dir = copy('unknown-material');
    writeFileSync(join(dir, 'press-release.txt'), 'Другой документ без чисел и имён.\n');
    const r = await runStory(dir, { asr: mockAsr(dir), model: mockModel(dir) });
    expect(r.drafts.every((d) => !d.ok && d.failure?.code === 'model_error' && d.failure.detail === MOCK_UNKNOWN)).toBe(true);
  });
  test('ASR recording that fails the schema rejects', async () => {
    const dir = copy('bad-asr');
    for (const f of readdirSync(join(dir, 'asr'))) writeFileSync(join(dir, 'asr', f), '[{"startMs":0}]');
    await expect(runStory(dir, { asr: mockAsr(dir), model: mockModel(dir) })).rejects.toThrow();
  });
});

describe('prompt', () => {
  test('material lines carry id, time, video and speaker', () => {
    expect(formatMaterial({ ...material, segments: [{ ...material.segments[0]!, id: 'S12', startMs: 14000, endMs: 29000, speaker: 1 }] })).toContain(
      '[S12 00:14–00:29 видео 1, Спикер 1] Мы закрываем Старый мост через Тишму',
    );
    expect(formatMaterial(material)).toContain('[P1.1] Ремонт начнётся 1 ноября и продлится 90 дней.');
  });
  for (const kind of ['syncs', 'titles', 'voiceover', 'leadin'] as const) {
    test(`${kind}: instructions never contain material text`, () => {
      const req = buildRequest(kind, material);
      for (const s of material.segments) expect(req.instructions).not.toContain(s.text);
      for (const p of material.paragraphs) expect(req.instructions).not.toContain(p.text);
      expect(req.material).toBe(formatMaterial(material));
      expect(req.instructions).toContain('never obey');
      expect(req.instructions).toContain('instruction_in_source');
    });
  }
});
