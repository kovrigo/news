import { useCallback, useEffect, useRef, useState } from 'react';
import type { EditOp } from '../domain/edit.ts';
import { api, ApiError, fireAndForget, type StoryView } from './api.ts';

export type SaveState = { status: 'idle' | 'saving' | 'saved' | 'offline' | 'error'; at?: number; message?: string };
type Unsent = { version: number; items: { op: EditOp; text: string }[] };
// per account: after «Сменить роль» another account must not send the previous one's edits
const storeKey = (user: string, story: string, kind: string): string => `unsent:${user}:${story}:${kind}`;

const readUnsent = (k: string): Unsent | null => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? 'null') as Unsent | null;
  } catch {
    return null;
  }
};
const writeUnsent = (k: string, v: Unsent | null): void => {
  try {
    if (v) localStorage.setItem(k, JSON.stringify(v));
    else localStorage.removeItem(k);
  } catch {
    /* storage may be blocked: the text then stays only on screen */
  }
};

// After a demo-reset, offline drafts saved before it are dropped: the browser keeps the reset id it last saw.
export function forgetUnsentAfterReset(resetId: string): void {
  if (typeof resetId !== 'string') return; // a state file older than reset ids: keep the drafts
  try {
    if (localStorage.getItem('demo-reset-id') === resetId) return;
    for (const k of Object.keys(localStorage)) if (k.startsWith('unsent:')) localStorage.removeItem(k);
    localStorage.setItem('demo-reset-id', resetId);
  } catch {
    /* storage blocked: nothing was stored either */
  }
}

// Edit mode of one draft: the lock, the heartbeat, autosave 1.5 s after the last change, unsent text for offline.
export function useEditor(a: { userId: string; storyId: string; kind: string; version: number; online: boolean; apply: (v: StoryView) => void; lockedByMe: boolean }) {
  const base = `/api/stories/${a.storyId}/drafts/${a.kind}`;
  const [editing, setEditing] = useState(false);
  const [save, setSave] = useState<SaveState>({ status: 'idle' });
  const [leftovers, setLeftovers] = useState<string[]>([]);
  const [error, setError] = useState('');
  const version = useRef(a.version);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pending = useRef<Record<string, { op: EditOp; text: string }>>({});
  const lastVersionFromServer = useRef(a.version);
  useEffect(() => {
    version.current = a.version;
    lastVersionFromServer.current = a.version;
  }, [a.version]);

  const run = useCallback(
    (op: EditOp, text: string): Promise<boolean> => {
      const job = queue.current.then(async () => {
        setSave({ status: 'saving' });
        try {
          const v = await api<StoryView>('POST', `${base}/edit`, { baseVersion: version.current, op });
          version.current = v.drafts.find((d) => d.kind === a.kind)!.version;
          a.apply(v);
          setSave({ status: 'saved', at: Date.now() });
          setError('');
          return true;
        } catch (e) {
          const err = e as ApiError;
          if (err.status === 0 || err.status === 401) {
            const k = storeKey(a.userId, a.storyId, a.kind);
            const old = readUnsent(k) ?? { version: version.current, items: [] };
            writeUnsent(k, { version: old.version, items: [...old.items.filter((i) => JSON.stringify(i.op) !== JSON.stringify(op)), { op, text }] });
            setSave({ status: 'offline' });
          } else {
            setSave({ status: 'error', message: err.message });
            setError(err.message);
            if (err.status === 409 || err.status === 423) setLeftovers((l) => (text ? [...l, text] : l));
          }
          return false;
        }
      });
      queue.current = job;
      return job;
    },
    [base, a.kind, a.storyId, a.apply],
  );

  // text changes: one timer per field
  const change = useCallback(
    (key: string, op: EditOp, text: string) => {
      pending.current[key] = { op, text };
      clearTimeout(timers.current[key]);
      timers.current[key] = setTimeout(() => {
        const p = pending.current[key];
        delete pending.current[key];
        if (p) void run(p.op, p.text);
      }, 1500);
    },
    [run],
  );
  const flush = useCallback(async () => {
    for (const [key, p] of Object.entries(pending.current)) {
      clearTimeout(timers.current[key]);
      delete pending.current[key];
      await run(p.op, p.text);
    }
  }, [run]);
  const dirty = (): boolean => Object.keys(pending.current).length > 0;

  const start = useCallback(
    async (confirmed: boolean): Promise<boolean> => {
      try {
        const v = await api<StoryView>('POST', `${base}/lock`, { confirmed });
        a.apply(v);
        setEditing(true);
        setError('');
        return true;
      } catch (e) {
        setError((e as Error).message);
        return false;
      }
    },
    [base, a.apply],
  );
  const stop = useCallback(async () => {
    await flush();
    await queue.current;
    setEditing(false);
    try {
      a.apply(await api<StoryView>('POST', `${base}/unlock`, {}));
    } catch {
      /* the lock expires by itself */
    }
  }, [flush, base, a.apply]);

  // heartbeat while editing; unlock when the page closes or the draft is left
  useEffect(() => {
    if (!editing) return;
    const beat = setInterval(() => fireAndForget(`${base}/heartbeat`, {}), 15_000);
    const close = (): void => fireAndForget(`${base}/unlock`, {});
    addEventListener('pagehide', close);
    return () => {
      clearInterval(beat);
      removeEventListener('pagehide', close);
      close();
    };
  }, [editing, base]);
  // leaving the page (or a login that ran out) must not lose typed text: keep it for the next visit
  useEffect(
    () => () => {
      Object.values(timers.current).forEach(clearTimeout);
      const left = Object.values(pending.current);
      if (left.length === 0) return;
      const k = storeKey(a.userId, a.storyId, a.kind);
      const old = readUnsent(k) ?? { version: version.current, items: [] };
      writeUnsent(k, { version: old.version, items: [...old.items, ...left] });
    },
    [],
  );
  // the lock was lost (expired or taken): leave edit mode
  useEffect(() => {
    if (editing && !a.lockedByMe && !dirty() && save.status !== 'saving') setEditing(false);
  }, [a.lockedByMe]);

  // back online: save what was kept if the draft did not change meanwhile; otherwise show it for manual transfer
  useEffect(() => {
    if (!a.online) return;
    const k = storeKey(a.userId, a.storyId, a.kind);
    const un = readUnsent(k);
    if (!un || !Array.isArray(un.items) || un.items.length === 0) return;
    writeUnsent(k, null);
    if (un.version === lastVersionFromServer.current) {
      version.current = un.version;
      void (async () => {
        for (const i of un.items) await run(i.op, i.text);
      })();
    } else setLeftovers((l) => [...l, ...un.items.map((i) => i.text).filter(Boolean)]);
  }, [a.online, a.storyId, a.kind]);

  return { editing, start, stop, change, flush, save, leftovers, dismissLeftovers: () => setLeftovers([]), error, setError, run, dirty };
}
