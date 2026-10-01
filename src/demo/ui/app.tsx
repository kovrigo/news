import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api, unauthorized, type Account } from './api.ts';
import { Directory, Journal, List, Login, NewStory, Staff } from './pages.tsx';
import { forgetUnsentAfterReset } from './editor.ts';
import { Shell, StoreCtx, useConnection, useHash } from './shell.tsx';
import { StoryPage } from './story.tsx';
import './styles.css';

function App() {
  const [user, setUser] = useState<Account | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [ready, setReady] = useState(false);
  const [live, setLive] = useState('');
  const online = useConnection();
  const hash = useHash();

  const refresh = useCallback(async () => {
    const r = await api<{ user: Account | null; accounts: Account[]; resetId: string }>('GET', '/api/session');
    forgetUnsentAfterReset(r.resetId);
    setUser(r.user);
    setAccounts(r.accounts);
    setReady(true);
  }, []);
  useEffect(() => void refresh(), [refresh]);
  useEffect(() => {
    const f = (): void => setUser(null);
    unauthorized.addEventListener('expired', f);
    return () => unauthorized.removeEventListener('expired', f);
  }, []);

  const announce = useCallback((t: string) => {
    setLive('');
    setTimeout(() => setLive(t), 50);
  }, []);
  const logout = useCallback(async () => {
    await api('POST', '/api/logout', {});
    await refresh();
    setUser(null);
    location.hash = '#/';
  }, [refresh]);

  const m = /^\/story\/([\w-]+)(?:\/(\w+))?$/.exec(hash);
  let page = <List />;
  if (m) page = <StoryPage id={m[1]!} kind={m[2]} />;
  else if (hash === '/new') page = <NewStory />;
  else if (hash === '/journal') page = <Journal />;
  else if (hash === '/staff') page = <Staff />;
  else if (hash === '/directory') page = <Directory />;

  return (
    <StoreCtx.Provider value={{ user, online, announce, logout }}>
      <Shell live={live} online={online}>
        {!ready ? <p className="page">Загрузка…</p> : user ? page : <Login accounts={accounts} onLogin={(u) => { setUser(u); void refresh(); }} />}
      </Shell>
    </StoreCtx.Provider>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
