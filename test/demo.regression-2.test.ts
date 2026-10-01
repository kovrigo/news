// Regression: ISSUE-005 — two stories made from one set had the same name in the journal's story filter
// Found by /qa on 2026-10-01
// Report: .gstack/qa-reports/qa-report-127-0-0-1-2026-10-01.md
import { expect, test } from 'bun:test';
import { OLGA, PAVEL, env } from './demo-helpers.ts';

test('stories with one title differ by upload time in the journal filter; other titles stay plain', async () => {
  const e = await env();
  const seeded = e.story('Ярмарка');
  e.advance(5 * 60_000);
  const made = await e.call(OLGA, 'POST', '/api/stories', { setId: 'fair' });
  expect(made.status).toBe(201);

  const j = await e.call(PAVEL, 'GET', '/api/journal');
  const fair = j.json.stories.filter((s: { title: string }) => s.title.startsWith('Ярмарка выходного дня в Берёзовке'));
  expect(fair).toHaveLength(2);
  expect(new Set(fair.map((s: { title: string }) => s.title)).size).toBe(2);
  const old = fair.find((s: { id: string }) => s.id === seeded.id);
  expect(old.title).toMatch(/^Ярмарка выходного дня в Берёзовке, загружен \d+ \S+ \d{4}, \d\d:\d\d$/);
  expect(j.json.stories.find((s: { title: string }) => s.title.startsWith('Летняя читальня')).title).toBe('Летняя читальня на набережной');

  // after one of them is deleted its rows stay, and both names stay apart
  expect((await e.call('u-anna', 'DELETE', `/api/stories/${made.json.id}`)).status).toBe(200);
  const after = await e.call(PAVEL, 'GET', '/api/journal');
  expect(after.json.stories.filter((s: { title: string }) => s.title.startsWith('Ярмарка')).map((s: { title: string }) => s.title)).toEqual(fair.map((s: { title: string }) => s.title));
});
