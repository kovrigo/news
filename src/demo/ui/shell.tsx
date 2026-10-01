import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, onConnection, type Account, type ApiError } from './api.ts';

export const BANNER = 'Демо на придуманных данных. Не загружайте и не вставляйте настоящие материалы.';
export const NEWSROOM = 'Демо-редакция „Заречье-ТВ“';
export const TIME_ZONE = 'Europe/Moscow';

type Store = { user: Account | null; online: boolean; announce: (text: string) => void; logout: () => Promise<void> };
export const StoreCtx = createContext<Store>(null as never);
export const useStore = (): Store => useContext(StoreCtx);

const tz = { timeZone: TIME_ZONE };
const fDate = new Intl.DateTimeFormat('ru-RU', { ...tz, day: 'numeric', month: 'long', year: 'numeric' });
const fTime = new Intl.DateTimeFormat('ru-RU', { ...tz, hour: '2-digit', minute: '2-digit', hour12: false });
export const fmtDate = (ms: number): string => fDate.format(ms).replace(/\s*г\.$/, '');
export const fmtTime = (ms: number): string => fTime.format(ms);
export const fmtDateTime = (ms: number): string => `${fmtDate(ms)}, ${fmtTime(ms)}`;
const p2 = (n: number): string => String(n).padStart(2, '0');
export function clock(ms: number, long = false): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  return h > 0 || long ? `${p2(h)}:${p2(Math.floor((s % 3600) / 60))}:${p2(s % 60)}` : `${p2(Math.floor(s / 60))}:${p2(s % 60)}`;
}
export const span = (a: number, b: number, long = false): string => `${clock(a, long)}–${clock(b, long)}`;
export function duration(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)} ч ${m % 60} мин` : `${m} мин`;
}
export function plural(n: number, one: string, few: string, many: string): string {
  const a = n % 100;
  const b = n % 10;
  return a > 10 && a < 20 ? many : b > 1 && b < 5 ? few : b === 1 ? one : many;
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
  const reload = useCallback(async () => {
    if (!path) return;
    try {
      setData(await api<T>('GET', path));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      if ((e as ApiError).status === 404) setData(null); // the story was deleted
    }
  }, [path]);
  useEffect(() => {
    setData(null);
    void reload();
    const t = setInterval(() => void reload(), every);
    return () => clearInterval(t);
  }, [reload, every]);
  return { data, error, reload, set: setData };
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
      <div role="note" className="demo-banner">{BANNER}</div>
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
