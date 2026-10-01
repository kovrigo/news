// Regression: ISSUE-008 — through the board's address (tailnet name behind an https proxy) every API call got 403
// Found by /qa on 2026-10-01
// Report: .gstack/qa-reports/qa-report-127-0-0-1-2026-10-01.md
import { expect, test } from 'bun:test';
import { createApp } from '../src/demo/api.ts';
import { OLGA, env } from './demo-helpers.ts';

const NAME = 'demo-box.tail0000.ts.net';

test('the tailnet name is answered and its https page may change things; other names and origins still get 403', async () => {
  const e = await env();
  const app = createApp({ statePath: e.path, hosts: [NAME] });
  const get = (host: string) => app.fetch(new Request(`http://${host}/api/session`));
  expect((await get(`${NAME}:21435`)).status).toBe(200);
  expect((await get('127.0.0.1:21435')).status).toBe(200);
  expect((await get('evil.example:21435')).status).toBe(403);
  expect((await get(`x.${NAME}:21435`)).status).toBe(403);

  // the proxy talks http to the demo, the page itself is https on the same name and port
  const login = (origin: string) =>
    app.fetch(new Request(`http://${NAME}:21435/api/login`, { method: 'POST', body: JSON.stringify({ userId: OLGA }), headers: { origin } }));
  const ok = await login(`https://${NAME}:21435`);
  expect(ok.status).toBe(200);
  expect(ok.headers.get('set-cookie')).toContain('demo_user=u-olga; Path=/; HttpOnly; SameSite=Strict');
  expect((await login(`https://${NAME}:22001`)).status).toBe(403);
  expect((await login('https://evil.example')).status).toBe(403);
  expect((await login('null')).status).toBe(403);

  // without the name the server keeps answering only its local names
  const local = createApp({ statePath: e.path });
  expect((await local.fetch(new Request(`http://${NAME}:21435/api/session`))).status).toBe(403);
});
