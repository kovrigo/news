import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from '../src/demo/api.ts';
import { refuseStart } from '../src/demo/boundary.ts';
import { buildSeed } from '../src/demo/seed.ts';
import { saveState, STATE_MAX } from '../src/demo/state.ts';
import { ANNA, NOW, OLGA, PAVEL, draftOf, env } from './demo-helpers.ts';

const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []));

describe('boundary 1: no upload', () => {
  test('no upload route exists, multipart is not read, no file input in the UI', async () => {
    const e = await env();
    for (const p of ['/api/upload', '/api/uploads', '/api/stories/upload', '/api/files', '/upload']) {
      for (const m of ['POST', 'PUT', 'GET']) expect((await e.call(OLGA, m, p, m === 'GET' ? undefined : {})).status).toBe(404);
    }
    const sources = files('src').filter((f) => !f.startsWith('src/core') && !f.startsWith('src/adapters') && !f.startsWith('src/pipeline'));
    for (const f of sources) {
      const text = readFileSync(f, 'utf8');
      expect([f, /formData\(|multipart|type="file"|type='file'|FileReader|<input[^>]*type=\{?["']file/i.test(text)]).toEqual([f, false]);
    }
    const api = readFileSync('src/demo/api.ts', 'utf8');
    expect(api).not.toMatch(/arrayBuffer\(|\.blob\(\)/);
  });
});

describe('boundary 2: mock only', () => {
  test('MODELS other than mock stops the start with the exact text and exit code 2', async () => {
    expect(refuseStart({ MODELS: 'real', PORT: '1234' })).toBe('Демо работает только на заглушках: MODELS=real не поддерживается');
    expect(refuseStart({ MODELS: 'mock', PORT: '1234' })).toBeNull();
    expect(refuseStart({ PORT: '1234' })).toBeNull();
    // The real process: it exits before it listens (PORT is not even set, so nothing can start).
    const p = Bun.spawn(['bun', 'run', 'src/demo/server.ts'], { env: { ...process.env, MODELS: 'real', PORT: '' }, stderr: 'pipe', stdout: 'pipe' });
    expect(await p.exited).toBe(2);
    expect((await new Response(p.stderr).text()).trim()).toBe('Демо работает только на заглушках: MODELS=real не поддерживается');
  });

  test('no adapter module other than the mocks, no network client in src', () => {
    const adapters = files('src/adapters').map((f) => f.replace(/\\/g, '/'));
    expect(adapters.filter((f) => !/\/(mock|types|prompt)\.ts$/.test(f))).toEqual([]);
    const bad = /from ['"](node:)?(http|https|http2|net|tls|dgram|dns)['"]|from ['"](axios|node-fetch|undici|ws|got|openai|@anthropic-ai\/[^'"]+)['"]|new WebSocket|XMLHttpRequest|EventSource|sendBeacon|Bun\.connect|Bun\.spawn|Bun\.\$|child_process/;
    for (const f of files('src')) {
      const text = readFileSync(f, 'utf8');
      expect([f, bad.test(text)]).toEqual([f, false]);
      if (f !== 'src/demo/server.ts') expect([f, /Bun\.serve/.test(text)]).toEqual([f, false]);
      // the browser may call the demo's own server, nothing else
      if (!f.startsWith('src/demo/ui/') && f !== 'src/demo/server.ts') expect([f, /\bfetch\(/.test(text)]).toEqual([f, false]);
    }
    for (const f of files('src/demo/ui')) for (const m of readFileSync(f, 'utf8').matchAll(/fetch\(([^)]*)\)/g)) expect(m[1]).not.toMatch(/https?:/);
  });
});

describe('boundary 3: every body is checked', () => {
  test('unknown fields, oversize bodies, unknown ids and long text get 400 with a Russian reason', async () => {
    const e = await env();
    const s = e.story('спортзала');
    const d = draftOf(s, 'voiceover');
    const p = `/api/stories/${s.id}/drafts/voiceover`;
    const bad = async (u: string, method: string, path: string, body: unknown): Promise<string> => {
      const r = await e.call(u, method, path, body);
      expect(r.status).toBe(400);
      expect(r.json.error).toMatch(/[а-яё]/i);
      return r.json.error;
    };
    await e.call(OLGA, 'POST', `${p}/lock`, {});
    await bad(OLGA, 'POST', `${p}/lock`, { extra: 1 });
    await bad(OLGA, 'POST', `${p}/edit`, { baseVersion: d.version, op: { op: 'setText', sentenceId: 's1', text: 'a', extra: true } });
    await bad(OLGA, 'POST', `${p}/edit`, { baseVersion: d.version, extra: 1, op: { op: 'setText', sentenceId: 's1', text: 'a' } });
    await bad(OLGA, 'POST', '/api/login', { userId: 'u-olga', password: 'x' });
    await bad(OLGA, 'POST', '/api/login', { userId: 'nobody' });
    await bad(OLGA, 'POST', `${p}/edit`, { baseVersion: d.version, op: { op: 'setText', sentenceId: 'zzz', text: 'Текст' } });
    await bad(OLGA, 'POST', `${p}/decide`, { markKey: 'nosrc:zzz:0', action: 'take' });
    await bad(OLGA, 'POST', '/api/stories', { setId: 'нет-такого' });
    await bad(OLGA, 'POST', `${p}/edit`, { baseVersion: d.version, op: { op: 'setSource', sentenceId: d.sentences[0]!.id, factIndex: 0, ref: 'S999' } });
    expect(await bad(OLGA, 'POST', `${p}/edit`, { baseVersion: d.version, op: { op: 'setText', sentenceId: d.sentences[0]!.id, text: 'я'.repeat(301) } })).toBe('Предложение длиннее 300 знаков');
    expect(await bad(PAVEL, 'POST', `${p}/return`, { comment: 'я'.repeat(501) })).toBe('Комментарий и причина не длиннее 500 знаков');
    expect(await bad(PAVEL, 'POST', `${p}/decide`, { markKey: 'x', action: 'take', reason: 'я'.repeat(501) })).toBe('Комментарий и причина не длиннее 500 знаков');
    expect(await bad(PAVEL, 'POST', '/api/directory/people', { name: 'я'.repeat(121), position: 'x' })).toBe('Поле не длиннее 120 знаков');
    expect(await bad(PAVEL, 'POST', '/api/directory/places', { name: 'я'.repeat(121) })).toBe('Поле не длиннее 120 знаков');
    await bad(PAVEL, 'POST', '/api/directory/places', 'not json');
    const big = await e.call(OLGA, 'POST', `${p}/edit`, { baseVersion: d.version, op: { op: 'setText', sentenceId: 's1', text: 'я'.repeat(9000) } });
    expect(big.status).toBe(400);
    expect(big.json.error).toBe('Запрос слишком большой. Демо принимает только короткий текст');
    expect((await e.call(ANNA, 'POST', `/api/staff/${PAVEL}`, { role: 'chief' })).status).toBe(400);
    expect((await e.call(OLGA, 'GET', '/api/stories/nope')).status).toBe(404);
  });
});

describe('boundary 4 and 5: accounts and banner', () => {
  test('login is a choice of three accounts without a password; every export carries the demo line', async () => {
    const e = await env();
    const r = await e.call(null, 'GET', '/api/session');
    expect(r.json.accounts.map((a: { name: string }) => a.name)).toEqual(['Ольга Демина', 'Павел Тестов', 'Анна Пробная']);
    expect(r.json.banner).toBe('Демо на придуманных данных. Не загружайте и не вставляйте настоящие материалы.');
    const login = await e.call(null, 'POST', '/api/login', { userId: OLGA });
    expect(login.res.headers.get('set-cookie')).toContain('demo_user=u-olga');
    const html = readFileSync('src/demo/ui/index.html', 'utf8');
    expect(html).toContain('role="note"');
    expect(html).toContain('Демо на придуманных данных. Не загружайте и не вставляйте настоящие материалы.');
  });

  test('the server binds only to 127.0.0.1 and reads the port from PORT', () => {
    const server = readFileSync('src/demo/server.ts', 'utf8');
    expect(server).toContain("hostname: '127.0.0.1'");
    expect(server).toContain('Number(process.env.PORT)');
    expect(refuseStart({})).toBe('Не задан PORT. Запускайте демо командой `paneweb up`');
  });
});

describe('boundary 6: the state file', () => {
  test('overlapping requests do not lose writes', async () => {
    const e = await env();
    const before = e.state().directory.people.length;
    const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => e.call(PAVEL, 'POST', '/api/directory/people', { name: `Проба ${i}`, position: 'проба' })));
    expect(rs.map((r) => r.status)).toEqual(Array(20).fill(201));
    expect(e.state().directory.people.length - before).toBe(20);
  });

  test('every reset gets a new reset id, and the session gives it to the browser', async () => {
    const e = await env();
    expect((await e.call(null, 'GET', '/api/session')).json.resetId).toBe(e.state().resetId);
    expect((await buildSeed(NOW)).resetId).not.toBe((await buildSeed(NOW)).resetId);
  });

  test('without the state file every call answers 503 with the reset command', async () => {
    const e = await env();
    rmSync(e.path);
    const r = await e.call(OLGA, 'GET', '/api/session');
    expect(r.status).toBe(503);
    expect(r.json.error).toBe('Состояние демо не создано. Выполните: bun run demo-reset');
  });

  test('a damaged state file answers 503 with the reset command, not a crash', async () => {
    const e = await env();
    writeFileSync(e.path, '{');
    const r = await e.call(OLGA, 'GET', '/api/session');
    expect(r.status).toBe(503);
    expect(r.json.error).toBe('Файл состояния демо повреждён. Выполните: bun run demo-reset');
  });
  test('a change that would grow the file past 2 MB is refused; deleting still works', async () => {
    const e = await env();
    const st = e.state();
    const row = st.journal[0]!;
    const n = Math.ceil((STATE_MAX - Buffer.byteLength(JSON.stringify(st))) / Buffer.byteLength(JSON.stringify(row)));
    for (let i = 0; i < n; i++) st.journal.push({ ...row, id: 10_000 + i });
    saveState(e.path, st);
    const r = await e.call(PAVEL, 'POST', '/api/directory/places', { name: 'Ещё одно место' });
    expect(r.status).toBe(409);
    expect(r.json.error).toBe('Демо заполнено: файл состояния больше 2 МБ. Удалите лишние сюжеты или выполните: bun run demo-reset');
    expect((await e.call(ANNA, 'GET', '/api/stories')).status).toBe(200);
    expect((await e.call(ANNA, 'DELETE', `/api/stories/${e.story('спортзала').id}`)).status).toBe(200);
  });
});

describe('boundary 7: requests and typed text', () => {
  test('only this machine\'s own host name is answered', async () => {
    const e = await env();
    const app = createApp({ statePath: e.path });
    expect((await app.fetch(new Request('http://evil.example:3000/api/session'))).status).toBe(403);
    expect((await app.fetch(new Request('http://localhost:3000/api/session'))).status).toBe(200);
    const post = (origin: string) => app.fetch(new Request('http://127.0.0.1:3000/api/login', { method: 'POST', body: JSON.stringify({ userId: OLGA }), headers: { origin } }));
    expect((await post('http://evil.example')).status).toBe(403);
    expect((await post('http://127.0.0.1:3000')).status).toBe(200);
    expect(refuseStart({ PORT: 'abc' })).toBe('Не задан PORT. Запускайте демо командой `paneweb up`');
    expect(readFileSync('src/demo/server.ts', 'utf8')).toContain('maxRequestBodySize: BODY_MAX');
  });

  test('a correspondent cannot delete from the directory, and the file stays as it was', async () => {
    const e = await env();
    const before = readFileSync(e.path, 'utf8');
    const id = e.state().directory.people[0]!.id;
    expect((await e.call(OLGA, 'DELETE', `/api/directory/people/${id}`)).status).toBe(403);
    expect(readFileSync(e.path, 'utf8')).toBe(before);
  });

  test('control characters are dropped from typed text; an export names each draft once', async () => {
    const e = await env();
    const s = e.story('спортзала');
    const d = draftOf(s, 'voiceover');
    const p = `/api/stories/${s.id}/drafts/voiceover`;
    await e.call(OLGA, 'POST', `${p}/lock`, {});
    const r = await e.call(OLGA, 'POST', `${p}/edit`, { baseVersion: d.version, op: { op: 'setText', sentenceId: d.sentences[0]!.id, text: 'Спортзал\u0001 открыли\u0000.' } });
    expect(r.status).toBe(200);
    expect(draftOf(e.story('спортзала'), 'voiceover').sentences[0]!.text).toBe('Спортзал открыли.');
    const x = await e.call(PAVEL, 'POST', `/api/stories/${s.id}/export`, { kinds: ['voiceover', 'voiceover'], format: 'txt', noHeader: false, clickKey: 'k-12345678' });
    expect(x.status).toBe(400);
  });
});
