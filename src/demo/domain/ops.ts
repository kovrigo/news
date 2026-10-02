import { E } from '../texts.ts';
import { FIELD_MAX } from './edit.ts';
import { canEditDirectory } from './flow.ts';
import { addJournal } from './journal.ts';
import { DemoError, type Ctx, type State } from './types.ts';

const NO_STORY = { id: '', title: '' };

function field(v: string): string {
  const t = v.replace(/\s+/g, ' ').trim();
  if (t === '') throw new DemoError(400, E.empty);
  if (t.length > FIELD_MAX) throw new DemoError(400, E.fieldLong);
  return t;
}

function touch(state: State, ctx: Ctx, detail: string): void {
  if (!canEditDirectory(ctx)) throw new DemoError(403, E.forbidden);
  state.directory.version++;
  addJournal(state, ctx, NO_STORY, 'directory_edit', { detail });
}

export function savePerson(state: State, ctx: Ctx, id: string | null, v: { name: string; position: string }): void {
  if (!canEditDirectory(ctx)) throw new DemoError(403, E.forbidden);
  const name = field(v.name);
  const position = field(v.position);
  if (id === null) state.directory.people.push({ id: `p${++state.seq}`, name, position });
  else {
    const p = state.directory.people.find((x) => x.id === id);
    if (!p) throw new DemoError(400, E.noId);
    Object.assign(p, { name, position });
  }
  touch(state, ctx, `${name} — ${position}`);
}
export function deletePerson(state: State, ctx: Ctx, id: string): void {
  if (!canEditDirectory(ctx)) throw new DemoError(403, E.forbidden);
  const p = state.directory.people.find((x) => x.id === id);
  if (!p) throw new DemoError(400, E.noId);
  state.directory.people = state.directory.people.filter((x) => x !== p);
  touch(state, ctx, `удалён: ${p.name}`);
}
export function savePlace(state: State, ctx: Ctx, id: string | null, v: { name: string }): void {
  if (!canEditDirectory(ctx)) throw new DemoError(403, E.forbidden);
  const name = field(v.name);
  if (id === null) state.directory.places.push({ id: `tp${++state.seq}`, name });
  else {
    const p = state.directory.places.find((x) => x.id === id);
    if (!p) throw new DemoError(400, E.noId);
    p.name = name;
  }
  touch(state, ctx, name);
}
export function deletePlace(state: State, ctx: Ctx, id: string): void {
  if (!canEditDirectory(ctx)) throw new DemoError(403, E.forbidden);
  const p = state.directory.places.find((x) => x.id === id);
  if (!p) throw new DemoError(400, E.noId);
  state.directory.places = state.directory.places.filter((x) => x !== p);
  touch(state, ctx, `удалён: ${p.name}`);
}

export function updateStaff(state: State, ctx: Ctx, id: string, v: { canApprove?: boolean; enabled?: boolean }): void {
  if (ctx.user.role !== 'chief') throw new DemoError(403, E.forbidden);
  const u = state.users.find((x) => x.id === id);
  if (!u) throw new DemoError(400, E.noId);
  if (u.id === ctx.user.id && v.enabled === false) throw new DemoError(400, E.selfDisable);
  if (v.canApprove !== undefined) u.canApprove = v.canApprove;
  if (v.enabled !== undefined) u.enabled = v.enabled;
  addJournal(state, ctx, NO_STORY, 'staff_edit', { detail: `${u.name}: право утверждать ${u.canApprove ? 'есть' : 'снято'}, ${u.enabled ? 'включён' : 'отключён'}` });
}
