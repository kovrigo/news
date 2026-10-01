// Browser checks of the demo. Needs: demo state (made here), the server (paneweb up) and the paneweb browser (CDP).
// Prints one line per scenario; exits 1 when any fails.
import { readFileSync } from 'node:fs';
import { chromium, type BrowserContext, type Page } from 'playwright-core';

const run = (cmd: string[]): string => {
  const r = Bun.spawnSync(cmd, { stdout: 'pipe', stderr: 'pipe' });
  if (r.exitCode !== 0) throw new Error(`${cmd.join(' ')} exit ${r.exitCode}: ${r.stderr.toString()}`);
  return r.stdout.toString();
};

run(['bun', 'run', 'demo-reset']);
const up = run(['paneweb', 'up']);
const base = /\(local: (http:\/\/[^)]+)\)/.exec(up)?.[1];
if (!base) throw new Error(`no local URL in: ${up}`);
const cdp = run(['paneweb', 'browser']).trim().split('\n').pop()!;
const browser = await chromium.connectOverCDP(cdp);
const context: BrowserContext = browser.contexts()[0] ?? (await browser.newContext());

const BANNER = 'Демо на придуманных данных. Не загружайте и не вставляйте настоящие материалы.';
const DEMO_LINE = 'ДЕМО — придуманные данные, не для эфира';
let failed = 0;
const consoleErrors: string[] = [];

const check = (cond: unknown, msg: string): void => {
  if (!cond) throw new Error(msg);
};
const visible = async (page: Page, sel: string, msg: string, timeout = 5000): Promise<void> => {
  try {
    await page.locator(sel).first().waitFor({ state: 'visible', timeout });
  } catch {
    throw new Error(`not visible: ${msg} (${sel})`);
  }
};
const banner = async (page: Page): Promise<void> => {
  const t = await page.locator('.demo-banner [role="note"]').first().textContent({ timeout: 3000 });
  check(t?.trim() === BANNER, `banner missing or wrong on ${page.url()}`);
};
async function newPage(w: number, h: number): Promise<Page> {
  const page = await context.newPage();
  await page.setViewportSize({ width: w, height: h });
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text().slice(0, 200)));
  page.on('pageerror', (e) => {
    throw new Error(`page error: ${e.message}`);
  });
  return page;
}
async function login(page: Page, name: string): Promise<void> {
  await page.goto(base!);
  const out = page.getByRole('button', { name: 'Сменить роль' });
  if (await out.isVisible().catch(() => false)) await out.click();
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await visible(page, 'header.top .profile', 'top bar');
  await banner(page);
}
const draftLink = (page: Page, name: string) => page.locator('nav[aria-label="Черновики сюжета"]').getByRole('link', { name: new RegExp(`^${name}`) });
const openStory = async (page: Page, title: string, draft: string): Promise<void> => {
  await page.goto(`${base}#/`);
  await page.getByRole('link', { name: new RegExp(title) }).first().click();
  await visible(page, 'nav[aria-label="Черновики сюжета"]', 'drafts nav');
  await draftLink(page, draft).click();
  await visible(page, `section[aria-label="Черновик"] h2:has-text("${draft}")`, `sheet ${draft}`);
  await banner(page);
};
const pendingMarks = (page: Page) => page.locator('li.mark:not(.decided)');

const scenarios: Array<[string, () => Promise<void>]> = [];
const scenario = (name: string, fn: () => Promise<void>): void => void scenarios.push([name, fn]);

scenario('1280: correspondent resolves marks, edits, sends for review', async () => {
  const page = await newPage(1280, 800);
  await login(page, 'Ольга Демина');
  await visible(page, 'h2:has-text("Вам вернули")', 'block «Вам вернули»');
  await page.getByRole('link', { name: /Титры: Ремонт Старого моста/ }).click();
  await visible(page, '.band.returned', 'returned band');
  check((await page.locator('.band.returned').textContent())?.includes('У Нины Захаровой нет исходника'), 'comment in the band');
  // titles: the title without source goes away
  await page.locator('li.mark', { hasText: 'Титр без исходника' }).getByRole('button', { name: 'Удалить титр' }).click();
  await page.waitForFunction(() => document.querySelectorAll('li.mark:not(.decided)').length === 0, null, { timeout: 5000 });
  // voiceover: decide every mark
  await draftLink(page, 'Закадровый текст').click();
  await visible(page, 'li.mark', 'marks of the voiceover');
  let n = 0;
  while ((await pendingMarks(page).count()) > 0 && n++ < 10) {
    const m = pendingMarks(page).first();
    const label = (await m.locator('.what b').textContent()) ?? '';
    if (label.includes('Факт без исходника') && n === 1) {
      await m.getByRole('button', { name: 'Взять на себя' }).click();
      const dlg = page.getByRole('dialog');
      await dlg.waitFor();
      await dlg.getByRole('textbox').fill('Проверю при монтаже');
      await dlg.getByRole('button', { name: 'Взять на себя' }).click();
      await dlg.waitFor({ state: 'detached' });
    } else {
      await m.getByRole('button', { name: 'Удалить фразу' }).click();
    }
    await page.waitForTimeout(400);
  }
  check((await pendingMarks(page).count()) === 0, 'all marks decided');
  check((await page.locator('li.mark.decided').count()) >= 1, 'taken mark stays listed');
  check((await page.locator('.src.taken').count()) >= 1, '«Взято на себя» in the source column');
  // edit a sentence in place
  await page.getByRole('button', { name: 'Править черновик' }).click();
  const ta = page.locator('textarea[data-edit^="s:"]').first();
  await ta.fill('Старый мост через Тишму закрывают на капитальный ремонт с первого ноября.');
  await visible(page, 'text=Ищем исходник', '«Ищем исходник»', 6000);
  await visible(page, 'text=/Сохранено \\d\\d:\\d\\d/', '«Сохранено»', 6000);
  await page.waitForFunction(() => !document.body.textContent?.includes('Ищем исходник'), null, { timeout: 8000 });
  await page.getByRole('button', { name: 'Закончить правку' }).click();
  await page.getByRole('button', { name: 'Отправить на проверку' }).click();
  await visible(page, 'nav[aria-label="Черновики сюжета"] a:has-text("Закадровый текст") >> text=На проверке', 'state «На проверке»');
  await page.close();
});

scenario('1280: approver opens a source, approves, exports a text file', async () => {
  const page = await newPage(1280, 800);
  await login(page, 'Павел Тестов');
  await visible(page, 'h2:has-text("Ждут утверждения")', 'block «Ждут утверждения»');
  await page.getByRole('link', { name: /Закадровый текст: Ремонт Старого моста/ }).click();
  await visible(page, '.fact', 'a fact');
  await page.locator('.fact').first().focus();
  await page.keyboard.press('Enter');
  await page.locator('.right .frag.flash').first().waitFor({ state: 'attached', timeout: 1500 }).catch(async () => {
    throw new Error(`no flash; frags: ${await page.evaluate(() => document.querySelector('.right')?.innerHTML.slice(0, 1500))}; focus: ${await page.evaluate(() => document.activeElement?.className)}`);
  });
  await visible(page, '.right .frag.selected', 'selected fragment');
  await page
    .waitForFunction(() => {
      const r = document.querySelector('.right')!.getBoundingClientRect();
      const f = document.querySelector('.right .frag.selected')!.getBoundingClientRect();
      return f.top >= r.top - 1 && f.bottom <= r.bottom + 1;
    }, null, { timeout: 3000 })
    .catch(() => {
      throw new Error('the fragment is not scrolled into the source column');
    });
  check(/00:\d\d/.test((await page.locator('.right .controls .mono').first().textContent()) ?? ''), 'the player shows a time');
  await page.getByRole('button', { name: 'Утвердить закадровый текст' }).click();
  await visible(page, '.approval-mark:has-text("Павел Тестов")', 'approval mark');
  check((await page.locator('.approval-mark').textContent())?.includes('Автор последней правки: Ольга Демина'), 'last editor named');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Выгрузить в текстовый файл' }).click()]);
  const text = readFileSync((await download.path())!, 'utf8').replace(/^\uFEFF/, '');
  check(text.split('\r\n')[0] === DEMO_LINE, `first line of the export: ${text.split('\r\n')[0]}`);
  await page.close();
});

for (const [w, kind] of [[1000, 'panel'], [390, 'inline']] as const) {
  scenario(`${w}: open a fact's source (${kind}) and approve`, async () => {
    const page = await newPage(w, w === 390 ? 844 : 800);
    await login(page, 'Павел Тестов');
    const draft = w === 1000 ? 'Подводка' : 'Закадровый текст';
    await openStory(page, 'Ярмарка выходного дня', draft);
    if (w === 1000) {
      check((await page.locator('.right.closed').count()) === 1, 'the source panel is closed at first');
      await page.getByRole('button', { name: 'Меню' }).click();
      await visible(page, 'nav.open a:has-text("Справочник")', 'folded menu');
      await page.getByRole('button', { name: 'Меню' }).click();
    }
    await page.locator('.fact').first().click();
    if (w === 1000) {
      await visible(page, '.right:not(.closed) .frag.selected', 'source panel with the fragment');
      await page.getByRole('button', { name: 'Закрыть исходник' }).click();
      await page.locator('.right.closed').waitFor({ state: 'attached' });
    } else {
      await visible(page, '.inline-source .frag.selected', 'source under the fact');
      const h = await page.getByRole('button', { name: /^Утвердить / }).evaluate((e) => e.getBoundingClientRect().height);
      check(h >= 44, `target height ${h} >= 44`);
      const sx = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
      check(sx, 'no horizontal scroll at 390');
    }
    await page.getByRole('button', { name: /^Утвердить / }).click();
    await visible(page, '.approval-mark', 'approval mark');
    await page.close();
  });
}

scenario('axe: list, story screen and every dialog, banner on every page', async () => {
  const axePath = new URL('../node_modules/axe-core/axe.min.js', import.meta.url).pathname;
  const page = await newPage(1280, 800);
  const audit = async (what: string): Promise<void> => {
    await page.addScriptTag({ path: axePath });
    const res = await page.evaluate(async () => {
      // @ts-expect-error axe is injected
      const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] }, rules: { region: { enabled: true } } });
      if (r.passes.length < 10) return [`axe ran only ${r.passes.length} rules`];
      const ran = [...r.passes, ...r.violations].some((x: { id: string }) => x.id === 'region');
      if (!ran) return ['axe did not run the region rule'];
      return r.violations.map((v: { id: string; nodes: { target: unknown[] }[] }) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => String(n.target)).join(' | ')}`);
    });
    await banner(page);
    check(res.length === 0, `axe on ${what}: ${res.join('; ')}`);
  };
  await context.clearCookies();
  await page.goto(base!);
  await visible(page, 'ul[aria-label="Демо-учётные записи"]', 'login page');
  await audit('login page');
  await login(page, 'Ольга Демина');
  await page.getByRole('link', { name: 'Новый сюжет' }).first().click();
  await visible(page, 'h1:has-text("Новый сюжет")', 'new story');
  await audit('new story page');
  await login(page, 'Павел Тестов');
  await audit('list');
  await openStory(page, 'Открытие спортзала', 'Закадровый текст');
  await audit('story screen');
  await page.locator('.fact').first().click();
  await audit('story screen with a selected source');
  await page.getByRole('button', { name: 'Вернуть с комментарием' }).click();
  await visible(page, 'dialog[open]', 'return dialog');
  await audit('return dialog');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Выгрузить утверждённые' }).click();
  await visible(page, 'dialog[open]', 'export dialog');
  await audit('export dialog');
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Справочник' }).click();
  await visible(page, 'h1:has-text("Справочник")', 'directory');
  await audit('directory');
  await page.getByRole('link', { name: 'Журнал' }).click();
  await visible(page, 'h1:has-text("Журнал")', 'journal');
  await audit('journal');
  await login(page, 'Ольга Демина');
  await openStory(page, 'Открытие спортзала', 'Закадровый текст');
  await page.locator('li.mark', { hasText: 'Факт без исходника' }).getByRole('button', { name: 'Взять на себя' }).click();
  await visible(page, 'dialog[open]', 'take dialog');
  await audit('take dialog');
  await page.keyboard.press('Escape');
  await openStory(page, 'Летняя читальня', 'Подводка');
  await page.getByRole('button', { name: 'Править черновик' }).click();
  await visible(page, 'dialog[open]', 'edit warning');
  await audit('edit warning dialog');
  await page.keyboard.press('Escape');
  await login(page, 'Анна Пробная');
  await openStory(page, 'Летняя читальня', 'Подводка');
  await page.getByRole('button', { name: 'Ещё' }).click();
  await page.getByRole('button', { name: 'Удалить сюжет…' }).click();
  await visible(page, 'dialog[open]', 'delete dialog');
  await audit('delete dialog');
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Сотрудники' }).click();
  await visible(page, 'h1:has-text("Сотрудники")', 'staff');
  await audit('staff');
  await page.close();
});

scenario('offline: band, approve disabled, back online', async () => {
  const page = await newPage(1280, 800);
  await login(page, 'Павел Тестов');
  await openStory(page, 'Летняя читальня', 'Подводка');
  await context.setOffline(true);
  try {
    await visible(page, '.offline:has-text("Нет связи. Правки сохранятся, когда связь вернётся")', 'offline band');
    check((await page.getByRole('button', { name: 'Выгрузить в DOCX' }).getAttribute('aria-disabled')) === 'true', 'export disabled offline');
  } finally {
    await context.setOffline(false);
  }
  await page.waitForFunction(() => !document.querySelector('.offline'), null, { timeout: 8000 });
  await page.close();
});

scenario('offline draft: kept on reload, gone after demo-reset', async () => {
  const unsent = (p: Page): Promise<string[]> => p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('unsent:')));
  const page = await newPage(1280, 800);
  await login(page, 'Ольга Демина');
  await openStory(page, 'Открытие спортзала', 'Закадровый текст');
  await page.getByRole('button', { name: 'Править черновик' }).click();
  const ta = page.locator('textarea[data-edit^="s:"]').first();
  await ta.waitFor({ state: 'visible', timeout: 5000 });
  await context.setOffline(true);
  try {
    await ta.fill('Офлайн-правка, которую сброс должен убрать.');
    await page.waitForFunction(() => Object.keys(localStorage).some((k) => k.startsWith('unsent:')), null, { timeout: 8000 });
  } finally {
    await page.close();
    await context.setOffline(false);
  }
  const again = await newPage(1280, 800);
  await again.goto(base!);
  await visible(again, 'h1:has-text("Сюжеты")', 'list after reopening');
  check((await unsent(again)).length === 1, 'offline draft kept when reopened without a reset');
  await again.close();
  run(['bun', 'run', 'demo-reset']);
  const after = await newPage(1280, 800);
  await after.goto(base!);
  await visible(after, '.demo-banner [role="note"]', 'page after reset');
  await after.waitForFunction(() => !Object.keys(localStorage).some((k) => k.startsWith('unsent:')), null, { timeout: 8000 });
  check((await unsent(after)).length === 0, 'offline draft gone after demo-reset');
  await after.close();
});

scenario('1280: chief reads the journal and the staff page, deletes a story', async () => {
  const page = await newPage(1280, 800);
  await login(page, 'Анна Пробная');
  await page.getByRole('link', { name: 'Журнал' }).click();
  await visible(page, 'h1:has-text("Журнал")', 'journal');
  await banner(page);
  await page.getByLabel('Взяли на себя без исходника').check();
  await visible(page, 'td:has-text("Дорога по объезду")', 'taken fact in the journal');
  await page.getByRole('link', { name: 'Сотрудники' }).click();
  await visible(page, 'h1:has-text("Сотрудники")', 'staff');
  await visible(page, 'td:has-text("Ольга Демина")', 'staff row');
  await banner(page);
  await page.getByRole('link', { name: 'Сюжеты' }).click();
  await page.getByRole('link', { name: /Открытие спортзала/ }).click();
  await visible(page, 'button:has-text("Ещё")', 'delete menu');
  await page.getByRole('button', { name: 'Ещё' }).click();
  await page.getByRole('button', { name: 'Удалить сюжет…' }).click();
  await visible(page, 'dialog[open]', 'delete dialog');
  check((await page.evaluate(() => document.activeElement?.textContent)) === 'Отмена', 'focus starts on «Отмена»');
  await page.keyboard.press('Escape');
  await page.locator('dialog[open]').waitFor({ state: 'detached', timeout: 3000 });
  check((await page.evaluate(() => document.activeElement?.textContent)) === 'Удалить сюжет…', 'focus returns to the opener');
  await page.getByRole('button', { name: 'Удалить сюжет…' }).click();
  await page.getByRole('button', { name: 'Удалить сюжет навсегда' }).click();
  await visible(page, 'h1:has-text("Сюжеты")', 'list after delete');
  check((await page.getByRole('link', { name: /Открытие спортзала/ }).count()) === 0, 'the story disappeared');
  await page.close();
});

for (const [name, fn] of scenarios) {
  try {
    consoleErrors.length = 0;
    await fn();
    if (!name.startsWith('offline') && consoleErrors.length) throw new Error(`console errors: ${consoleErrors.join(' / ')}`);
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}: ${(e as Error).message.split('\n').slice(0, 4).join(' | ')}`);
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
