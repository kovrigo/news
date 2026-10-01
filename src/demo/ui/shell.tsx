import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { BANNER, NEWSROOM, TIME_ZONE } from '../texts.ts';
import { api, onConnection, type Account, type ApiError } from './api.ts';

// one home for texts and formats: the server modules, which import only types
export { plural } from '../texts.ts';
export { fmtDate, fmtDateTime, fmtTime, fmtClock as clock, fmtSpan as span } from '../format.ts';

type Store = { user: Account | null; online: boolean; announce: (text: string) => void; logout: () => Promise<void> };
export const StoreCtx = createContext<Store>(null as never);
export const useStore = (): Store => useContext(StoreCtx);

export function duration(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)} ч ${m % 60} мин` : `${m} мин`;
}
export function useHash(): string {
  const [h, setH] = useState(() => location.hash.slice(1) || '/');
  useEffect(() => {
    const f = (): void => setH(location.hash.slice(1) || '/');
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, []);
  return h;
}

// Reload a value from the server now and then; keeps the last good value when a request fails.
export function usePoll<T>(path: string | null, every: number): { data: T | null; error: string | null; reload: () => Promise<void>; set: (v: T) => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const gen = useRef(0); // an answer for a path that is no longer shown is dropped
  const last = useRef(''); // an unchanged answer does not re-render the page
  const reload = useCallback(async () => {
    if (!path) return;
    const g = gen.current;
    try {
      const v = await api<T>('GET', path);
      if (g !== gen.current) return;
      setError(null);
      const text = JSON.stringify(v);
      if (text === last.current) return;
      last.current = text;
      setData(v);
    } catch (e) {
      setError((e as Error).message);
      if ((e as ApiError).status === 404) (setData(null), (last.current = '')); // the story was deleted
    }
  }, [path]);
  useEffect(() => {
    gen.current++;
    last.current = '';
    setData(null);
    void reload();
    const t = setInterval(() => void reload(), every);
    return () => clearInterval(t);
  }, [reload, every]);
  const set = useCallback((v: T) => {
    last.current = '';
    setData(v);
  }, []);
  return { data, error, reload, set };
}

export function Modal(p: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(document.activeElement);
  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
    d.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return () => {
      d.close();
      const o = opener.current;
      // the dialog gives focus back to the button that opened it
      if (o instanceof HTMLElement) setTimeout(() => o.isConnected && o.focus(), 0);
    };
  }, []);
  return (
    <dialog ref={ref} aria-labelledby="dlg-title" onClose={() => !ref.current?.open && p.onClose()}>
      <h2 id="dlg-title">{p.title}</h2>
      {p.children}
    </dialog>
  );
}

export function TopBar() {
  const { user, logout } = useStore();
  const hash = useHash();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [hash]);
  if (!user) return null;
  const links = [
    { to: '/', label: 'Сюжеты', show: true },
    { to: '/directory', label: 'Справочник', show: true },
    { to: '/journal', label: 'Журнал', show: user.canApprove || user.role === 'chief' },
    { to: '/staff', label: 'Сотрудники', show: user.role === 'chief' },
  ].filter((l) => l.show);
  const cur = (to: string): boolean => (to === '/' ? hash === '/' || hash.startsWith('/story') || hash === '/new' : hash === to);
  return (
    <header className="top">
      <div className="top-left">
        <a className="brand" href="#/">{NEWSROOM}</a>
        <button type="button" className="btn small menu-btn" aria-expanded={open} aria-controls="main-nav" onClick={() => setOpen(!open)}>Меню</button>
        <nav id="main-nav" className={`nav${open ? ' open' : ''}`} aria-label="Разделы">
          {links.map((l) => (
            <a key={l.to} href={`#${l.to}`} aria-current={cur(l.to) ? 'page' : undefined}>{l.label}</a>
          ))}
        </nav>
      </div>
      <div className="profile">
        <div>
          {user.name}
          <small>{user.roleLabel}</small>
          <small>Часовой пояс: {TIME_ZONE}</small>
        </div>
        <button type="button" className="btn small" onClick={() => void logout()}>Сменить роль</button>
      </div>
    </header>
  );
}

export function Shell(p: { children: ReactNode; live: string; online: boolean }) {
  return (
    <div className="app">
      <aside className="demo-banner" aria-label="Демо"><p role="note">{BANNER}</p></aside>
      {!p.online && <div className="offline" role="status">Нет связи. Правки сохранятся, когда связь вернётся</div>}
      <TopBar />
      {p.children}
      <div className="sr" aria-live="polite" role="status">{p.live}</div>
    </div>
  );
}

export function useConnection(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const off = onConnection(setOnline);
    const on = (): void => setOnline(true);
    const lost = (): void => setOnline(false);
    addEventListener('online', on);
    addEventListener('offline', lost);
    return () => {
      off();
      removeEventListener('online', on);
      removeEventListener('offline', lost);
    };
  }, []);
  return online;
}
