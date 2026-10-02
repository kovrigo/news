// Regression: ISSUE-001 — the role line kept «право утверждать» after the chief editor took the right away
// Found by /qa on 2026-10-01
// Report: .gstack/qa-reports/qa-report-127-0-0-1-2026-10-01.md
import { expect, test } from 'bun:test';
import { ANNA, OLGA, PAVEL, env } from './demo-helpers.ts';

const label = (staff: { id: string; roleLabel: string }[], id: string): string | undefined => staff.find((u) => u.id === id)?.roleLabel;

test('the role line names the right to approve only while the person has it', async () => {
  const e = await env();
  const before = await e.call(ANNA, 'GET', '/api/staff');
  expect(label(before.json.staff, PAVEL)).toBe('выпускающий редактор, право утверждать');
  expect(label(before.json.staff, OLGA)).toBe('корреспондент');
  expect(label(before.json.staff, ANNA)).toBe('главный редактор');

  await e.call(ANNA, 'POST', `/api/staff/${PAVEL}`, { canApprove: false });
  const after = await e.call(ANNA, 'POST', `/api/staff/${OLGA}`, { canApprove: true });
  expect(label(after.json.staff, PAVEL)).toBe('выпускающий редактор');
  expect(label(after.json.staff, OLGA)).toBe('корреспондент, право утверждать');

  // the login screen and the top bar read the same line
  const session = await e.call(PAVEL, 'GET', '/api/session');
  expect(session.json.user.roleLabel).toBe('выпускающий редактор');
  expect(label(session.json.accounts, OLGA)).toBe('корреспондент, право утверждать');
});
