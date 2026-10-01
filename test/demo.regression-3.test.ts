// Regression: ISSUE-006 — «Дописать вручную» decided the «Материала мало» mark without a journal row
// Found by /qa on 2026-10-01
// Report: .gstack/qa-reports/qa-report-127-0-0-1-2026-10-01.md
import { expect, test } from 'bun:test';
import { OLGA, PAVEL, draftOf, env } from './demo-helpers.ts';

test('writing a not-built draft by hand journals the decision once and the edit once', async () => {
  const e = await env();
  const s = e.story('спортзала');
  const path = `/api/stories/${s.id}/drafts/leadin`;
  expect(draftOf(s, 'leadin').state).toBe('not_built');
  const before = e.state().journal.length;

  expect((await e.call(OLGA, 'POST', `${path}/lock`, {})).status).toBe(200);
  const v = draftOf(s, 'leadin').version;
  const one = await e.call(OLGA, 'POST', `${path}/edit`, { baseVersion: v, op: { op: 'addSentence', afterId: null, text: 'Спортзал в школе номер семь откроют в субботу.' } });
  expect(one.status).toBe(200);
  const first = e.state().journal.slice(before);
  const sid = draftOf(e.story('спортзала'), 'leadin').sentences[0]!.id;
  const two = await e.call(OLGA, 'POST', `${path}/edit`, { baseVersion: v + 1, op: { op: 'addSentence', afterId: sid, text: 'Занятия начнутся в понедельник.' } });
  expect(two.status).toBe(200);

  const rows = e.state().journal.slice(before).filter((r) => r.draft === 'leadin');
  expect(first.map((r) => r.action).sort()).toEqual(['accept_asis', 'edit']);
  expect(rows.filter((r) => r.action === 'accept_asis')).toHaveLength(1);
  expect(rows.filter((r) => r.action === 'edit')).toHaveLength(1);
  expect(rows.find((r) => r.action === 'accept_asis')!.userName).toBe('Ольга Демина');

  // the approver reads it in the journal as «Принял(а) как есть»
  const j = await e.call(PAVEL, 'GET', `/api/journal?story=${s.id}&action=accept_asis`);
  expect(j.json.rows).toHaveLength(1);
  expect(j.json.rows[0].actionLabel).toBe('Принял(а) как есть');
  expect(j.json.rows[0].detail).toBe('дописано вручную');
  expect(j.json.rows[0].draft).toBe('Подводка');
});
