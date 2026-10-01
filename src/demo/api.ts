import type { z } from 'zod';
import { runSet } from './domain/build.ts';
import { acquireLock, editOp, heartbeat, releaseLock, renameSpeaker } from './domain/edit.ts';
import { exportDrafts } from './domain/export.ts';
import { addToDirectory, approveDraft, canEditDirectory, decide, deleteStory, recheckSentence, retryDraft, returnDraft, setNotNeeded, startStory, submitDraft, syncDirectory } from './domain/flow.ts';
import { findStory } from './domain/journal.ts';
import { deletePerson, deletePlace, savePerson, savePlace, updateStaff } from './domain/ops.ts';
import { tick } from './domain/tick.ts';
import { DemoError, KINDS, type Ctx, type Draft, type Kind, type State, type Story, type User } from './domain/types.ts';
import { journalView, listView, publicUser, storyView } from './domain/view.ts';
import * as S from './schemas.ts';
import { SETS, setById } from './sets.ts';
import { statSync } from 'node:fs';
import { BAD_STATE, loadState, NO_STATE, saveState, STATE_FULL, STATE_MAX, stateExists } from './state.ts';
import { BANNER, E } from './texts.ts';

export type AppDeps = { statePath: string; now?: () => number };
type Call = {
  req: Request;
  url: URL;
  params: string[];
  body: unknown;
  state: State;
  now: number;
  user: User | null;
  reload: () => void;
  dirty: boolean;
};
type Route = { method: string; re: RegExp; auth: boolean; run: (c: Call) => Response | Promise<Response> };

const json = (data: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const fail = (status: number, error: string): Response => json({ error }, status);

function parse<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const r = schema.safeParse(body);
  if (!r.success) throw new DemoError(400, S.reason(r.error));
  return r.data;
}

const COOKIE = 'demo_user';
const cookieUser = (req: Request): string | null => {
  const m = /(?:^|;\s*)demo_user=([^;]+)/.exec(req.headers.get('cookie') ?? '');
  try {
    return m ? decodeURIComponent(m[1]!) : null;
  } catch {
    return null; // a broken cookie is no login
  }
};

export function createApp(deps: AppDeps): { fetch: (req: Request) => Promise<Response> } {
  const clock = deps.now ?? Date.now;

  const ctxOf = (c: Call): Ctx => ({ now: c.now, user: c.user! });
  const draftOf = (story: Story, kind: string): Draft => {
    if (!(KINDS as readonly string[]).includes(kind)) throw new DemoError(400, E.noDraft);
    return story.drafts.find((d) => d.kind === (kind as Kind))!;
  };
  // Runs one action on a draft and answers with the fresh story view.
  const onDraft = (fn: (c: Call, story: Story, d: Draft) => void): Route['run'] => (c) => {
    const story = findStory(c.state, c.params[0]!);
    fn(c, story, draftOf(story, c.params[1]!));
    c.dirty = true;
    return json(storyView(c.state, ctxOf(c), story));
  };

  const routes: Route[] = [
    { method: 'GET', re: /^\/api\/session$/, auth: false, run: (c) => json({ user: c.user && publicUser(c.user), accounts: c.state.users.map(publicUser), banner: BANNER, resetId: c.state.resetId }) },
    {
      method: 'POST', re: /^\/api\/login$/, auth: false,
      run: (c) => {
        const { userId } = parse(S.login, c.body);
        const u = c.state.users.find((x) => x.id === userId);
        if (!u) return fail(400, E.noUser);
        if (!u.enabled) return fail(403, E.disabled);
        return json({ user: publicUser(u) }, 200, { 'set-cookie': `${COOKIE}=${encodeURIComponent(u.id)}; Path=/; HttpOnly; SameSite=Strict` });
      },
    },
    {
      method: 'POST', re: /^\/api\/logout$/, auth: false,
      run: (c) => {
        parse(S.empty, c.body);
        // a role switch must not leave this account's edit locks behind
        for (const s of c.user ? c.state.stories : []) for (const d of s.drafts) if (d.lock?.userId === c.user!.id) (releaseLock(ctxOf(c), d), (c.dirty = true));
        return json({ ok: true }, 200, { 'set-cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0` });
      },
    },
    { method: 'GET', re: /^\/api\/sets$/, auth: true, run: () => json({ sets: SETS.map(({ id, title, description, videoNames, docNames }) => ({ id, title, description, videoNames, docNames })) }) },
    { method: 'GET', re: /^\/api\/stories$/, auth: true, run: (c) => json(listView(c.state, ctxOf(c))) },
    {
      method: 'POST', re: /^\/api\/stories$/, auth: true,
      run: async (c) => {
        const { setId } = parse(S.newStory, c.body);
        const set = setById(setId);
        if (!set) return fail(400, E.noSet);
        const result = await runSet(set, set.failKind);
        c.reload();
        if (!c.user) return fail(401, E.needLogin);
        const story = startStory(c.state, ctxOf(c), set, result);
        c.dirty = true;
        return json({ id: story.id }, 201);
      },
    },
    {
      method: 'GET', re: /^\/api\/stories\/([\w-]+)$/, auth: true,
      run: (c) => {
        const story = findStory(c.state, c.params[0]!);
        if (syncDirectory(c.state, story)) c.dirty = true;
        return json(storyView(c.state, ctxOf(c), story));
      },
    },
    {
      method: 'DELETE', re: /^\/api\/stories\/([\w-]+)$/, auth: true,
      run: (c) => {
        parse(S.empty, c.body);
        deleteStory(c.state, ctxOf(c), findStory(c.state, c.params[0]!));
        c.dirty = true;
        return json({ ok: true });
      },
    },
    {
      method: 'POST', re: /^\/api\/stories\/([\w-]+)\/speakers$/, auth: true,
      run: (c) => {
        const b = parse(S.speakers, c.body);
        const story = findStory(c.state, c.params[0]!);
        renameSpeaker(c.state, ctxOf(c), story, b.videoId, b.speaker, b.name);
        c.dirty = true;
        return json(storyView(c.state, ctxOf(c), story));
      },
    },
    {
      method: 'POST', re: /^\/api\/stories\/([\w-]+)\/drafts\/(\w+)\/lock$/, auth: true,
      run: onDraft((c, _s, d) => acquireLock(c.state, ctxOf(c), d, parse(S.lock, c.body).confirmed === true)),
    },
    { method: 'POST', re: /^\/api\/stories\/([\w-]+)\/drafts\/(\w+)\/heartbeat$/, auth: true, run: onDraft((c, _s, d) => (parse(S.empty, c.body), heartbeat(ctxOf(c), d))) },
    { method: 'POST', re: /^\/api\/stories\/([\w-]+)\/drafts\/(\w+)\/unlock$/, auth: true, run: onDraft((c, _s, d) => (parse(S.empty, c.body), releaseLock(ctxOf(c), d))) },
    {
      method: 'POST', re: /^\/api\/stories\/([\w-]+)\/drafts\/(\w+)\/edit$/, auth: true,
      run: onDraft((c, story, d) => {
        const b = parse(S.edit, c.body);
        editOp(c.state, ctxOf(c), story, d, b.baseVersion, b.op);
      }),
    },
    {
      method: 'POST', re: /^\/api\/stories\/([\w-]+)\/drafts\/(\w+)\/decide$/, auth: true,
      run: onDraft((c, story, d) => {
        const b = parse(S.decide, c.body);
        decide(c.state, ctxOf(c), story, d, b.markKey, b.action, b.reason, b.ref);
      }),
    },
    { method: 'POST', re: /^\/api\/stories\/([\w-]+)\/drafts\/(\w+)\/recheck$/, auth: true, run: onDraft((c, _s, d) => recheckSentence(ctxOf(c), d, parse(S.recheck, c.body).sentenceId)) },
    { method: 'POST', re: /^\/api\/stories\/([\w-]+)\/drafts\/(\w+)\/add-to-directory$/, auth: true, run: onDraft((c, s, d) => addToDirectory(c.state, ctxOf(c), s, d, parse(S.addDir, c.body).markKey)) },
    { method: 'POST', re: /^\/api\/stories\/([\w-]+)\/drafts\/(\w+)\/submit$/, auth: true, run: onDraft((c, s, d) => (parse(S.empty, c.body), submitDraft(c.state, ctxOf(c), s, d))) },
    {
      method: 'POST', re: /^\/api\/stories\/([\w-]+)\/drafts\/(\w+)\/approve$/, auth: true,
      run: onDraft((c, s, d) => {
        const b = parse(S.approve, c.body);
        approveDraft(c.state, ctxOf(c), s, d, b.version, b.clickKey);
      }),
    },
    { method: 'POST', re: /^\/api\/stories\/([\w-]+)\/drafts\/(\w+)\/return$/, auth: true, run: onDraft((c, s, d) => returnDraft(c.state, ctxOf(c), s, d, parse(S.returnDraft, c.body).comment)) },
    { method: 'POST', re: /^\/api\/stories\/([\w-]+)\/drafts\/(\w+)\/not-needed$/, auth: true, run: onDraft((c, s, d) => setNotNeeded(c.state, ctxOf(c), s, d, parse(S.notNeeded, c.body).on)) },
    {
      method: 'POST', re: /^\/api\/stories\/([\w-]+)\/drafts\/(\w+)\/retry$/, auth: true,
      run: async (c) => {
        parse(S.empty, c.body);
        const set = setById(findStory(c.state, c.params[0]!).setId);
        if (!set) return fail(400, E.noSet);
        const result = await runSet(set);
        c.reload();
        if (!c.user) return fail(401, E.needLogin);
        return onDraft((cc, s, d) => retryDraft(cc.state, ctxOf(cc), s, d, result))(c);
      },
    },
    {
      method: 'POST', re: /^\/api\/stories\/([\w-]+)\/export$/, auth: true,
      run: (c) => {
        const b = parse(S.exportBody, c.body);
        const file = exportDrafts(c.state, ctxOf(c), findStory(c.state, c.params[0]!), b);
        c.dirty = true;
        return new Response(new Blob([file.bytes as BlobPart]), {
          headers: {
            'content-type': file.mime,
            'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
            'x-file-name': encodeURIComponent(file.name),
            'cache-control': 'no-store',
          },
        });
      },
    },
    {
      method: 'GET', re: /^\/api\/journal$/, auth: true,
      run: (c) => {
        if (!c.user!.canApprove && c.user!.role !== 'chief') return fail(403, E.forbidden);
        const q = c.url.searchParams;
        const num = (k: string): number | undefined => (q.get(k) && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : undefined);
        return json(journalView(c.state, {
          story: q.get('story') || undefined, user: q.get('user') || undefined, action: q.get('action') || undefined,
          from: num('from'), to: num('to'), taken: q.get('taken') === '1', limit: num('limit'),
        }));
      },
    },
    { method: 'GET', re: /^\/api\/directory$/, auth: true, run: (c) => json({ ...c.state.directory, canEdit: canEditDirectory(ctxOf(c)) }) },
    { method: 'POST', re: /^\/api\/directory\/people$/, auth: true, run: (c) => (savePerson(c.state, ctxOf(c), null, parse(S.person, c.body)), (c.dirty = true), json(c.state.directory, 201)) },
    { method: 'PUT', re: /^\/api\/directory\/people\/([\w-]+)$/, auth: true, run: (c) => (savePerson(c.state, ctxOf(c), c.params[0]!, parse(S.person, c.body)), (c.dirty = true), json(c.state.directory)) },
    { method: 'DELETE', re: /^\/api\/directory\/people\/([\w-]+)$/, auth: true, run: (c) => (parse(S.empty, c.body), deletePerson(c.state, ctxOf(c), c.params[0]!), (c.dirty = true), json(c.state.directory)) },
    { method: 'POST', re: /^\/api\/directory\/places$/, auth: true, run: (c) => (savePlace(c.state, ctxOf(c), null, parse(S.place, c.body)), (c.dirty = true), json(c.state.directory, 201)) },
    { method: 'PUT', re: /^\/api\/directory\/places\/([\w-]+)$/, auth: true, run: (c) => (savePlace(c.state, ctxOf(c), c.params[0]!, parse(S.place, c.body)), (c.dirty = true), json(c.state.directory)) },
    { method: 'DELETE', re: /^\/api\/directory\/places\/([\w-]+)$/, auth: true, run: (c) => (parse(S.empty, c.body), deletePlace(c.state, ctxOf(c), c.params[0]!), (c.dirty = true), json(c.state.directory)) },
    {
      method: 'GET', re: /^\/api\/staff$/, auth: true,
      run: (c) => (c.user!.role !== 'chief' ? fail(403, E.forbidden) : json({ staff: c.state.users.map(publicUser) })),
    },
    {
      method: 'POST', re: /^\/api\/staff\/([\w-]+)$/, auth: true,
      run: (c) => {
        updateStaff(c.state, ctxOf(c), c.params[0]!, parse(S.staff, c.body));
        c.dirty = true;
        return json({ staff: c.state.users.map(publicUser) });
      },
    },
  ];

  async function handle(req: Request, text: string): Promise<Response> {
    const url = new URL(req.url);
    // only this machine's own address: a page elsewhere that points its name at 127.0.0.1 gets nothing
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') return fail(403, E.forbidden);
    // a change comes only from the demo's own page
    const origin = req.headers.get('origin');
    if (req.method !== 'GET' && origin !== null && origin !== url.origin) return fail(403, E.forbidden);
    const route = routes.find((r) => r.method === req.method && r.re.test(url.pathname));
    if (!route) return fail(404, E.noAddress);
    let body: unknown = {};
    if (req.method !== 'GET') {
      if (new TextEncoder().encode(text).length > S.BODY_MAX) return fail(400, E.bodyTooBig);
      try {
        body = text.trim() === '' ? {} : JSON.parse(text);
      } catch {
        return fail(400, E.badBody);
      }
    }
    if (!stateExists(deps.statePath)) return fail(503, NO_STATE);
    let state: State;
    let loadedSize: number;
    try {
      loadedSize = statSync(deps.statePath).size;
      state = loadState(deps.statePath);
    } catch {
      return fail(503, BAD_STATE);
    }
    const c: Call = {
      req, url, body, params: route.re.exec(url.pathname)!.slice(1),
      state, now: clock(), user: null, dirty: false,
      reload() {
        this.state = loadState(deps.statePath);
        this.now = clock();
        if (tick(this.state, this.now)) this.dirty = true;
        this.user = userOf(this);
      },
    };
    const userOf = (x: Call): User | null => {
      const id = cookieUser(x.req);
      const u = id ? x.state.users.find((y) => y.id === id) : undefined;
      return u && u.enabled ? u : null;
    };
    if (tick(c.state, c.now)) c.dirty = true;
    c.user = userOf(c);
    if (route.auth && !c.user) return fail(401, E.needLogin);
    try {
      const res = await route.run(c);
      // a change may not grow the file past the limit; reading and shrinking it always work
      if (c.dirty && req.method !== 'GET') {
        const size = Buffer.byteLength(JSON.stringify(c.state));
        if (size > STATE_MAX && size > loadedSize) return fail(409, STATE_FULL);
      }
      if (c.dirty) saveState(deps.statePath, c.state);
      return res;
    } catch (e) {
      if (e instanceof DemoError) {
        if (c.dirty && e.status >= 500) saveState(deps.statePath, c.state);
        return fail(e.status, e.message);
      }
      console.error(e);
      return fail(500, 'Внутренняя ошибка демо');
    }
  }

  // One request at a time: each loads the state file, changes it and writes it back, so overlapping requests would lose writes.
  let queue: Promise<unknown> = Promise.resolve();
  return {
    fetch: async (req) => {
      // the body is read before the queue: a slow sender must not hold up everyone else
      if (Number(req.headers.get('content-length') ?? 0) > S.BODY_MAX) return fail(400, E.bodyTooBig);
      const text = req.method === 'GET' ? '' : await req.text();
      const res = queue.then(() => handle(req, text));
      queue = res.catch(() => undefined);
      return res;
    },
  };
}
