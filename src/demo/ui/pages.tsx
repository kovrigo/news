import { useEffect, useRef, useState } from 'react';
import { api, type Account, type ListView } from './api.ts';
import { duration, fmtDate, fmtDateTime, fmtTime, plural, usePoll, useStore } from './shell.tsx';

export function Login(p: { accounts: Account[]; onLogin: (u: Account) => void }) {
  const [error, setError] = useState('');
  const pick = async (u: Account): Promise<void> => {
    try {
      await api('POST', '/api/login', { userId: u.id });
      p.onLogin(u);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <main className="login">
      <h1>Демо-редакция „Заречье-ТВ“</h1>
      <p>Выберите демо-учётную запись. Пароля нет: вход нужен, чтобы показать, что видит каждая роль.</p>
      <ul className="stack" aria-label="Демо-учётные записи">
        {p.accounts.map((u) => (
          <li key={u.id}>
            <button type="button" className="btn account" disabled={!u.enabled} onClick={() => void pick(u)}>
              <strong>{u.name}</strong>
              <span className="muted">{u.enabled ? u.roleLabel : 'учётная запись отключена'}</span>
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="field-error" role="alert">{error}</p>}
    </main>
  );
}

const dayTitle = (ms: number, now: number): string => (fmtDate(ms) === fmtDate(now) ? `Сегодня, ${fmtDate(ms)}` : fmtDate(ms));

export function List() {
  const { user } = useStore();
  const { data } = usePoll<ListView>('/api/stories', 15_000);
  if (!data || !user) return <main className="page"><p>Загрузка…</p></main>;
  const days = [...new Set(data.stories.map((s) => s.day))];
  return (
    <main className="page">
      <div className="page-head">
        <h1>Сюжеты</h1>
        <a className="btn primary" href="#/new">Новый сюжет</a>
      </div>
      {data.returned.length > 0 && (
        <section className="panel" aria-labelledby="h-returned">
          <div className="block"><h2 id="h-returned">Вам вернули</h2></div>
          {data.returned.map((r, i) => (
            <div className="row" key={i}>
              <div className="main">
                <a href={`#/story/${r.storyId}/${r.kind}`}>{r.draft}: {r.title}</a>
                <span>{r.comment}</span>
              </div>
              <div className="side"><span className="tag returned">Возвращён</span><span className="muted">{r.by}, {fmtDateTime(r.at)}</span></div>
            </div>
          ))}
        </section>
      )}
      {data.waiting.length > 0 && (
        <section className="panel" aria-labelledby="h-waiting">
          <div className="block"><h2 id="h-waiting">Ждут утверждения</h2></div>
          {data.waiting.map((r, i) => (
            <div className="row" key={i}>
              <div className="main"><a href={`#/story/${r.storyId}/${r.kind}`}>{r.draft}: {r.title}</a></div>
              <div className="side"><span className="tag">На проверке</span><span className="muted">отправил(а) {r.by}, {fmtDateTime(r.at)}</span></div>
            </div>
          ))}
        </section>
      )}
      {data.stories.length === 0 ? (
        <section className="panel empty">
          <p>Сюжетов пока нет. Загрузите видео сюжета — черновики появятся здесь</p>
          <a className="btn primary" href="#/new">Новый сюжет</a>
        </section>
      ) : (
        <section className="panel" aria-label="Все сюжеты редакции">
          {days.map((d) => (
            <div key={d}>
              <h2 className="day">{dayTitle(data.stories.find((s) => s.day === d)!.loadedAt, data.now)}</h2>
              <ul>
                {data.stories.filter((s) => s.day === d).map((s) => (
                  <li className="row" key={s.id}>
                    <div className="main">
                      <a href={`#/story/${s.id}`}>{s.title}</a>
                      <span className="muted">{s.correspondent}, загружен в {fmtTime(s.loadedAt)}</span>
                    </div>
                    <div className="side">
                      {s.processing && <span className="tag">Обрабатывается</span>}
                      {s.failed > 0 && <span className="tag error">Сбой: {s.failed} {plural(s.failed, 'черновик', 'черновика', 'черновиков')}</span>}
                      {s.marks > 0 && <span className="tag check">{s.marks} {plural(s.marks, 'пометка', 'пометки', 'пометок')}</span>}
                      <span>утверждено {s.approved} из {s.total}</span>
                      {data.showTimes && (
                        <span className="mono">{s.timeToApprovalMs === null ? 'ещё не утверждён' : `до утверждения: ${duration(s.timeToApprovalMs)}`}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}

type SetRow = { id: string; title: string; description: string; videoNames: string[]; docNames: string[] };

export function NewStory() {
  const [sets, setSets] = useState<SetRow[]>([]);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => void api<{ sets: SetRow[] }>('GET', '/api/sets').then((r) => setSets(r.sets)), []);
  const start = async (): Promise<void> => {
    if (!pick || busy) return;
    setBusy(true);
    try {
      const r = await api<{ id: string }>('POST', '/api/stories', { setId: pick });
      location.hash = `#/story/${r.id}`;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <main className="page">
      <h1>Новый сюжет</h1>
      <p>В демо исходники не загружаются. Выберите один из встроенных придуманных наборов.</p>
      <fieldset className="panel block">
        <legend className="sr">Набор исходников</legend>
        {sets.map((s) => (
          <label key={s.id} className="check-row">
            <input type="radio" name="set" value={s.id} checked={pick === s.id} onChange={() => setPick(s.id)} />
            <span>
              <strong>{s.title}</strong>
              <br />
              <span className="muted">{s.description}</span>
              <br />
              <span className="note">Видео: {s.videoNames.length}. Документы: {s.docNames.length === 0 ? 'нет' : s.docNames.join(', ')}.</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="form-row">
        <button type="button" className="btn primary" aria-disabled={!pick || busy} aria-describedby="start-why" onClick={() => void start()}>Начать обработку</button>
        {!pick && <span id="start-why" className="note">Выберите набор исходников</span>}
        {error && <span className="field-error" role="alert">{error}</span>}
      </div>
    </main>
  );
}

type JournalData = {
  rows: { id: number; at: number; userName: string; action: string; actionLabel: string; draft: string; storyTitle: string; storyDeleted: boolean; detail: string; factText: string }[];
  stories: { id: string; title: string }[];
  users: { id: string; name: string }[];
  actions: { id: string; label: string }[];
};
const PERIODS: Record<string, string> = { all: 'За всё время', day: 'За сутки', week: 'За 7 дней' };

export function Journal() {
  const [f, setF] = useState({ story: '', user: '', action: '', period: 'all', taken: false });
  const q = new URLSearchParams();
  if (f.story) q.set('story', f.story);
  if (f.user) q.set('user', f.user);
  if (f.action) q.set('action', f.action);
  if (f.taken) q.set('taken', '1');
  if (f.period !== 'all') q.set('from', String(Date.now() - (f.period === 'day' ? 1 : 7) * 86_400_000));
  const { data } = usePoll<JournalData>(`/api/journal?${q}`, 15_000);
  const [live, setLive] = useState('');
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (!data) return;
    const top = data.rows[0];
    if (top && last.current !== null && top.id !== last.current) setLive(`Новая запись журнала: ${top.userName}, ${top.actionLabel}`);
    last.current = top?.id ?? 0;
  }, [data]);
  if (!data) return <main className="page"><p>Загрузка…</p></main>;
  const sel = (k: 'story' | 'user' | 'action', label: string, opts: { id: string; label: string }[]) => (
    <label className="stack">
      <span className="label">{label}</span>
      <select value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}>
        <option value="">Все</option>
        {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </label>
  );
  return (
    <main className="page">
      <h1>Журнал</h1>
      <div className="form-row" role="group" aria-label="Фильтры журнала">
        {sel('story', 'Сюжет', data.stories.map((s) => ({ id: s.id, label: s.title })))}
        {sel('user', 'Сотрудник', data.users.map((u) => ({ id: u.id, label: u.name })))}
        {sel('action', 'Действие', data.actions)}
        <label className="stack">
          <span className="label">Период</span>
          <select value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })}>
            {Object.entries(PERIODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="check-row">
          <input type="checkbox" checked={f.taken} onChange={(e) => setF({ ...f, taken: e.target.checked })} />
          <span>Взяли на себя без исходника</span>
        </label>
      </div>
      <div className="sr" aria-live="polite" role="status">{live}</div>
      {data.rows.length === 0 ? (
        <p className="panel empty">Записей пока нет. Здесь появятся утверждения, правки и возвраты</p>
      ) : (
        <div className="panel scroll-x">
          <table>
            <thead>
              <tr>
                <th scope="col">Время</th><th scope="col">Кто</th><th scope="col">Что сделал</th><th scope="col">Черновик</th><th scope="col">Сюжет</th>
                {f.taken && <th scope="col">Факт</th>}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{fmtDateTime(r.at)}</td>
                  <td>{r.userName}</td>
                  <td>{r.actionLabel}{r.detail && r.action !== 'take_over' ? <span className="muted">. {r.detail}</span> : null}</td>
                  <td>{r.draft}</td>
                  <td>{r.storyTitle}{r.storyDeleted ? <span className="muted"> (сюжет удалён)</span> : null}</td>
                  {f.taken && <td>{r.factText}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

export function Staff() {
  const { data, reload } = usePoll<{ staff: Account[] }>('/api/staff', 15_000);
  const { user } = useStore();
  const [error, setError] = useState('');
  if (!data || !user) return <main className="page"><p>Загрузка…</p></main>;
  const change = async (id: string, body: object): Promise<void> => {
    try {
      await api('POST', `/api/staff/${id}`, body);
      setError('');
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <main className="page">
      <h1>Сотрудники</h1>
      <p className="note">В демо три учётные записи. Права меняются у них; приглашений и входа по паролю нет.</p>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="panel scroll-x">
        <table>
          <thead>
            <tr><th scope="col">Имя</th><th scope="col">Роль</th><th scope="col">Право утверждать</th><th scope="col">Состояние</th></tr>
          </thead>
          <tbody>
            {data.staff.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.roleLabel}</td>
                <td>
                  <span className="tag">{s.canApprove ? 'есть' : 'нет'}</span>{' '}
                  <button type="button" className="btn small" aria-label={`${s.canApprove ? 'Снять право утверждать у' : 'Дать право утверждать'}: ${s.name}`} onClick={() => void change(s.id, { canApprove: !s.canApprove })}>
                    {s.canApprove ? 'Снять право' : 'Дать право'}
                  </button>
                </td>
                <td>
                  <span className="tag">{s.enabled ? 'включён' : 'отключён'}</span>{' '}
                  {s.id === user.id ? (
                    <span className="note">Себя отключить нельзя</span>
                  ) : (
                    <button type="button" className="btn small" aria-label={`${s.enabled ? 'Отключить' : 'Включить'}: ${s.name}`} onClick={() => void change(s.id, { enabled: !s.enabled })}>
                      {s.enabled ? 'Отключить' : 'Включить'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

type Dir = { version: number; people: { id: string; name: string; position: string }[]; places: { id: string; name: string }[]; canEdit: boolean };

export function Directory() {
  const { data, reload } = usePoll<Dir>('/api/directory', 15_000);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [edit, setEdit] = useState<{ kind: 'people' | 'places'; id: string | null; name: string; position: string } | null>(null);
  if (!data) return <main className="page"><p>Загрузка…</p></main>;
  const starts = (t: string): boolean => t.toLowerCase().replace(/ё/g, 'е').startsWith(q.trim().toLowerCase().replace(/ё/g, 'е'));
  const people = data.people.filter((p) => !q.trim() || starts(p.name));
  const places = data.places.filter((p) => !q.trim() || starts(p.name));
  const run = async (fn: () => Promise<unknown>): Promise<void> => {
    try {
      await fn();
      setError('');
      setEdit(null);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const save = (): Promise<void> =>
    run(() => {
      const e = edit!;
      const body = e.kind === 'people' ? { name: e.name, position: e.position } : { name: e.name };
      return e.id ? api('PUT', `/api/directory/${e.kind}/${e.id}`, body) : api('POST', `/api/directory/${e.kind}`, body);
    });
  const form = edit && (
    <div className="panel block" role="group" aria-label={edit.id ? 'Правка записи справочника' : 'Новая запись справочника'}>
      <div className="form-row">
        <label className="stack"><span className="label">{edit.kind === 'people' ? 'ФИО' : 'Название'}</span>
          <input type="text" value={edit.name} maxLength={120} onChange={(e) => setEdit({ ...edit, name: e.target.value })} data-autofocus /></label>
        {edit.kind === 'people' && (
          <label className="stack"><span className="label">Должность</span>
            <input type="text" value={edit.position} maxLength={120} onChange={(e) => setEdit({ ...edit, position: e.target.value })} /></label>
        )}
        <button type="button" className="btn primary" onClick={() => void save()}>Сохранить запись</button>
        <button type="button" className="btn" onClick={() => setEdit(null)}>Отмена</button>
      </div>
    </div>
  );
  return (
    <main className="page">
      <h1>Справочник</h1>
      <p className="note">Правка действует только на неутверждённые черновики</p>
      <p className="note">Загрузка таблицы появится в первой версии</p>
      {!data.canEdit && <p className="note">Справочник правит выпускающий редактор. Вы можете его смотреть.</p>}
      <label className="stack">
        <span className="label">Поиск по началу ФИО или названия</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {error && <p className="field-error" role="alert">{error}</p>}
      {form}
      <section className="panel" aria-labelledby="h-people">
        <div className="block form-row" style={{ justifyContent: 'space-between' }}>
          <h2 id="h-people">Люди</h2>
          {data.canEdit && <button type="button" className="btn" onClick={() => setEdit({ kind: 'people', id: null, name: '', position: '' })}>Добавить человека</button>}
        </div>
        {people.length === 0 ? <p className="block muted">Справочник пуст. Без него титры не с чем сверить</p> : (
          <div className="scroll-x"><table>
            <thead><tr><th scope="col">ФИО</th><th scope="col">Должность</th>{data.canEdit && <th scope="col">Действия</th>}</tr></thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td><td>{p.position}</td>
                  {data.canEdit && (
                    <td><div className="form-row">
                      <button type="button" className="btn small" aria-label={`Править: ${p.name}, ${p.position}`} onClick={() => setEdit({ kind: 'people', id: p.id, name: p.name, position: p.position })}>Править</button>
                      <button type="button" className="btn small" aria-label={`Удалить: ${p.name}, ${p.position}`} onClick={() => void run(() => api('DELETE', `/api/directory/people/${p.id}`))}>Удалить</button>
                    </div></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>
      <section className="panel" aria-labelledby="h-places">
        <div className="block form-row" style={{ justifyContent: 'space-between' }}>
          <h2 id="h-places">Топонимы</h2>
          {data.canEdit && <button type="button" className="btn" onClick={() => setEdit({ kind: 'places', id: null, name: '', position: '' })}>Добавить топоним</button>}
        </div>
        <div className="scroll-x"><table>
          <thead><tr><th scope="col">Название</th>{data.canEdit && <th scope="col">Действия</th>}</tr></thead>
          <tbody>
            {places.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                {data.canEdit && (
                  <td><div className="form-row">
                    <button type="button" className="btn small" aria-label={`Править: ${p.name}`} onClick={() => setEdit({ kind: 'places', id: p.id, name: p.name, position: '' })}>Править</button>
                    <button type="button" className="btn small" aria-label={`Удалить: ${p.name}`} onClick={() => void run(() => api('DELETE', `/api/directory/places/${p.id}`))}>Удалить</button>
                  </div></td>
                )}
              </tr>
            ))}
          </tbody>
        </table></div>
      </section>
    </main>
  );
}
