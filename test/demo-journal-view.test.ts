import { expect, test } from 'bun:test';
import { OLGA, PAVEL, draftOf, env } from './demo-helpers.ts';

test('a chosen source shows in the journal as the source and the place, not the fragment id', async () => {
  const e = await env();
  const s = e.story('Старого моста');
  const vo = draftOf(s, 'voiceover');
  const sid = vo.sentences.find((x) => x.text.startsWith('Рядом с мостом'))!.id;
  const ref = s.paragraphs[0]!.id;
  const r = await e.call(OLGA, 'POST', `/api/stories/${s.id}/drafts/voiceover/edit`, { baseVersion: vo.version, op: { op: 'setSource', sentenceId: sid, factIndex: 0, ref } });
  expect(r.status).toBe(200);
  const row = (await e.call(PAVEL, 'GET', '/api/journal')).json.rows.find((x: { action: string }) => x.action === 'set_source');
  expect(row.detail).toMatch(/, Абзац \d+$/);
  expect(row.detail).not.toContain(ref);
});
