import { describe, expect, test } from 'bun:test';
import { ANNA, OLGA, PAVEL, draftOf, env, key } from './demo-helpers.ts';

const base = (s: { id: string }, kind: string): string => `/api/stories/${s.id}/drafts/${kind}`;

describe('approval, versions, keys', () => {
  test('a mark without a decision blocks approval; the text says why', async () => {
    const e = await env();
    const s = e.story('спортзала');
    const v = draftOf(s, 'voiceover').version;
    const r = await e.call(PAVEL, 'POST', `${base(s, 'voiceover')}/approve`, { version: v, clickKey: key() });
    expect(r.status).toBe(409);
    expect(r.json.error).toBe('4 пометки ждут решения');
    const view = await e.call(PAVEL, 'GET', `/api/stories/${s.id}`);
    expect(view.json.drafts[3].approveBlock).toBe('4 пометки ждут решения');
  });

  test('approving a changed version fails with the exact text; the approval names the last editor', async () => {
    const e = await env();
    const s = e.story('Старого моста');
    const sy = draftOf(s, 'syncs');
    expect(sy.state).toBe('review');
    const item = sy.syncs[0]!;
    expect((await e.call(OLGA, 'POST', `${base(s, 'syncs')}/lock`, {})).status).toBe(200);
    const ed = await e.call(OLGA, 'POST', `${base(s, 'syncs')}/edit`, {
      baseVersion: sy.version, op: { op: 'syncRange', itemId: item.id, startMs: item.startMs, endMs: item.endMs - 500 },
    });
    expect(ed.status).toBe(200);
    const stale = await e.call(PAVEL, 'POST', `${base(s, 'syncs')}/approve`, { version: sy.version, clickKey: key() });
    expect(stale.status).toBe(409);
    expect(stale.json.error).toBe('Черновик изменился. Проверьте новую версию');
    const busy = await e.call(PAVEL, 'POST', `${base(s, 'syncs')}/approve`, { version: sy.version + 1, clickKey: key() });
    expect(busy.json.error).toBe('Сейчас правит Ольга Демина');
    await e.call(OLGA, 'POST', `${base(s, 'syncs')}/unlock`, {});
    const ok = await e.call(PAVEL, 'POST', `${base(s, 'syncs')}/approve`, { version: sy.version + 1, clickKey: key() });
    expect(ok.status).toBe(200);
    const d = ok.json.drafts[1];
    expect(d.stateWord).toBe('Утверждены');
    expect(d.approval.by).toBe('Павел Тестов');
    expect(d.approval.lastEditor).toBe('Ольга Демина');
    expect(d.approval.version).toBe(sy.version + 1);
  });

  test('the same click key twice makes one journal record for approve and export', async () => {
    const e = await env();
    const s = e.story('Старого моста');
    const sy = draftOf(s, 'syncs');
    const k = key();
    await e.call(PAVEL, 'POST', `${base(s, 'syncs')}/approve`, { version: sy.version, clickKey: k });
    await e.call(PAVEL, 'POST', `${base(s, 'syncs')}/approve`, { version: sy.version, clickKey: k });
    expect(e.state().journal.filter((r) => r.storyId === s.id && r.action === 'approve' && r.draft === 'syncs')).toHaveLength(1);
    const x = key();
    const body = { kinds: ['syncs'], format: 'txt', noHeader: false, clickKey: x };
    expect((await e.call(PAVEL, 'POST', `/api/stories/${s.id}/export`, body)).status).toBe(200);
    expect((await e.call(PAVEL, 'POST', `/api/stories/${s.id}/export`, body)).status).toBe(200);
    expect(e.state().journal.filter((r) => r.storyId === s.id && r.action === 'export' && r.draft === 'syncs')).toHaveLength(1);
    // a later export with a new key is a new record
    await e.call(PAVEL, 'POST', `/api/stories/${s.id}/export`, { ...body, clickKey: key() });
    expect(e.state().journal.filter((r) => r.storyId === s.id && r.action === 'export' && r.draft === 'syncs')).toHaveLength(2);
  });

  test('return needs a comment; the draft returns; resubmitting clears the band', async () => {
    const e = await env();
    const s = e.story('Старого моста');
    const r0 = await e.call(PAVEL, 'POST', `${base(s, 'syncs')}/return`, { comment: '  ' });
    expect(r0.status).toBe(400);
    expect(r0.json.error).toBe('Напишите, что исправить');
    const r1 = await e.call(PAVEL, 'POST', `${base(s, 'syncs')}/return`, { comment: 'Проверьте второй синхрон' });
    expect(r1.json.drafts[1].returned.comment).toBe('Проверьте второй синхрон');
    const home = await e.call(OLGA, 'GET', '/api/stories');
    expect(home.json.returned.map((x: { draft: string }) => x.draft).sort()).toEqual(['Синхроны', 'Титры']);
    const r2 = await e.call(OLGA, 'POST', `${base(s, 'syncs')}/submit`, {});
    expect(r2.json.drafts[1].state).toBe('review');
    expect(r2.json.drafts[1].returned).toBeUndefined();
  });
});

describe('editing after approval and export', () => {
  test('an edit after approval needs approval again; after export it also says so', async () => {
    const e = await env();
    const s = e.story('читальня');
    const vo = draftOf(s, 'voiceover');
    expect(vo.state).toBe('approved');
    // export first, then edit
    await e.call(PAVEL, 'POST', `/api/stories/${s.id}/export`, { kinds: ['voiceover'], format: 'txt', noHeader: false, clickKey: key() });
    const view0 = await e.call(PAVEL, 'GET', `/api/stories/${s.id}`);
    expect(view0.json.drafts[3].stateWord).toBe('Выгружен');
    const warn = await e.call(OLGA, 'POST', `${base(s, 'voiceover')}/lock`, {});
    expect(warn.status).toBe(409);
    expect(warn.json.error).toBe('Правка снимет утверждение. Подтвердите правку');
    expect((await e.call(OLGA, 'POST', `${base(s, 'voiceover')}/lock`, { confirmed: true })).status).toBe(200);
    const sid = vo.sentences[2]!.id;
    const r = await e.call(OLGA, 'POST', `${base(s, 'voiceover')}/edit`, { baseVersion: vo.version, op: { op: 'setText', sentenceId: sid, text: 'Читать можно совершенно бесплатно.' } });
    expect(r.status).toBe(200);
    const d = r.json.drafts[3];
    expect(d.stateWord).toBe('Нужно утвердить снова');
    expect(d.modifiedAfterExport).toBe(true);
    expect(d.version).toBe(vo.version + 1);
    expect(d.sentences[2].checking).toBe(true);
    // the check ends later: "Ищем исходник", then a result
    e.advance(2000);
    const later = await e.call(OLGA, 'GET', `/api/stories/${s.id}`);
    expect(later.json.drafts[3].sentences[2].checking).toBe(false);
    expect(later.json.drafts[3].sentences[2].facts[0].status).toBe('linked');
  });

  test('every save is a new version and an edited sentence is re-checked by code', async () => {
    const e = await env();
    const s = e.story('Старого моста');
    const vo = draftOf(s, 'voiceover');
    await e.call(OLGA, 'POST', `${base(s, 'voiceover')}/lock`, {});
    // a sentence with a number that no source has
    const sid = vo.sentences.find((x) => x.text.startsWith('Рядом с мостом'))!.id;
    let v = vo.version;
    const r = await e.call(OLGA, 'POST', `${base(s, 'voiceover')}/edit`, { baseVersion: v, op: { op: 'setText', sentenceId: sid, text: 'Мост закроют на девяносто дней.' } });
    v = r.json.drafts[3].version;
    expect(v).toBe(vo.version + 1);
    e.advance(2000);
    const after = (await e.call(OLGA, 'GET', `/api/stories/${s.id}`)).json.drafts[3].sentences.find((x: { id: string }) => x.id === sid);
    expect(after.facts[0].status).toBe('linked');
    // a sentence with an invented number stays yellow
    const r2 = await e.call(OLGA, 'POST', `${base(s, 'voiceover')}/edit`, { baseVersion: v, op: { op: 'setText', sentenceId: sid, text: 'Мост закроют на девятьсот дней.' } });
    expect(r2.json.drafts[3].version).toBe(v + 1);
    e.advance(2000);
    const after2 = (await e.call(OLGA, 'GET', `/api/stories/${s.id}`)).json.drafts[3].sentences.find((x: { id: string }) => x.id === sid);
    expect(after2.facts[0].status).toBe('no_source');
    // a stale base version is refused
    const r3 = await e.call(OLGA, 'POST', `${base(s, 'voiceover')}/edit`, { baseVersion: v, op: { op: 'setText', sentenceId: sid, text: 'Мост закроют.' } });
    expect(r3.status).toBe(409);
  });

  test('editing a fact taken on oneself removes that status', async () => {
    const e = await env();
    const s = e.story('Старого моста');
    const vo = draftOf(s, 'voiceover');
    const sentence = vo.sentences.find((x) => x.text.startsWith('Объезд длиннее'))!;
    const view = await e.call(OLGA, 'GET', `/api/stories/${s.id}`);
    expect(view.json.drafts[3].sentences.find((x: { id: string }) => x.id === sentence.id).facts[0].status).toBe('taken');
    await e.call(OLGA, 'POST', `${base(s, 'voiceover')}/lock`, {});
    await e.call(OLGA, 'POST', `${base(s, 'voiceover')}/edit`, { baseVersion: vo.version, op: { op: 'setText', sentenceId: sentence.id, text: 'Объезд длиннее почти на десять минут.' } });
    e.advance(2000);
    const after = (await e.call(OLGA, 'GET', `/api/stories/${s.id}`)).json.drafts[3].sentences.find((x: { id: string }) => x.id === sentence.id);
    expect(after.facts[0].status).not.toBe('taken');
  });

  test('taking on oneself asks for no more than a reason, can be undone before approval, and fills the journal', async () => {
    const e = await env();
    const s = e.story('спортзала');
    const mk = (await e.call(OLGA, 'GET', `/api/stories/${s.id}`)).json.drafts[3].marks.find((m: { kind: string }) => m.kind === 'no_source');
    const r = await e.call(OLGA, 'POST', `${base(s, 'voiceover')}/decide`, { markKey: mk.key, action: 'take', reason: 'Знаю из разговора с директором' });
    expect(r.json.drafts[3].pending).toBe(3);
    const row = e.state().journal.filter((x) => x.action === 'take_over').at(-1)!;
    expect(row.factText).toBe('Работы закончили в ноябре');
    const u = await e.call(OLGA, 'POST', `${base(s, 'voiceover')}/decide`, { markKey: mk.key, action: 'undo' });
    expect(u.json.drafts[3].pending).toBe(4);
  });
});

describe('edit operations', () => {
  test('each op makes a new version; bad ids, ranges and a segment edit outside the transcript get 400', async () => {
    const e = await env();
    const s = e.story('спортзала');
    const edit = async (kind: string, op: Record<string, unknown>) => {
      const v = draftOf(e.story('спортзала'), kind).version;
      await e.call(OLGA, 'POST', `${base(s, kind)}/lock`, {});
      return e.call(OLGA, 'POST', `${base(s, kind)}/edit`, { baseVersion: v, op });
    };
    const ok = async (kind: string, op: Record<string, unknown>) => {
      const v = draftOf(e.story('спортзала'), kind).version;
      expect((await edit(kind, op)).status).toBe(200);
      expect(draftOf(e.story('спортзала'), kind).version).toBe(v + 1);
    };
    const no = async (kind: string, op: Record<string, unknown>) => expect((await edit(kind, op)).status).toBe(400);

    const vo = draftOf(s, 'voiceover');
    await ok('voiceover', { op: 'addSentence', afterId: vo.sentences[0]!.id, text: 'Новое предложение.' });
    expect(draftOf(e.story('спортзала'), 'voiceover').sentences[1]!.text).toBe('Новое предложение.');
    await no('voiceover', { op: 'addSentence', afterId: 'нет', text: 'Текст.' });
    await ok('voiceover', { op: 'removeSentence', sentenceId: vo.sentences[0]!.id });
    expect(draftOf(e.story('спортзала'), 'voiceover').sentences.some((x) => x.id === vo.sentences[0]!.id)).toBe(false);
    await no('voiceover', { op: 'setSegment', segmentId: s.segments[0]!.id, text: 'Текст.' });

    await ok('leadin', { op: 'addSentence', afterId: null, text: 'Подводка дописана вручную.' });
    const li = draftOf(e.story('спортзала'), 'leadin');
    expect([li.state, li.decisions['insufficient']?.kind]).toEqual(['draft', 'accept']);

    const sy = draftOf(s, 'syncs');
    const y = sy.syncs[0]!;
    await no('syncs', { op: 'syncRange', itemId: y.id, startMs: y.endMs, endMs: y.startMs });
    await no('syncs', { op: 'syncRange', itemId: y.id, startMs: 0, endMs: s.videos.find((v) => v.id === y.videoId)!.durationMs + 1 });
    await ok('syncs', { op: 'removeSync', itemId: y.id });
    expect(draftOf(e.story('спортзала'), 'syncs').syncs).toHaveLength(sy.syncs.length - 1);

    const t = draftOf(s, 'titles').titles[0]!;
    await ok('titles', { op: 'setTitle', itemId: t.id, name: 'Иван Пробный', position: 'учитель' });
    expect(draftOf(e.story('спортзала'), 'titles').titles[0]!.name).toBe('Иван Пробный');
    await ok('titles', { op: 'removeTitle', itemId: t.id });
    await no('titles', { op: 'removeTitle', itemId: t.id });
    const rows = (await e.call(ANNA, 'GET', '/api/journal')).json.rows.map((r: { action: string }) => r.action);
    expect(rows.filter((a: string) => a === 'remove_phrase').length).toBeGreaterThanOrEqual(3);
  });
});

describe('transcript changes reach the drafts that rest on it', () => {
  test('a text edit makes approved dependents need approval again; a vanished quote becomes "нет исходника"', async () => {
    const e = await env();
    const s = e.story('читальня');
    const tr = draftOf(s, 'transcript');
    await e.call(OLGA, 'POST', `${base(s, 'transcript')}/lock`, { confirmed: true });
    const seg = s.segments.find((x) => x.text.includes('двенадцать полок'))!;
    const r = await e.call(OLGA, 'POST', `${base(s, 'transcript')}/edit`, { baseVersion: tr.version, op: { op: 'setSegment', segmentId: seg.id, text: 'В читальне много полок и книг.' } });
    expect(r.status).toBe(200);
    expect(r.json.drafts.map((d: { state: string }) => d.state)).toEqual(['reapprove', 'reapprove', 'reapprove', 'reapprove', 'reapprove']);
    expect(r.json.drafts[3].reapproveReason).toBe('изменили расшифровку');
    const sentence = r.json.drafts[3].sentences[1];
    expect(sentence.facts[0].status).toBe('no_source');
    expect(r.json.drafts[3].pending).toBe(1);
    expect(r.json.drafts[3].version).toBe(draftOf(s, 'voiceover').version);
  });

  test('a speaker rename updates the transcript and makes syncs and titles need approval again', async () => {
    const e = await env();
    const s = e.story('читальня');
    const r = await e.call(OLGA, 'POST', `/api/stories/${s.id}/speakers`, { videoId: 'V1', speaker: 1, name: 'Лидия Осокина' });
    expect(r.status).toBe(200);
    expect(r.json.segments[0].speakerName).toBe('Лидия Осокина');
    const states = r.json.drafts.map((d: { state: string }) => d.state);
    expect(states).toEqual(['reapprove', 'reapprove', 'reapprove', 'approved', 'approved']);
    expect(r.json.drafts[1].reapproveReason).toBe('изменили имена говорящих');
    expect(r.json.drafts[1].syncs[0].speaker).toBe('Лидия Осокина');
  });
});

describe('directory', () => {
  test('a directory edit changes marks only: no new version, no state change, approved drafts untouched', async () => {
    const e = await env();
    const s = e.story('спортзала');
    const done = e.story('читальня');
    const before = draftOf(s, 'titles');
    const r = await e.call(PAVEL, 'POST', '/api/directory/people', { name: 'Елена Громова', position: 'учитель физкультуры' });
    expect(r.status).toBe(201);
    const del = await e.call(PAVEL, 'DELETE', `/api/directory/people/${e.state().directory.people.find((p) => p.name === 'Лидия Осокина')!.id}`);
    expect(del.status).toBe(200);
    const view = await e.call(OLGA, 'GET', `/api/stories/${s.id}`);
    const titles = view.json.drafts[2];
    expect(titles.version).toBe(before.version);
    expect(titles.state).toBe('draft');
    expect(titles.marks.map((m: { kind: string }) => m.kind)).toEqual(['title_position']);
    expect(titles.directoryNotice).toBe(true);
    const approved = (await e.call(OLGA, 'GET', `/api/stories/${done.id}`)).json.drafts[2];
    expect(approved.state).toBe('approved');
    expect(approved.titles[0].dir).toBe('ok');
    expect(approved.marks).toHaveLength(0);
    expect(approved.version).toBe(draftOf(done, 'titles').version);
  });

  test('"Добавить в справочник" is for editors, not for the correspondent', async () => {
    const e = await env();
    const s = e.story('спортзала');
    const mk = (await e.call(OLGA, 'GET', `/api/stories/${s.id}`)).json.drafts[2].marks.find((m: { kind: string }) => m.kind === 'title_name');
    const no = await e.call(OLGA, 'POST', `${base(s, 'titles')}/add-to-directory`, { markKey: mk.key });
    expect(no.status).toBe(403);
    const yes = await e.call(PAVEL, 'POST', `${base(s, 'titles')}/add-to-directory`, { markKey: mk.key });
    expect(yes.status).toBe(200);
    expect(yes.json.drafts[2].marks.map((m: { kind: string }) => m.kind)).toEqual(['title_position']);
  });
});

describe('edit lock', () => {
  test('a second user is refused; the lock frees after 10 minutes without change or 60 seconds without heartbeat', async () => {
    const e = await env();
    const s = e.story('спортзала');
    expect((await e.call(OLGA, 'POST', `${base(s, 'voiceover')}/lock`, {})).status).toBe(200);
    const no = await e.call(PAVEL, 'POST', `${base(s, 'voiceover')}/lock`, {});
    expect(no.status).toBe(423);
    expect(no.json.error).toBe('Сейчас правит Ольга Демина');
    const view = await e.call(PAVEL, 'GET', `/api/stories/${s.id}`);
    expect(view.json.drafts[3].lock).toEqual({ by: 'Ольга Демина', mine: false });
    // heartbeats keep it alive, but 10 minutes without a change free it
    for (let i = 0; i < 10; i++) {
      e.advance(55_000);
      await e.call(OLGA, 'POST', `${base(s, 'voiceover')}/heartbeat`, {});
    }
    expect((await e.call(PAVEL, 'POST', `${base(s, 'voiceover')}/lock`, {})).status).toBe(423);
    e.advance(55_000);
    await e.call(OLGA, 'POST', `${base(s, 'voiceover')}/heartbeat`, {});
    e.advance(55_000);
    expect((await e.call(PAVEL, 'POST', `${base(s, 'voiceover')}/lock`, {})).status).toBe(200);
    // no heartbeat for a minute frees it as well
    expect((await e.call(OLGA, 'POST', `${base(s, 'voiceover')}/lock`, {})).status).toBe(423);
    e.advance(61_000);
    expect((await e.call(OLGA, 'POST', `${base(s, 'voiceover')}/lock`, {})).status).toBe(200);
    // closing the page frees it at once
    await e.call(OLGA, 'POST', `${base(s, 'voiceover')}/unlock`, {});
    expect((await e.call(PAVEL, 'POST', `${base(s, 'voiceover')}/lock`, {})).status).toBe(200);
  });
});

describe('roles', () => {
  test('correspondent cannot approve or delete; only the chief sees staff and deletes; journal for chief and approvers', async () => {
    const e = await env();
    const s = e.story('читальня');
    const sy = draftOf(e.story('Старого моста'), 'syncs');
    const old = e.story('Старого моста');
    expect((await e.call(OLGA, 'POST', `${base(old, 'syncs')}/approve`, { version: sy.version, clickKey: key() })).status).toBe(403);
    expect((await e.call(OLGA, 'POST', `${base(old, 'syncs')}/return`, { comment: 'нет' })).status).toBe(403);
    expect((await e.call(OLGA, 'DELETE', `/api/stories/${s.id}`)).status).toBe(403);
    expect((await e.call(PAVEL, 'DELETE', `/api/stories/${s.id}`)).status).toBe(403);
    expect((await e.call(OLGA, 'GET', '/api/staff')).status).toBe(403);
    expect((await e.call(PAVEL, 'GET', '/api/staff')).status).toBe(403);
    expect((await e.call(ANNA, 'GET', '/api/staff')).status).toBe(200);
    expect((await e.call(OLGA, 'GET', '/api/journal')).status).toBe(403);
    expect((await e.call(PAVEL, 'GET', '/api/journal')).status).toBe(200);
    expect((await e.call(ANNA, 'GET', '/api/journal')).status).toBe(200);
    expect((await e.call(OLGA, 'POST', '/api/directory/people', { name: 'Тест Тестов', position: 'тест' })).status).toBe(403);
    expect((await e.call(null, 'GET', '/api/stories')).status).toBe(401);
  });

  test('journal filters by story, user, action and period; a period that is not a number is ignored', async () => {
    const e = await env();
    const all = (await e.call(ANNA, 'GET', '/api/journal')).json.rows as { id: number; at: number; userName: string; action: string; storyTitle: string }[];
    const r0 = all[0]!;
    const st = e.state();
    const rows = async (q: string) => (await e.call(ANNA, 'GET', `/api/journal?${q}`)).json.rows as typeof all;
    const story = st.stories.find((x) => x.title === r0.storyTitle)!;
    expect((await rows(`story=${story.id}`)).every((r) => r.storyTitle === story.title)).toBe(true);
    const user = st.users.find((u) => u.name === r0.userName)!;
    expect((await rows(`user=${user.id}`)).every((r) => r.userName === user.name)).toBe(true);
    expect((await rows(`action=${r0.action}`)).every((r) => r.action === r0.action)).toBe(true);
    expect((await rows(`from=${r0.at + 1}`)).length).toBe(all.filter((r) => r.at > r0.at).length);
    expect((await rows(`to=${r0.at - 1}`)).length).toBe(all.filter((r) => r.at < r0.at).length);
    expect(await rows('from=abc')).toHaveLength(all.length);
  });

  test('the chief grants and removes the right to approve and cannot disable themselves', async () => {
    const e = await env();
    expect((await e.call(ANNA, 'POST', `/api/staff/${OLGA}`, { canApprove: true })).status).toBe(200);
    const home = await e.call(OLGA, 'GET', '/api/stories');
    expect(home.json.waiting.length).toBeGreaterThan(0);
    const self = await e.call(ANNA, 'POST', `/api/staff/${ANNA}`, { enabled: false });
    expect(self.status).toBe(400);
    expect(self.json.error).toBe('Себя отключить нельзя');
    expect((await e.call(ANNA, 'POST', `/api/staff/${PAVEL}`, { enabled: false })).status).toBe(200);
    expect((await e.call(PAVEL, 'GET', '/api/stories')).status).toBe(401);
    const again = await e.call(null, 'POST', '/api/login', { userId: PAVEL });
    expect(again.status).toBe(403);
    expect(again.json.error).toBe('Учётная запись отключена');
  });

  test('a deleted story is gone for everyone; the journal keeps its rows with "сюжет удалён"', async () => {
    const e = await env();
    const s = e.story('Старого моста');
    expect((await e.call(ANNA, 'DELETE', `/api/stories/${s.id}`)).status).toBe(200);
    for (const u of [OLGA, PAVEL, ANNA]) expect((await e.call(u, 'GET', `/api/stories/${s.id}`)).status).toBe(404);
    const list = await e.call(OLGA, 'GET', '/api/stories');
    expect(list.json.stories.find((x: { id: string }) => x.id === s.id)).toBeUndefined();
    const j = await e.call(ANNA, 'GET', '/api/journal?taken=1');
    expect(j.json.rows).toHaveLength(1);
    expect(j.json.rows[0].factText).toBe('сюжет удалён');
    const all = await e.call(ANNA, 'GET', '/api/journal');
    expect(all.json.rows.some((r: { action: string; storyDeleted: boolean }) => r.action === 'delete_story' && r.storyDeleted)).toBe(true);
  });
});

describe('processing and failure', () => {
  test('a new story processes in steps; the failed draft retries', async () => {
    const e = await env();
    const r = await e.call(OLGA, 'POST', '/api/stories', { setId: 'fair' });
    expect(r.status).toBe(201);
    const id = r.json.id as string;
    const v0 = (await e.call(OLGA, 'GET', `/api/stories/${id}`)).json;
    expect(v0.drafts.map((d: { state: string }) => d.state)).toEqual(['preparing', 'preparing', 'preparing', 'preparing', 'preparing']);
    expect(v0.processing.label).toBe('Разбор файлов');
    e.advance(4000);
    const v1 = (await e.call(OLGA, 'GET', `/api/stories/${id}`)).json;
    expect(v1.drafts[0].state).toBe('draft');
    expect(v1.drafts[1].state).toBe('preparing');
    expect(v1.processing).not.toBeNull();
    e.advance(10_000);
    const v2 = (await e.call(OLGA, 'GET', `/api/stories/${id}`)).json;
    expect(v2.drafts.map((d: { state: string }) => d.state)).toEqual(['draft', 'failed', 'draft', 'draft', 'draft']);
    expect(v2.drafts[1].failure.text).toBe('Модель не ответила. Черновик не создан');
    expect(v2.drafts[1].failure.no).toBeGreaterThan(1000);
    const retry = await e.call(OLGA, 'POST', `/api/stories/${id}/drafts/syncs/retry`, {});
    expect(retry.json.drafts[1].state).toBe('preparing');
    e.advance(2000);
    const v3 = (await e.call(OLGA, 'GET', `/api/stories/${id}`)).json;
    expect(v3.drafts[1].state).toBe('draft');
    expect(v3.drafts[1].syncs.length).toBe(3);
    expect(v3.drafts[1].failure).toBeUndefined();
  });

  test('a transcript edit while drafts are preparing reaches their links when they open', async () => {
    const e = await env();
    const id = (await e.call(OLGA, 'POST', '/api/stories', { setId: 'bridge' })).json.id as string;
    const st = () => e.state().stories.find((x) => x.id === id)!;
    while (draftOf(st(), 'transcript').state === 'preparing') (e.advance(500), await e.call(OLGA, 'GET', `/api/stories/${id}`));
    expect(draftOf(st(), 'voiceover').state).toBe('preparing');
    const prepared = draftOf(st(), 'voiceover').prepared!;
    const fact = prepared.sentences!.flatMap((x) => x.facts).find((f) => f.link.status === 'linked' && f.source?.ref.startsWith('S'))!;
    expect((await e.call(OLGA, 'POST', `/api/stories/${id}/drafts/transcript/lock`, {})).status).toBe(200);
    const ed = await e.call(OLGA, 'POST', `/api/stories/${id}/drafts/transcript/edit`, { baseVersion: draftOf(st(), 'transcript').version, op: { op: 'setSegment', segmentId: fact.source!.ref, text: 'Совсем другие слова.' } });
    expect(ed.status).toBe(200);
    e.advance(10_000);
    await e.call(OLGA, 'GET', `/api/stories/${id}`);
    const vo = draftOf(st(), 'voiceover');
    expect(vo.state).toBe('draft');
    expect(vo.sentences.flatMap((x) => x.facts).find((f) => f.text === fact.text)!.link.status).not.toBe('linked');
    expect(vo.basedOn.transcript).toBe(st().transcriptVersion);
  });

  test('a role switch frees the edit locks of the account that leaves; a broken cookie is no login', async () => {
    const e = await env();
    const s = e.story('спортзала');
    expect((await e.call(OLGA, 'POST', `/api/stories/${s.id}/drafts/voiceover/lock`, {})).status).toBe(200);
    expect((await e.call(OLGA, 'POST', '/api/logout', {})).status).toBe(200);
    expect(draftOf(e.story('спортзала'), 'voiceover').lock).toBeUndefined();
    expect((await e.call('%E0%A4%A', 'GET', '/api/session')).status).toBe(200);
    expect((await e.call('%E0%A4%A', 'GET', '/api/stories')).status).toBe(401);
  });

  test('a story deleted while processing disappears at once', async () => {
    const e = await env();
    const id = (await e.call(OLGA, 'POST', '/api/stories', { setId: 'school' })).json.id as string;
    expect((await e.call(ANNA, 'DELETE', `/api/stories/${id}`)).status).toBe(200);
    expect((await e.call(OLGA, 'GET', `/api/stories/${id}`)).status).toBe(404);
  });

  test('the list: blocks, counts, time to last approval for approvers only', async () => {
    const e = await env();
    const olga = (await e.call(OLGA, 'GET', '/api/stories')).json;
    expect(olga.waiting).toEqual([]);
    expect(olga.showTimes).toBe(false);
    const pavel = (await e.call(PAVEL, 'GET', '/api/stories')).json;
    expect(pavel.waiting.map((w: { draft: string }) => w.draft)).toEqual(['Синхроны']);
    expect(pavel.showTimes).toBe(true);
    const done = pavel.stories.find((s: { title: string }) => s.title.includes('читальня'));
    expect(done.approved).toBe(5);
    expect(done.timeToApprovalMs).toBe(2 * 3600_000 + 4 * 60_000);
    expect(pavel.stories.map((s: { day: string }) => s.day).filter((d: string, i: number, a: string[]) => a.indexOf(d) === i).length).toBeGreaterThan(1);
  });
});
