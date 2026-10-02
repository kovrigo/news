// Speed of the local demo in the paneweb browser at 1280×800. Needs the server (paneweb up) and the paneweb browser.
// Five rounds on the seed state, five on the seed plus a long journal; each round starts from demo-reset.
// Prints the median and the range of every step in ms; exits 1 when a step fails. Leaves the demo reset.
import { chromium, type Page } from 'playwright-core';
import { loadState, saveState, statePath } from '../src/demo/state.ts';

const ROUNDS = Number(process.env.ROUNDS ?? 5);
const BIG_ROWS = 7000; // about 1.8 MB of state, under the 2 MB limit

const run = (cmd: string[]): string => {
  const r = Bun.spawnSync(cmd, { stdout: 'pipe', stderr: 'pipe' });
  if (r.exitCode !== 0) throw new Error(`${cmd.join(' ')} exit ${r.exitCode}: ${r.stderr.toString()}`);
  return r.stdout.toString();
};
const base = /\(local: (http:\/\/[^)]+)\)/.exec(run(['paneweb', 'up']))?.[1];
if (!base) throw new Error('no local URL from paneweb up');
const browser = await chromium.connectOverCDP(run(['paneweb', 'browser']).trim().split('\n').pop()!);
const context = browser.contexts()[0] ?? (await browser.newContext());
const host = new URL(base).hostname;
const as = (user: string) => context.addCookies([{ name: 'demo_user', value: user, domain: host, path: '/' }]);

// Copies of the seed's own journal rows, older than the seed, until the journal has BIG_ROWS more.
function growJournal(): number {
  const s = loadState(statePath());
  const oldest = Math.min(...s.journal.map((r) => r.at));
  const sample = s.journal.slice();
  for (let i = 0; i < BIG_ROWS; i++) s.journal.push({ ...sample[i % sample.length]!, id: ++s.seq, at: oldest - (i + 1) * 60_000 });
  saveState(statePath(), s);
  return Bun.file(statePath()).size;
}

const ms = (page: Page): Promise<number> => page.evaluate(() => performance.now());
// time of the last finished request to an API path, as the browser saw it
const api = (page: Page, part: string): Promise<number> =>
  page.evaluate((p) => Math.round(performance.getEntriesByType('resource').filter((r) => r.name.includes(p)).pop()?.duration ?? NaN), part);
let at = '';
async function step(page: Page, act: () => Promise<unknown>, done: () => Promise<unknown>): Promise<number> {
  at = new Error().stack!.split('\n')[2]!.trim();
  const t = await ms(page);
  await act();
  await done();
  return Math.round((await ms(page)) - t);
}
// checked every frame: a locator wait polls up to 500 ms apart and would add that to the step
const shown = (page: Page, sel: string, text = '') =>
  page.waitForFunction(([s, t]) => [...document.querySelectorAll<HTMLElement>(s)].some((e) => e.getClientRects().length > 0 && e.innerText.includes(t)), [sel, text] as const, { timeout: 15000 });

type Sample = Record<string, number>;
async function round(cpu: number): Promise<Sample> {
  const r: Sample = {};
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  page.on('pageerror', (e) => console.error(`page error: ${e.message}`));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.clearBrowserCache');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });

  // first screen, cold cache, as the approver
  await as('u-pavel');
  await page.goto(`${base}#/`);
  await shown(page, 'h2', 'Ждут утверждения');
  r['first: list shown'] = Math.round(await ms(page));
  Object.assign(r, await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? NaN;
    const res = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const kb = (f: (x: PerformanceResourceTiming) => boolean) => Math.round(res.filter(f).reduce((a, x) => a + x.encodedBodySize, 0) / 1024);
    return {
      'first: TTFB': Math.round(n.responseStart - n.requestStart),
      'first: FCP': Math.round(fcp),
      'first: DOMContentLoaded': Math.round(n.domContentLoadedEventEnd),
      'first: load': Math.round(n.loadEventEnd),
      'first: JS KB': kb((x) => x.name.endsWith('.js')),
      'first: CSS KB': kb((x) => x.name.endsWith('.css')),
      'first: requests': res.length,
    };
  }));
  r['first: LCP'] = await page.evaluate(() => new Promise<number>((res) => {
    new PerformanceObserver((l) => res(Math.round(l.getEntries().pop()!.startTime))).observe({ type: 'largest-contentful-paint', buffered: true });
    setTimeout(() => res(NaN), 3000);
  }));
  r['api: GET /api/stories'] = await api(page, '/api/stories');

  // open a story from the list
  r['story: open'] = await step(page, () => page.getByRole('link', { name: /Синхроны: Ремонт Старого моста/ }).click(), () => shown(page, '.fact'));
  r['api: GET story'] = await api(page, '/api/stories/');

  // approve, then both exports
  r['approve: mark shown'] = await step(page, () => page.getByRole('button', { name: /^Утвердить / }).click(), () => shown(page, '.approval-mark'));
  r['api: POST approve'] = await api(page, '/approve');
  for (const [name, f] of [['DOCX', 'Выгрузить в DOCX'], ['TXT', 'Выгрузить в текстовый файл']] as const) {
    r[`export ${name}: file ready`] = await step(page, async () => {
      const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: f }).click()]);
      await d.path();
    }, async () => undefined);
    r[`api: POST export ${name}`] = await api(page, '/export');
  }

  // journal: first page of rows
  r['journal: rows shown'] = await step(page, () => page.getByRole('link', { name: 'Журнал' }).click(), () => shown(page, 'main table tbody tr'));
  r['api: GET /api/journal'] = await api(page, '/api/journal');
  r['journal: rows'] = await page.locator('main table tbody tr').count();
  const more = page.getByRole('button', { name: /^Показать ещё/ });
  if (await more.count()) {
    const n = r['journal: rows'];
    r['journal: show more'] = await step(page, () => more.click(), () => page.waitForFunction((k) => document.querySelectorAll('main table tbody tr').length > k, n, { timeout: 15000 }));
  }

  // edit as the correspondent: take the draft, type, wait for «Сохранено» (the page waits 1.5 s after the last key)
  await as('u-olga');
  await page.goto(`${base}#/`);
  await shown(page, 'h2', 'Вам вернули');
  await page.getByRole('link', { name: /Титры: Ремонт Старого моста/ }).click();
  await shown(page, '.band.returned');
  await page.locator('nav[aria-label="Черновики сюжета"]').getByRole('link', { name: /^Закадровый текст/ }).click();
  await shown(page, 'section[aria-label="Черновик"] h2', 'Закадровый текст');
  r['edit: start'] = await step(page, () => page.getByRole('button', { name: 'Править черновик' }).click(), () => shown(page, 'textarea[data-edit^="s:"]'));
  r['edit: saved'] = await step(
    page,
    () => page.locator('textarea[data-edit^="s:"]').first().fill('Старый мост через Тишму закрывают на капитальный ремонт с первого ноября.'),
    () => shown(page, '[role="status"], .save', 'Сохранено '),
  );
  r['api: POST edit'] = await api(page, '/edit');
  await page.close();
  return r;
}

const med = (xs: number[]): number => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
let failed = 0;
// CPU 4: the page runs four times slower, closer to an ordinary office laptop than this server
for (const [big, cpu] of [[false, 1], [true, 1], [false, 4], [true, 4]] as const) {
  const rounds: Sample[] = [];
  let size = 0;
  for (let i = 0; i < ROUNDS; i++) {
    run(['bun', 'run', 'demo-reset']);
    size = big ? growJournal() : Bun.file(statePath()).size;
    try {
      rounds.push(await round(cpu));
    } catch (e) {
      failed++;
      console.log(`FAIL ${big ? 'big' : 'seed'} round ${i + 1} after ${at}: ${(e as Error).message.split('\n')[0]}`);
      for (const p of context.pages()) if (!p.url().startsWith('about:')) await p.close();
    }
  }
  console.log(`\n${big ? `seed + ${BIG_ROWS} journal rows` : 'seed'}, CPU ×${cpu}: state ${Math.round(size / 1024)} KB, ${rounds.length} rounds, median [min–max]`);
  for (const k of Object.keys(rounds[0] ?? {})) {
    const xs = rounds.map((r) => r[k]!);
    console.log(`  ${k}: ${med(xs)} [${Math.min(...xs)}–${Math.max(...xs)}]`);
  }
}
await browser.close();
run(['bun', 'run', 'demo-reset']);
process.exit(failed ? 1 : 0);
