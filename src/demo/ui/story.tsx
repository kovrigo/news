import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as KEvent, type MouseEvent as MEvent, type ReactNode } from 'react';
import type { Place } from '../../core/source.ts';
import type { Mark } from '../domain/marks.ts';
import type { FactView, SegmentView, SentenceView, SyncView, TitleView } from '../domain/view.ts';
import { api, ApiError, download, type DraftView, type StoryView } from './api.ts';
import { useEditor } from './editor.ts';
import { clock, fmtDateTime, fmtTime, Modal, plural, usePoll, useStore } from './shell.tsx';
import { SourcePane, type Sel } from './sources.tsx';

type Mode = 'wide' | 'panel' | 'inline';
function useMode(): Mode {
  const get = (): Mode => (matchMedia('(min-width: 1100px)').matches ? 'wide' : matchMedia('(min-width: 700px)').matches ? 'panel' : 'inline');
  const [m, setM] = useState<Mode>(get);
  useEffect(() => {
    const f = (): void => setM(get());
    addEventListener('resize', f);
    return () => removeEventListener('resize', f);
  }, []);
  return m;
}

const marksWord = (n: number): string => `${n} ${plural(n, 'пометка', 'пометки', 'пометок')}`;
const dotClass = (d: DraftView): string => (d.state === 'approved' ? 'approved' : d.state === 'returned' ? 'returned' : d.state === 'failed' ? 'error' : d.pending > 0 || d.state === 'not_built' ? 'check' : '');
const tagClass = (d: DraftView): string => (d.state === 'approved' ? 'approved' : d.state === 'returned' ? 'returned' : d.state === 'failed' ? 'error' : d.state === 'not_built' ? 'check' : '');

const ACTION_TEXT: Record<string, string> = {
  remove: 'Удалить фразу', take: 'Взять на себя', source: 'Указать исходник', confirm: 'Подтвердить', fix: 'Исправить',
  add_dir: 'Добавить в справочник', write: 'Вписать текст', keep: 'Оставить неразборчивым', checked: 'Проверено',
  pick: 'Показать места', rewrite: 'Переписать фразу', accept: 'Принять как есть', recheck: 'Проверить снова',
};

export function StoryPage(p: { id: string; kind?: string }) {
  const { user, online, announce } = useStore();
  const { data, error, set, reload } = usePoll<StoryView>(`/api/stories/${p.id}`, 2000);
  const mode = useMode();
  const [sel, setSel] = useState<Sel | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [picking, setPicking] = useState<null | { sentenceId?: string; factIndex?: number; itemId?: string }>(null);
  const [dialog, setDialog] = useState<null | { type: 'export' | 'delete' }>(null);
  const [menu, setMenu] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const prev = useRef<StoryView | null>(null);

  // state changes and new journal lines go to the screen reader
  useEffect(() => {
    if (!data) return;
    const old = prev.current;
    if (old && old.id === data.id)
      for (const d of data.drafts) {
        const o = old.drafts.find((x) => x.kind === d.kind)!;
        if (o.stateWord !== d.stateWord) announce(`${d.name}: ${d.stateWord}`);
        else if (d.lastJournal && o.lastJournal?.text !== d.lastJournal.text && o.lastJournal) announce(`Запись журнала: ${d.lastJournal.text}`);
      }
    prev.current = data;
  }, [data]);

  const kind = useMemo(() => {
    if (!data) return null;
    const k = data.drafts.find((d) => d.kind === p.kind)?.kind;
    return k ?? (data.drafts.find((d) => d.pending > 0)?.kind ?? data.drafts[0]!.kind);
  }, [data?.id, p.kind]);
  useEffect(() => {
    if (data && kind && p.kind !== kind) location.replace(`#/story/${p.id}/${kind}`);
  }, [kind, p.kind, data?.id]);

  useEffect(() => setSel(null), [kind]);
  const draft = data?.drafts.find((d) => d.kind === kind);

  const select = useCallback((place: Place, rowId: string, from?: HTMLElement | null) => {
    opener.current = from ?? (document.activeElement as HTMLElement);
    setSel({ place, rowId, nonce: Date.now() });
    setPanelOpen(true);
  }, []);
  const closePanel = (): void => {
    setPanelOpen(false);
    opener.current?.focus();
  };
  useEffect(() => {
    if (mode === 'panel' && panelOpen) panelRef.current?.focus();
  }, [panelOpen, mode, sel?.nonce]);
  useEffect(() => {
    if (!(mode === 'panel' && panelOpen)) return;
    const f = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closePanel();
    };
    addEventListener('keydown', f);
    return () => removeEventListener('keydown', f);
  }, [mode, panelOpen]);

  if (error && !data) {
    return (
      <main className="page">
        <h1>{error}</h1>
        <p>Такого сюжета нет: его удалили или адрес неверен.</p>
        <a className="btn" href="#/">К списку сюжетов</a>
      </main>
    );
  }
  if (!data || !draft || !user) return <main className="page"><p>Загрузка…</p></main>;

  const takeFrom = async (markKey: string, ref: string): Promise<void> => {
    try {
      set(await api<StoryView>('POST', `/api/stories/${data.id}/drafts/${draft.kind}/decide`, { markKey, action: 'pick', ref }));
    } catch (e) {
      announce((e as Error).message);
    }
  };
  const pick = async (ref: string): Promise<void> => {
    const t = picking!;
    const op = t.itemId ? { op: 'setTitleSource', itemId: t.itemId, ref } : { op: 'setSource', sentenceId: t.sentenceId!, factIndex: t.factIndex ?? 0, ref };
    try {
      set(await api<StoryView>('POST', `/api/stories/${data.id}/drafts/${draft.kind}/edit`, { baseVersion: draft.version, op }));
      setPicking(null);
    } catch (e) {
      announce((e as Error).message);
    }
  };
  const pane = (
    <SourcePane
      story={data} draft={draft} sel={sel} picking={!!picking} onPick={(r) => void pick(r)} onTakeFrom={(k, r) => void takeFrom(k, r)}
      onClose={closePanel} mode={mode} open={panelOpen} panelRef={panelRef}
    />
  );
  const inlineHere = (rowId: string): boolean => mode === 'inline' && sel?.rowId === rowId && panelOpen;

  return (
    <main className="story">
      <div className="story-head">
        <div className="crumb"><a href="#/">Сюжеты</a> / {fmtDateTime(data.loadedAt)}</div>
        <div className="line1">
          <h1>{data.title}</h1>
          <div className="head-actions">
            <button type="button" className="btn" onClick={() => setDialog({ type: 'export' })}>Выгрузить утверждённые</button>
            {user.role === 'chief' && (
              <>
                <button type="button" className="btn" aria-haspopup="true" aria-expanded={menu} onClick={() => setMenu(!menu)}>Ещё</button>
                {menu && (
                  <div className="popmenu" role="group" aria-label="Действия с сюжетом">
                    <button type="button" className="btn" onClick={() => setDialog({ type: 'delete' })}>Удалить сюжет…</button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        <div className="meta">
          <span>Корреспондент: {data.correspondent}</span>
          <span>{data.sourceCount} {plural(data.sourceCount, 'исходник', 'исходника', 'исходников')}</span>
          <span>Утверждено {data.approved} из {data.total}</span>
        </div>
      </div>
      {data.processing && (
        <div className="band info" style={{ margin: '12px 24px 0' }}>
          <b role="status">{data.processing.label}</b>
          <span>Прошло {Math.round(data.processing.elapsedMs / 1000)} с, осталось примерно {Math.max(1, Math.round(data.processing.remainingMs / 1000))} с. Со страницы можно уйти: обработка продолжится.</span>
        </div>
      )}
      <div className="workspace">
        <nav className="drafts" aria-label="Черновики сюжета">
          <span className="label">Черновики сюжета</span>
          <ul>
            {data.drafts.map((d) => (
              <li key={d.kind}>
                <a className="draft" href={`#/story/${data.id}/${d.kind}`} aria-current={d.kind === kind ? 'page' : undefined}>
                  <strong>{d.name}</strong>
                  <small><i className={`dot ${dotClass(d)}`} aria-hidden="true" />{d.stateWord}{d.pending > 0 ? ` · ${marksWord(d.pending)}` : ''}</small>
                </a>
              </li>
            ))}
          </ul>
          <p className="total">Утверждено {data.approved} из {data.total}</p>
        </nav>
        <DraftPane
          key={draft.kind + data.id}
          story={data} draft={draft} apply={set} reload={reload} sel={sel} select={select} mode={mode}
          picking={picking} setPicking={(t) => { setPicking(t); if (t) setPanelOpen(true); }}
          inlineHere={inlineHere} pane={pane} openDialog={(t) => setDialog({ type: t })}
        />
        {mode !== 'inline' || !sel || !panelOpen ? pane : null}
      </div>
      {dialog?.type === 'export' && <ExportDialog story={data} onClose={() => setDialog(null)} announce={announce} online={online} />}
      {dialog?.type === 'delete' && <DeleteDialog story={data} onClose={() => setDialog(null)} />}
    </main>
  );
}

// Inline button: a span, so a long fact wraps across lines like text. One Tab stop, Enter and Space open it.
function Inline(p: { className: string; onActivate: (el: HTMLElement) => void; children: ReactNode }) {
  return (
    <span
      role="button" tabIndex={0} className={p.className}
      onClick={(e: MEvent<HTMLElement>) => p.onActivate(e.currentTarget)}
      onKeyDown={(e: KEvent<HTMLElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          p.onActivate(e.currentTarget);
        }
      }}
    >
      {p.children}
    </span>
  );
}

function DeleteDialog(p: { story: StoryView; onClose: () => void }) {
  const [error, setError] = useState('');
  return (
    <Modal title="Удалить сюжет?" onClose={p.onClose}>
      <p>Удаляются видео, документы, расшифровка и черновики. Вернуть их нельзя. В журнале останется только кто, что и когда сделал. Уже выгруженные файлы у редакции не затрагиваются.</p>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="dlg-actions">
        <button type="button" className="btn" data-autofocus onClick={p.onClose}>Отмена</button>
        <button
          type="button" className="btn danger"
          onClick={async () => {
            try {
              await api('DELETE', `/api/stories/${p.story.id}`);
              location.hash = '#/';
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Удалить сюжет навсегда
        </button>
      </div>
    </Modal>
  );
}

function ExportDialog(p: { story: StoryView; onClose: () => void; announce: (t: string) => void; online: boolean }) {
  const [format, setFormat] = useState<'docx' | 'txt'>('docx');
  const [chosen, setChosen] = useState<string[]>(p.story.drafts.filter((d) => d.state === 'approved').map((d) => d.kind));
  const [noHeader, setNoHeader] = useState(false);
  const [error, setError] = useState('');
  const clickKey = useRef(crypto.randomUUID());
  const lead = chosen.includes('leadin') && format === 'txt';
  const off = !p.online || chosen.length === 0;
  const go = async (): Promise<void> => {
    if (off) return;
    try {
      const name = await download(`/api/stories/${p.story.id}/export`, { kinds: chosen, format, noHeader: lead && noHeader, clickKey: clickKey.current });
      p.announce(`Файл выгружен: ${name}`);
      p.onClose();
      clickKey.current = crypto.randomUUID(); // a double click shares the key; the next export gets its own journal row
    } catch (e) {
      // the server may have recorded the export before the answer was lost: a retry keeps the key
      setError((e as Error).message);
    }
  };
  return (
    <Modal title="Выгрузка" onClose={p.onClose}>
      <fieldset>
        <legend>Формат</legend>
        <label className="check-row"><input type="radio" name="fmt" checked={format === 'docx'} onChange={() => setFormat('docx')} data-autofocus /><span>DOCX</span></label>
        <label className="check-row"><input type="radio" name="fmt" checked={format === 'txt'} onChange={() => setFormat('txt')} /><span>Текстовый файл</span></label>
      </fieldset>
      <fieldset>
        <legend>Черновики</legend>
        {p.story.drafts.map((d) => {
          const ok = d.state === 'approved';
          return (
            <label key={d.kind} className={`check-row${ok ? '' : ' off'}`}>
              <input type="checkbox" disabled={!ok} checked={ok && chosen.includes(d.kind)} onChange={(e) => setChosen(e.target.checked ? [...chosen, d.kind] : chosen.filter((k) => k !== d.kind))} />
              <span>{d.name}{ok ? '' : ' — не утверждён, не выгружается'}</span>
            </label>
          );
        })}
      </fieldset>
      {lead && (
        <label className="check-row"><input type="checkbox" checked={noHeader} onChange={(e) => setNoHeader(e.target.checked)} /><span>Без шапки, для суфлёра</span></label>
      )}
      <p className="note">Несколько черновиков выгружаются одним ZIP-архивом.</p>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="dlg-actions">
        <button type="button" className="btn" onClick={p.onClose}>Отмена</button>
        <button type="button" className="btn primary" aria-disabled={off} aria-describedby="exp-why" onClick={() => void go()}>
          {format === 'docx' ? 'Выгрузить в DOCX' : 'Выгрузить в текстовый файл'}
        </button>
      </div>
      {off && <p id="exp-why" className="note">{!p.online ? 'Без связи выгрузить нельзя' : 'Нет утверждённых черновиков для выгрузки'}</p>}
    </Modal>
  );
}

type PaneProps = {
  story: StoryView;
  draft: DraftView;
  apply: (v: StoryView) => void;
  reload: () => Promise<void>;
  sel: Sel | null;
  select: (p: Place, rowId: string, from?: HTMLElement | null) => void;
  mode: Mode;
  picking: null | { sentenceId?: string; factIndex?: number; itemId?: string };
  setPicking: (t: null | { sentenceId?: string; factIndex?: number; itemId?: string }) => void;
  inlineHere: (rowId: string) => boolean;
  pane: ReactNode;
  openDialog: (t: 'export' | 'delete') => void;
};

function DraftPane(p: PaneProps) {
  const { story, draft: d, apply } = p;
  const { user, online, announce } = useStore();
  const ed = useEditor({ userId: user!.id, storyId: story.id, kind: d.kind, version: d.version, online, apply, lockedByMe: !!d.lock?.mine });
  const base = `/api/stories/${story.id}/drafts/${d.kind}`;
  const [texts, setTexts] = useState<Record<string, string>>({});
  // typed field text lives for one edit session; after it the server text shows again
  useEffect(() => {
    if (!ed.editing) setTexts({});
  }, [ed.editing]);
  const [dlg, setDlg] = useState<null | { type: 'return' | 'take' | 'confirmEdit'; mark?: Mark }>(null);
  const [msg, setMsg] = useState('');
  const [noHeader, setNoHeader] = useState(false);
  const [newText, setNewText] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [nameVal, setNameVal] = useState('');
  const approveKey = useMemo(() => crypto.randomUUID(), [d.kind, d.version, d.state]);
  const exportKey = useRef(crypto.randomUUID());
  const focusAfter = useRef<string | null>(null);
  // a field in the sheet grows with its text: a long sentence reads whole, without scrolling inside the field
  const sheetRef = useRef<HTMLElement>(null);
  const fitFields = useCallback(() => {
    for (const t of sheetRef.current?.querySelectorAll('textarea') ?? []) {
      t.style.height = 'auto';
      t.style.height = `${t.scrollHeight + t.offsetHeight - t.clientHeight}px`;
    }
  }, []);
  useLayoutEffect(fitFields);
  useEffect(() => {
    addEventListener('resize', fitFields);
    return () => removeEventListener('resize', fitFields);
  }, [fitFields]);


  // an edited sentence is being checked: look again when the check is due
  const checking = d.sentences.some((x) => x.checking);
  useEffect(() => {
    if (!checking) return;
    const t = setTimeout(() => void p.reload(), 1700);
    return () => clearTimeout(t);
  }, [checking, d.version]);

  useEffect(() => {
    if (!focusAfter.current) return;
    const el = document.querySelector<HTMLElement>(focusAfter.current);
    if (el) {
      el.focus();
      focusAfter.current = null;
    }
  });

  const act = async (path: string, body: object = {}): Promise<boolean> => {
    try {
      apply(await api<StoryView>('POST', `${base}/${path}`, body));
      setMsg('');
      return true;
    } catch (e) {
      setMsg((e as Error).message);
      return false;
    }
  };

  const jumpToMark = (key: string | undefined): void => {
    const el = key ? document.getElementById(`mark-${key}`) : document.querySelector<HTMLElement>('.mark:not(.decided)');
    if (el) {
      el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
      el.focus();
    }
  };

  const startEdit = (): void => {
    if (d.state === 'approved') setDlg({ type: 'confirmEdit' });
    else void ed.start(false);
  };

  const markAction = async (m: Mark, a: string): Promise<void> => {
    const t = m.target;
    if (a === 'take') return setDlg({ type: 'take', mark: m });
    if (a === 'remove') {
      const op = t.itemId ? { op: 'removeTitle', itemId: t.itemId } : { op: 'removeSentence', sentenceId: t.sentenceId };
      if (await ed.run(op as never, '')) announce('Фраза удалена');
      return;
    }
    if (a === 'source') {
      p.setPicking(t.itemId ? { itemId: t.itemId } : { sentenceId: t.sentenceId, factIndex: t.factIndex ?? 0 });
      return;
    }
    if (a === 'fix' || a === 'rewrite' || a === 'write') {
      if (!ed.editing) await ed.start(false);
      focusAfter.current = t.segmentId ? `[data-edit="g:${t.segmentId}"]` : t.sentenceId ? `[data-edit="s:${t.sentenceId}"]` : t.itemId ? `[data-edit="t:${t.itemId}:name"]` : '[data-edit="new"]';
      return;
    }
    if (a === 'recheck') {
      await act('recheck', { sentenceId: t.sentenceId });
      return;
    }
    if (a === 'add_dir') {
      await act('add-to-directory', { markKey: m.key });
      return;
    }
    if (a === 'pick') {
      const pl = d.conflicts.find((c) => c.markKey === m.key)?.places[0];
      if (pl) p.select(pl.place, 'conflict');
      return;
    }
    await act('decide', { markKey: m.key, action: a });
  };

  const openFact = (f: FactView | { where?: { place: Place } }, rowId: string, el: HTMLElement | null): void => {
    if (f.where) p.select(f.where.place, rowId, el);
  };
  const fieldOf = (key: string, fallback: string): string => texts[key] ?? fallback;

  const blocked = !!d.lock && !d.lock.mine;
  const editing = ed.editing && !blocked;
  const isText = d.kind === 'voiceover' || d.kind === 'leadin';
  const pendingMarks = d.marks.filter((m) => m.pending);
  const sourceOf = (rowId: string, el: ReactNode) => (
    <Fragment key={rowId}>
      {el}
      {p.inlineHere(rowId) && <div className="inline-source">{p.pane}</div>}
    </Fragment>
  );

  const textRow = (s: SentenceView, i: number) => {
    const selected = p.sel?.rowId === s.id;
    const sMarks = d.marks.filter((m) => s.markKeys.includes(m.key));
    return sourceOf(
      s.id,
      <div className={`line${selected ? ' selected' : ''}`} key={s.id} id={`row-${s.id}`}>
        <div className="gutter">
          {s.facts.map((f) =>
            f.status === 'linked' ? (
              <button key={f.index} type="button" tabIndex={-1} className="src" onClick={(e) => openFact(f, s.id, e.currentTarget)}>
                {f.where?.label}<small>{f.where?.sourceName}</small>
                {f.manualBy && <small className="manual">вручную: {f.manualBy}</small>}
              </button>
            ) : f.status === 'taken' ? (
              <div key={f.index} className="src taken">Взято на себя<small>{f.takenBy}</small></div>
            ) : (
              <div key={f.index} className="src none">нет исходника</div>
            ),
          )}
          {sMarks.filter((m) => m.pending && (m.kind === 'unverifiable' || m.kind === 'sentence_flag')).map((m) => (
            <div key={m.key} className="src none">{m.kind === 'unverifiable' ? 'не проверено' : 'проверьте'}</div>
          ))}
          {s.checking && <div className="src none">…</div>}
        </div>
        <div>
          {editing ? (
            <>
              <label className="sr" htmlFor={`ta-${s.id}`}>Предложение {i + 1}</label>
              <textarea
                id={`ta-${s.id}`} data-edit={`s:${s.id}`} rows={3} maxLength={300} value={fieldOf(`s:${s.id}`, s.text)}
                onChange={(e) => { setTexts({ ...texts, [`s:${s.id}`]: e.target.value }); ed.change(`s:${s.id}`, { op: 'setText', sentenceId: s.id, text: e.target.value }, e.target.value); }}
              />
              <button type="button" className="btn link" aria-label={`Удалить предложение ${i + 1}`} onClick={() => void ed.run({ op: 'removeSentence', sentenceId: s.id }, '')}>Удалить предложение</button>
            </>
          ) : (
            <p className="text">
              {s.pieces.map((pc, k) => {
                if (pc.fact === null) return <span key={k}>{pc.text}</span>;
                const f = s.facts[pc.fact]!;
                if (f.status === 'linked')
                  return (
                    <Inline key={k} className={`fact${selected ? ' on' : ''}`} onActivate={(el) => openFact(f, s.id, el)}>
                      {pc.text}<span className="sr">. {f.manualBy ? `Исходник указал вручную ${f.manualBy}` : 'Исходник'}: {f.where?.sourceName}, {f.where?.label}</span>
                    </Inline>
                  );
                if (f.status === 'taken') return <span key={k} className="taken-word">{pc.text}</span>;
                return (
                  <Inline key={k} className="mark-word" onActivate={() => jumpToMark(f.markKey)}>
                    {pc.text}<span className="sr">. Пометка: факт без исходника. Действия в списке пометок</span>
                  </Inline>
                );
              })}
            </p>
          )}
          {s.checking && <p className="checking" role="status">Ищем исходник</p>}
        </div>
      </div>,
    );
  };

  const syncRow = (it: SyncView, i: number) => {
    const selected = p.sel?.rowId === it.id;
    const startRef = `y:${it.id}:start`;
    return sourceOf(
      it.id,
      <div className={`line${selected ? ' selected' : ''}`} key={it.id} id={`row-${it.id}`}>
        <div className="gutter sync-bracket">
          <button type="button" tabIndex={-1} className="src" onClick={(e) => openFact(it, it.id, e.currentTarget)}>
            {it.where.label}<small>{clock(it.durationMs)} · {it.where.sourceName}</small>
          </button>
          <span className="br" aria-hidden="true" />
        </div>
        <div>
          <p className="text">
            <strong>{it.speaker}. </strong>
            <Inline className={`fact${selected ? ' on' : ''}`} onActivate={(el) => openFact(it, it.id, el)}>
              {it.text}<span className="sr">. Синхрон {i + 1}. Исходник: {it.where.sourceName}, {it.where.label}</span>
            </Inline>
          </p>
          {editing && (
            <div className="form-row">
              <label>Начало, с <input type="number" min={0} step={0.5} defaultValue={it.startMs / 1000} data-edit={startRef} onBlur={(e) => void ed.run({ op: 'syncRange', itemId: it.id, startMs: Math.round(Number(e.target.value) * 1000), endMs: it.endMs }, '')} /></label>
              <label>Конец, с <input type="number" min={0} step={0.5} defaultValue={it.endMs / 1000} onBlur={(e) => void ed.run({ op: 'syncRange', itemId: it.id, startMs: it.startMs, endMs: Math.round(Number(e.target.value) * 1000) }, '')} /></label>
              <button type="button" className="btn link" aria-label={`Удалить синхрон ${i + 1}`} onClick={() => void ed.run({ op: 'removeSync', itemId: it.id }, '')}>Удалить синхрон</button>
            </div>
          )}
        </div>
      </div>,
    );
  };

  const titleRow = (t: TitleView, i: number) => {
    const selected = p.sel?.rowId === t.id;
    const tv = (f: 'name' | 'position'): string => fieldOf(`t:${t.id}:${f}`, t[f]);
    const changeTitle = (f: 'name' | 'position', v: string): void => {
      const next = { name: tv('name'), position: tv('position'), [f]: v };
      setTexts({ ...texts, [`t:${t.id}:${f}`]: v });
      ed.change(`t:${t.id}`, { op: 'setTitle', itemId: t.id, name: next.name, position: next.position }, v);
    };
    return sourceOf(
      t.id,
      <div className={`line${selected ? ' selected' : ''}`} key={t.id} id={`row-${t.id}`}>
        <div className="gutter">
          {t.where && t.status !== 'no_source' ? (
            <button type="button" tabIndex={-1} className="src" onClick={(e) => openFact(t, t.id, e.currentTarget)}>
              {t.where.label}<small>{t.where.sourceName}</small>
              {t.manualBy && <small className="manual">вручную: {t.manualBy}</small>}
            </button>
          ) : t.status === 'taken' ? (
            <div className="src taken">Взято на себя<small>{t.takenBy}</small></div>
          ) : (
            <div className="src none">нет исходника</div>
          )}
        </div>
        <div className="stack">
          {editing ? (
            <div className="stack">
              <label className="stack"><span className="label">ФИО, титр {i + 1}</span>
                <input type="text" data-edit={`t:${t.id}:name`} value={tv('name')} maxLength={120} onChange={(e) => changeTitle('name', e.target.value)} /></label>
              <label className="stack"><span className="label">Должность, титр {i + 1}</span>
                <input type="text" value={tv('position')} maxLength={120} onChange={(e) => changeTitle('position', e.target.value)} /></label>
              <button type="button" className="btn link" aria-label={`Удалить титр ${i + 1}`} onClick={() => void ed.run({ op: 'removeTitle', itemId: t.id }, '')}>Удалить титр</button>
            </div>
          ) : (
            <button type="button" className={`plate${t.overflow.length ? ' over' : ''}`} style={{ border: 0, textAlign: 'left', cursor: t.where ? 'pointer' : 'default' }} onClick={(e) => openFact(t, t.id, e.currentTarget)}>
              <div>{t.name}</div>
              <div className="pos">{t.position}</div>
              {t.where && <span className="sr">. {t.manualBy ? `Исходник указал вручную ${t.manualBy}` : 'Исходник'}: {t.where.sourceName}, {t.where.label}</span>}
            </button>
          )}
          <div className="form-row">
            <span className="muted">Говорящий: {t.speaker}.</span>
            <span className={`tag${t.dir === 'ok' ? ' approved' : ' check'}`}>{t.dirText}</span>
            {t.overflow.map((o) => <span key={o} className="tag check">Не влезает в плашку: {o}</span>)}
          </div>
        </div>
      </div>,
    );
  };

  // transcript: paragraphs by speaker
  const segRows = () => {
    const rows: ReactNode[] = [];
    let last = '';
    for (const s of story.segments) {
      const key = `${s.videoId}:${s.speaker}`;
      const run = `${s.videoId}|${s.speaker}`;
      if (run !== last) {
        last = run;
        const sp = story.speakers.find((x) => x.videoId === s.videoId && x.speaker === s.speaker)!;
        rows.push(
          <div className="turn" key={`turn-${s.id}`}>
            <span className="muted">{sp.videoName}</span>
            {renaming === key ? (
              <form className="form-row" onSubmit={async (e) => {
                e.preventDefault();
                try { apply(await api<StoryView>('POST', `/api/stories/${story.id}/speakers`, { videoId: s.videoId, speaker: s.speaker, name: nameVal })); setRenaming(null); } catch (er) { setMsg((er as Error).message); }
              }}>
                <label className="sr" htmlFor="spk">Имя говорящего</label>
                <input id="spk" type="text" value={nameVal} maxLength={120} onChange={(e) => setNameVal(e.target.value)} data-edit="spk" autoFocus />
                <button type="submit" className="btn small">Сохранить имя</button>
                <button type="button" className="btn small" onClick={() => setRenaming(null)}>Отмена</button>
              </form>
            ) : (
              <button type="button" className="speaker-btn" aria-label={`Переименовать говорящего: ${s.speakerName}`} onClick={() => { setRenaming(key); setNameVal(s.speakerName); }}>{s.speakerName}</button>
            )}
          </div>,
        );
      }
      rows.push(segRow(s));
    }
    return rows;
  };
  const segRow = (s: SegmentView) => {
    const selected = p.sel?.rowId === s.id;
    const long = (story.videos.find((v) => v.id === s.videoId)?.durationMs ?? 0) >= 3600_000;
    const place: Place = { kind: 'video', videoId: s.videoId, startMs: s.startMs, endMs: s.endMs };
    const pending = d.marks.filter((m) => s.markKeys.includes(m.key) && m.pending);
    return sourceOf(
      s.id,
      <div className={`line${selected ? ' selected' : ''}`} key={s.id} id={`row-${s.id}`}>
        <div className="gutter"><button type="button" tabIndex={-1} className="src" onClick={(e) => p.select(place, s.id, e.currentTarget)}>{clock(s.startMs, long)}</button></div>
        <div>
          {editing ? (
            <>
              <label className="sr" htmlFor={`ta-${s.id}`}>Абзац {clock(s.startMs, long)}</label>
              <textarea id={`ta-${s.id}`} data-edit={`g:${s.id}`} rows={2} maxLength={300} value={fieldOf(`g:${s.id}`, s.text)}
                onChange={(e) => { setTexts({ ...texts, [`g:${s.id}`]: e.target.value }); ed.change(`g:${s.id}`, { op: 'setSegment', segmentId: s.id, text: e.target.value }, e.target.value); }} />
            </>
          ) : (
            <p className="text">
              {pending.some((m) => m.kind === 'unclear') ? (
                <Inline className="mark-word" onActivate={() => jumpToMark(pending.find((m) => m.kind === 'unclear')!.key)}>{s.text}<span className="sr">. Пометка: неразборчиво</span></Inline>
              ) : (
                <Inline className={`fact${selected ? ' on' : ''}`} onActivate={(el) => p.select(place, s.id, el)}>{s.text}<span className="sr">. Исходник: {s.speakerName}, {clock(s.startMs, long)}</span></Inline>
              )}
              {s.flags.includes('not_russian') && <> <span className="tag check">Речь не на русском</span></>}
            </p>
          )}
        </div>
      </div>,
    );
  };

  const stateTag = <span className={`tag ${tagClass(d)}`}>{d.stateWord}</span>;
  const approveReason = d.approveBlock;
  const unsent = ed.leftovers;

  return (
    <section className="center" aria-label="Черновик">
      {d.returned && (
        <div className="band returned" role="note">
          <b>Вернул(а) {d.returned.by}, {fmtDateTime(d.returned.at)}</b>
          <span>{d.returned.comment}</span>
        </div>
      )}
      {d.failure && (
        <div className="band error" role="alert">
          <b>Сбой № {d.failure.no}</b>
          <span>{d.failure.text}. {d.failure.detail}</span>
          <div><button type="button" className="btn" onClick={() => void act('retry')}>Повторить</button></div>
        </div>
      )}
      {d.state === 'preparing' && <div className="band info"><b role="status">Готовится</b><span>{story.processing ? `${story.processing.label}. Осталось примерно ${Math.max(1, Math.round(story.processing.remainingMs / 1000))} с` : 'Черновик скоро откроется'}</span></div>}
      {d.state === 'not_built' && <div className="band check" role="note"><b>Не построен: мало материала</b><span>{d.notBuiltNote ? `Не хватает: ${d.notBuiltNote}.` : ''} Принять как есть, дописать вручную или отметить, что черновик не нужен.</span></div>}
      {unsent.length > 0 && (
        <div className="band returned" role="alert">
          <b>Черновик изменился, пока не было связи. Ничего не применено. Перенесите текст вручную:</b>
          {unsent.map((t, i) => <span key={i}>«{t}»</span>)}
          <div><button type="button" className="btn small" onClick={ed.dismissLeftovers}>Закрыть</button></div>
        </div>
      )}

      {d.state !== 'failed' && d.state !== 'preparing' && (
      <article className="sheet" ref={sheetRef}>
        <header className="sheet-head">
          <div>
            <h2>{d.name}</h2>
            <div className="sub">
              <span>Версия {d.version} · {d.lastEditAt ? `правил ${d.lastEditor}, ${fmtTime(d.lastEditAt)}` : d.lastEditor}</span>
              {isText && <span>{d.words} {plural(d.words, 'слово', 'слова', 'слов')} · ≈ {d.seconds} с</span>}
              {d.kind === 'leadin' && <span>Идёт и в суфлёр</span>}
            </div>
          </div>
          <div className="sheet-tags">
            {stateTag}
            {d.modifiedAfterExport && <span className="tag check">Изменён после выгрузки</span>}
            {d.reapproveReason && <span className="tag">Причина: {d.reapproveReason}</span>}
            {d.directoryNotice && <span className="tag">Справочник изменился</span>}
            {d.lock && !d.lock.mine && <span className="tag" role="status">Сейчас правит {d.lock.by}. Только чтение</span>}
          </div>
        </header>
        {d.approval && (
          <div style={{ padding: '12px 24px 0' }}>
            <div className="approval-mark"><b>Утверждено</b>{d.approval.by}, {fmtDateTime(d.approval.at)}<br />Версия {d.approval.version} · Автор последней правки: {d.approval.lastEditor}</div>
          </div>
        )}
        <div className="sheet-body">
            <>
              {d.kind !== 'transcript' && <div className="col-labels" aria-hidden="true"><span>Исходник</span><span>{d.name}</span></div>}
              {d.kind === 'transcript' && segRows()}
              {isText && d.sentences.map(textRow)}
              {d.kind === 'syncs' && d.syncs.map(syncRow)}
              {d.kind === 'titles' && d.titles.map(titleRow)}
              {isText && d.sentences.length === 0 && <p className="muted">В черновике пока нет предложений.</p>}
              {editing && isText && (
                <div className="stack">
                  <label className="stack"><span className="label">Новое предложение</span>
                    <textarea data-edit="new" rows={2} maxLength={300} value={newText} onChange={(e) => setNewText(e.target.value)} /></label>
                  <div><button type="button" className="btn small" onClick={async () => { if (await ed.run({ op: 'addSentence', afterId: d.sentences.at(-1)?.id ?? null, text: newText }, newText)) setNewText(''); }}>Добавить предложение</button></div>
                </div>
              )}
            </>
        </div>
        <footer className="sheet-foot">
          <span>
            {p.picking ? 'Выберите место справа' : 'Нажмите на факт, чтобы сверить исходник'}
          </span>
          <span className="edit-tools">
            <span role="status" aria-live="polite">
              {ed.save.status === 'saving' ? 'Сохраняем…' : ed.save.status === 'saved' ? `Сохранено ${fmtTime(ed.save.at!)}` : ed.save.status === 'offline' ? 'Не сохранено: нет связи' : ed.save.status === 'error' ? `Не сохранено: ${ed.save.message}` : ''}
            </span>
            {d.mayEdit && !editing && <button type="button" className="btn small" aria-disabled={blocked} onClick={() => !blocked && startEdit()}>Править черновик</button>}
            {editing && <button type="button" className="btn small" onClick={() => void ed.stop()}>Закончить правку</button>}
            {p.picking && <button type="button" className="btn small" onClick={() => p.setPicking(null)}>Отменить выбор места</button>}
          </span>
        </footer>
      </article>
      )}
      {(ed.error || msg) && <p className="field-error" role="alert">{ed.error || msg}</p>}

      <section className="marks" aria-label="Пометки">
        {d.marks.length > 0 && <h3>Пометки: {pendingMarks.length > 0 ? `${pendingMarks.length} ждут решения` : 'решены'}</h3>}
        <ul className="marks">
          {d.marks.map((m) => (
            <li key={m.key} id={`mark-${m.key}`} tabIndex={-1} className={`mark${m.pending ? '' : ' decided'}`}>
              <div className="what">
                <b>{m.label}</b>
                <span>{m.text}</span>
                {!m.pending && <span className={`tag ${m.decision?.kind === 'take' ? 'approved' : ''}`}>{decisionText(m, story)}</span>}
              </div>
              <div className="btns">
                {m.pending
                  ? m.actions.filter((a) => !(a === 'take' && user?.role === 'chief') && !(a === 'add_dir' && user?.role === 'correspondent')).map((a) => (
                      <button key={a} type="button" className="btn link" onClick={() => void markAction(m, a)}>{a === 'remove' && m.kind === 'title_no_source' ? 'Удалить титр' : a === 'write' && m.kind === 'insufficient' ? 'Дописать вручную' : ACTION_TEXT[a]}</button>
                    ))
                  : d.state !== 'approved' && <button type="button" className="btn link" onClick={() => void act('decide', { markKey: m.key, action: 'undo' })}>Отменить</button>}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="review-note" role="status">
        <span className={`icon${approveReason && d.state !== 'approved' ? '' : ' ok'}`} aria-hidden="true">{approveReason && d.state !== 'approved' ? '!' : '✓'}</span>
        <div>
          {pendingMarks.length > 0 ? (
            <>
              <b>{user?.canApprove ? 'Утверждение недоступно: ' : ''}</b>
              <button type="button" className="btn link" onClick={() => jumpToMark(pendingMarks[0]!.key)}>{marksWord(pendingMarks.length)} {plural(pendingMarks.length, 'ждёт', 'ждут', 'ждут')} решения</button>
            </>
          ) : d.state === 'approved' ? (
            <b>{d.name}: утверждено. Можно выгружать.</b>
          ) : user?.canApprove && approveReason ? (
            <b>Утверждение недоступно: {approveReason}.</b>
          ) : (
            <b>{d.state === 'review' ? 'Черновик на проверке у утверждающего.' : 'Пометок без решения нет.'}</b>
          )}
        </div>
      </div>
      {d.manualSources > 0 && d.state !== 'approved' && (
        <div className="review-note" role="note">
          <span className="icon" aria-hidden="true">!</span>
          <p>
            <b>Исходник указан вручную в {d.manualSources} {plural(d.manualSources, 'месте', 'местах', 'местах')}.</b> В колонке таймкодов подпись «вручную». Сервис сам этот исходник не искал: он только нашёл цитату в выбранном месте. Совпадает ли смысл, проверьте перед утверждением.
          </p>
        </div>
      )}

      <div className="actions">
        {d.mayReturn && <button type="button" className="btn" onClick={() => setDlg({ type: 'return' })}>Вернуть с комментарием</button>}
        {d.mayApprove && !['failed', 'not_needed'].includes(d.state) && d.state !== 'approved' && (
          <>
            <button
              type="button" className="btn primary" aria-disabled={!!approveReason || !online} aria-describedby="why-approve"
              onClick={() => !approveReason && online && void act('approve', { version: d.version, basedOn: d.basedOn, clickKey: approveKey })}
            >
              {d.approveLabel}
            </button>
            {(approveReason || !online) && <span id="why-approve" className="note">{!online ? 'Без связи утвердить нельзя' : approveReason}</span>}
          </>
        )}
        {d.maySubmit && <button type="button" className="btn primary" onClick={() => void act('submit')}>Отправить на проверку</button>}
        {d.mayNotNeeded && (
          <button type="button" className="btn" onClick={() => void act('not-needed', { on: d.state === 'not_built' })}>{d.state === 'not_built' ? 'Не нужен в этом сюжете' : 'Вернуть в работу'}</button>
        )}
        {d.state === 'approved' && (
          <>
            <button type="button" className="btn primary" aria-disabled={!online} onClick={() => online && void exportOne('docx')}>Выгрузить в DOCX</button>
            <button type="button" className="btn" aria-disabled={!online} onClick={() => online && void exportOne('txt')}>Выгрузить в текстовый файл</button>
            {d.kind === 'leadin' && <label className="check-row"><input type="checkbox" checked={noHeader} onChange={(e) => setNoHeader(e.target.checked)} /><span>Без шапки, для суфлёра</span></label>}
          </>
        )}
      </div>
      <p className="journal-line" aria-live="polite" role="status">
        {d.lastJournal ? `${fmtTime(d.lastJournal.at)} · ${d.lastJournal.text}` : ''}
      </p>

      {dlg?.type === 'return' && <ReturnDialog story={story} draft={d} onClose={() => setDlg(null)} onDone={apply} />}
      {dlg?.type === 'take' && (
        <TakeDialog
          mark={dlg.mark!} onClose={() => setDlg(null)}
          onDone={async (reason) => { if (await act('decide', { markKey: dlg.mark!.key, action: 'take', reason: reason || undefined })) setDlg(null); }}
        />
      )}
      {dlg?.type === 'confirmEdit' && (
        <Modal title="Править утверждённый черновик?" onClose={() => setDlg(null)}>
          <p>Правка снимет утверждение: черновик придётся утвердить снова.</p>
          <div className="dlg-actions">
            <button type="button" className="btn" data-autofocus onClick={() => setDlg(null)}>Отмена</button>
            <button type="button" className="btn primary" onClick={async () => { setDlg(null); await ed.start(true); }}>Править</button>
          </div>
        </Modal>
      )}
    </section>
  );

  async function exportOne(format: 'docx' | 'txt'): Promise<void> {
    try {
      const name = await download(`/api/stories/${story.id}/export`, { kinds: [d.kind], format, noHeader: format === 'txt' && d.kind === 'leadin' && noHeader, clickKey: exportKey.current });
      announce(`Файл выгружен: ${name}`);
      setMsg('');
      exportKey.current = crypto.randomUUID();
    } catch (e) {
      // the server may have recorded the export before the answer was lost: a retry keeps the key
      setMsg((e as ApiError).message);
    }
  }
}

function decisionText(m: Mark, story: StoryView): string {
  const d = m.decision!;
  const who = story.me.id === d.userId ? story.me.name : '';
  const base: Record<string, string> = {
    take: 'Взято на себя', confirm: 'Подтверждено', keep: 'Оставлено неразборчивым', checked: 'Проверено', pick: 'Исходник выбран', accept: 'Принято как есть',
  };
  return `${base[d.kind] ?? d.kind}${who ? `: ${who}` : ''}${d.reason ? `. Причина: ${d.reason}` : ''}`;
}

function ReturnDialog(p: { story: StoryView; draft: DraftView; onClose: () => void; onDone: (v: StoryView) => void }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  return (
    <Modal title={`Вернуть: ${p.draft.name.toLowerCase()}`} onClose={p.onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return setErr('Напишите, что исправить');
          try {
            p.onDone(await api<StoryView>('POST', `/api/stories/${p.story.id}/drafts/${p.draft.kind}/return`, { comment: text }));
            p.onClose();
          } catch (er) {
            setErr((er as Error).message);
          }
        }}
      >
        <label className="stack">
          <span className="muted">Комментарий для {p.story.correspondent}</span>
          <textarea rows={4} value={text} maxLength={500} aria-invalid={!!err} aria-describedby="ret-err" data-autofocus onChange={(e) => { setText(e.target.value); setErr(''); }} />
        </label>
        <p id="ret-err" className="field-error" role="alert">{err}</p>
        <div className="dlg-actions">
          <button type="button" className="btn" onClick={p.onClose}>Отмена</button>
          <button type="submit" className="btn primary">Вернуть с комментарием</button>
        </div>
      </form>
    </Modal>
  );
}

function TakeDialog(p: { mark: Mark; onClose: () => void; onDone: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState('');
  return (
    <Modal title="Взять на себя?" onClose={p.onClose}>
      <p>{p.mark.text}</p>
      <p className="muted">Факт останется в тексте без жёлтого. В журнале запишут, кто и когда его взял. До утверждения это можно отменить.</p>
      <label className="stack">
        <span className="label">Причина (по желанию)</span>
        <textarea rows={3} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} data-autofocus />
      </label>
      <div className="dlg-actions">
        <button type="button" className="btn" onClick={p.onClose}>Отмена</button>
        <button type="button" className="btn primary" onClick={() => void p.onDone(reason)}>Взять на себя</button>
      </div>
    </Modal>
  );
}

