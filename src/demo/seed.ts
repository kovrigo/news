import { editOp, acquireLock, releaseLock } from './domain/edit.ts';
import { exportDrafts } from './domain/export.ts';
import { approveDraft, decide, returnDraft, startStory, submitDraft } from './domain/flow.ts';
import { computeMarks } from './domain/marks.ts';
import { runSet } from './domain/build.ts';
import { tick } from './domain/tick.ts';
import type { Ctx, Kind, State, Story, User } from './domain/types.ts';
import { setById } from './sets.ts';

const MIN = 60_000;
const HOUR = 60 * MIN;

export const USERS: User[] = [
  { id: 'u-olga', name: 'Ольга Демина', role: 'correspondent', canApprove: false, enabled: true },
  { id: 'u-pavel', name: 'Павел Тестов', role: 'editor', canApprove: true, enabled: true },
  { id: 'u-anna', name: 'Анна Пробная', role: 'chief', canApprove: true, enabled: true },
];

const PEOPLE: [string, string][] = [
  ['Олег Миронов', 'глава города'],
  ['Сергей Лаптев', 'руководитель компании «Мостстрой-Тишма»'],
  ['Татьяна Рогова', 'пресс-секретарь администрации'],
  ['Татьяна Рогова', 'начальник отдела связи с общественностью'],
  ['Марина Крылова', 'директор школы № 7'],
  ['Игорь Белов', 'председатель родительского комитета'],
  ['Алла Горская', 'организатор ярмарки выходного дня'],
  ['Лидия Осокина', 'заведующая городской библиотекой'],
  ['Дарья Нестерова', 'врач районной поликлиники'],
];
const PLACES = ['Заречинск', 'Тишма', 'Лугово', 'Берёзовка', 'Заводской мост'];

export function emptyState(): State {
  return {
    v: 1,
    resetId: crypto.randomUUID(),
    seq: 100,
    failSeq: 1000,
    users: structuredClone(USERS),
    directory: {
      version: 1,
      people: PEOPLE.map(([name, position], i) => ({ id: `p${i + 1}`, name, position })),
      places: PLACES.map((name, i) => ({ id: `tp${i + 1}`, name })),
    },
    stories: [],
    journal: [],
    keys: {},
  };
}

// The seed runs the real code: processing with the mock adapters, the link checker, and the same actions a person has.
export async function buildSeed(now: number): Promise<State> {
  const state = emptyState();
  const user = (id: string): User => state.users.find((u) => u.id === id)!;
  const at = (id: string, t: number): Ctx => ({ now: t, user: user(id) });
  const draft = (s: Story, k: Kind) => s.drafts.find((d) => d.kind === k)!;
  const markKey = (s: Story, k: Kind, pick: (m: ReturnType<typeof computeMarks>[number]) => boolean): string =>
    computeMarks(draft(s, k), s).find(pick)!.key;
  let click = 0;
  const approve = (s: Story, k: Kind, who: string, t: number): void =>
    approveDraft(state, at(who, t), s, draft(s, k), draft(s, k).version, draft(s, k).basedOn, `seed-${++click}`);
  const open = async (setId: string, who: string, t: number, fail = false): Promise<Story> => {
    const set = setById(setId)!;
    const story = startStory(state, at(who, t), set, await runSet(set, fail ? set.failKind : undefined));
    tick(state, t + 60_000);
    return story;
  };

  // 1. Every draft state at once.
  const t1 = now - 3 * HOUR;
  const s1 = await open('bridge', 'u-olga', t1);
  const olga1 = at('u-olga', t1 + 5 * MIN);
  decide(state, olga1, s1, draft(s1, 'transcript'), markKey(s1, 'transcript', (m) => m.kind === 'unclear'), 'keep');
  decide(state, olga1, s1, draft(s1, 'transcript'), markKey(s1, 'transcript', (m) => m.kind === 'not_russian'), 'checked');
  submitDraft(state, at('u-olga', t1 + 8 * MIN), s1, draft(s1, 'transcript'));
  approve(s1, 'transcript', 'u-pavel', t1 + 30 * MIN);
  exportDrafts(state, at('u-pavel', t1 + 35 * MIN), s1, { kinds: ['transcript'], format: 'txt', noHeader: false, clickKey: 'seed-export-1' });
  for (const k of ['leadin', 'syncs', 'titles'] as Kind[]) submitDraft(state, at('u-olga', t1 + 10 * MIN), s1, draft(s1, k));
  approve(s1, 'leadin', 'u-pavel', t1 + 40 * MIN);
  returnDraft(state, at('u-pavel', t1 + 45 * MIN), s1, draft(s1, 'titles'), 'У Нины Захаровой нет исходника. Проверьте имя и укажите, где она это сказала.');
  decide(state, at('u-olga', t1 + 12 * MIN), s1, draft(s1, 'voiceover'), markKey(s1, 'voiceover', (m) => m.kind === 'no_source' && m.text.includes('шесть минут')), 'take', 'Цифра есть в записи у подрядчика, сверю при монтаже');

  // 2. Every yellow mark kind.
  const t2 = now - 1 * HOUR;
  const s2 = await open('school', 'u-olga', t2);
  const olga2 = at('u-olga', t2 + 5 * MIN);
  const vo = draft(s2, 'voiceover');
  acquireLock(state, olga2, vo, false);
  editOp(state, olga2, s2, vo, vo.version, {
    op: 'addSentence',
    afterId: vo.sentences[vo.sentences.length - 1]!.id,
    text: 'Зал открыт, и мы все ждём, что дети будут бегать, прыгать, играть, петь, танцевать, учиться, дружить, мечтать, расти, а ещё помогать друг другу, делиться мячами, играть в команде, и спорт станет для них такой же частью жизни, как школа, дом, семья и друзья, на все годы.',
  });
  releaseLock(olga2, vo);
  tick(state, t2 + 5 * MIN + 2000);

  // 3. A draft that failed.
  await open('fair', 'u-pavel', now - 26 * HOUR, true);

  // 4. Everything approved.
  const t4 = now - 29 * HOUR;
  const s4 = await open('reading-room', 'u-olga', t4);
  let t = t4 + 2 * HOUR;
  for (const k of ['transcript', 'syncs', 'titles', 'voiceover', 'leadin'] as Kind[]) {
    approve(s4, k, 'u-pavel', t);
    t += MIN;
  }
  tick(state, now);
  return state;
}
