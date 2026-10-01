import { useEffect, useMemo, useRef, useState } from 'react';
import type { Place } from '../../core/source.ts';
import type { DraftView, StoryView } from './api.ts';
import { clock, span } from './shell.tsx';

// the clock shows seconds: four steps a second keep it smooth without re-drawing the panel ten times a second
const PLAYER_TICK_MS = 250;
export type Sel = { place: Place; rowId: string; nonce: number };
const INSTRUCTION = 'В исходнике есть указание. Сервис его не выполнял';
const reduced = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

type Props = {
  story: StoryView;
  draft: DraftView;
  sel: Sel | null;
  picking: boolean;
  onPick: (ref: string) => void;
  onTakeFrom: (markKey: string, ref: string) => void;
  onClose: () => void;
  mode: 'wide' | 'panel' | 'inline';
  open: boolean;
  panelRef: React.RefObject<HTMLElement | null>;
};

export function SourcePane(p: Props) {
  const { story, draft, sel } = p;
  const transcriptOnly = draft.kind === 'transcript';
  const [tab, setTab] = useState<{ kind: 'video' | 'doc'; id: string }>({ kind: 'video', id: story.videos[0]?.id ?? 'V1' });
  const [player, setPlayer] = useState({ t: 0, playing: false, end: 0 });
  const [flash, setFlash] = useState(0);
  const paneEl = useRef<HTMLDivElement>(null);

  // A new selection: show its source, put the video at the start of the fragment, scroll, flash 600 ms.
  useEffect(() => {
    if (!sel) return;
    if (sel.place.kind === 'video') {
      setTab({ kind: 'video', id: sel.place.videoId });
      setPlayer({ t: sel.place.startMs, playing: false, end: sel.place.endMs });
    } else {
      setTab({ kind: 'doc', id: sel.place.docId });
    }
    setFlash(sel.nonce);
    const t = setTimeout(() => setFlash(0), 600);
    const s = setTimeout(() => {
      paneEl.current?.querySelector('.frag.selected')?.scrollIntoView({ behavior: reduced() ? 'instant' : 'smooth', block: 'nearest' });
    }, 30);
    return () => {
      clearTimeout(t);
      clearTimeout(s);
    };
  }, [sel?.nonce]);

  const video = story.videos.find((v) => v.id === (tab.kind === 'video' ? tab.id : sel?.place.kind === 'video' ? sel.place.videoId : story.videos[0]?.id));
  const duration = video?.durationMs ?? 0;
  useEffect(() => {
    if (!player.playing) return;
    const i = setInterval(() => {
      setPlayer((s) => {
        const next = s.t + PLAYER_TICK_MS;
        const stop = s.end > 0 ? s.end : duration;
        return next >= stop ? { ...s, t: stop, playing: false } : { ...s, t: next };
      });
    }, PLAYER_TICK_MS);
    return () => clearInterval(i);
  }, [player.playing, duration]);

  const segs = useMemo(() => story.segments.filter((s) => s.videoId === video?.id), [story, video?.id]);
  const hitSegs = (s: (typeof segs)[number]): boolean => sel?.place.kind === 'video' && sel.place.videoId === s.videoId && s.startMs < sel.place.endMs && s.endMs > sel.place.startMs;
  const selIdx = segs.flatMap((s, i) => (hitSegs(s) ? [i] : []));
  const shown = p.picking || transcriptOnly ? [] : selIdx.length ? segs.slice(Math.max(0, selIdx[0]! - 2), selIdx[selIdx.length - 1]! + 3) : segs.slice(0, 4);
  const pickShown = p.picking ? segs : shown;
  const nowSeg = segs.find((s) => player.t >= s.startMs && player.t < s.endMs);
  const long = duration >= 3600_000;
  const doc = story.docs.find((d) => d.id === tab.id);
  const textOf = (ref: string): string => story.segments.find((s) => s.id === ref)?.text ?? story.docs.flatMap((d) => d.paragraphs).find((x) => x.id === ref)?.text ?? '';
  const flashing = (selected: boolean): string => `frag${selected ? ' selected' : ''}${selected && flash ? ' flash' : ''}`;

  const toggle = (): void =>
    setPlayer((s) => {
      if (s.playing) return { ...s, playing: false };
      const stop = s.end > 0 ? s.end : duration;
      return { ...s, playing: true, t: s.t >= stop ? (s.end > 0 && sel?.place.kind === 'video' ? sel.place.startMs : 0) : s.t };
    });

  return (
    <aside
      className={`right${p.mode === 'panel' && !p.open ? ' closed' : ''}`}
      aria-label="Исходники"
      ref={p.panelRef as React.RefObject<HTMLElement>}
      tabIndex={-1}
    >
      <div className="right-head">
        <h2>Исходники</h2>
        <span className="note">{story.sourceCount} {story.sourceCount === 1 ? 'файл' : 'файла'}</span>
        <button type="button" className="btn small panel-close" onClick={p.onClose}>Закрыть исходник</button>
      </div>
      <div ref={paneEl}>
        <div className="switcher" role="group" aria-label="Переключатель исходников">
          {story.videos.map((v, i) => (
            <button key={v.id} type="button" className="btn small" aria-pressed={tab.kind === 'video' && tab.id === v.id} onClick={() => { setTab({ kind: 'video', id: v.id }); setPlayer({ t: 0, playing: false, end: 0 }); }}>
              Видео {i + 1}
            </button>
          ))}
          {!transcriptOnly && story.docs.map((d, i) => (
            <button key={d.id} type="button" className="btn small" aria-pressed={tab.kind === 'doc' && tab.id === d.id} onClick={() => setTab({ kind: 'doc', id: d.id })}>
              Документ {i + 1}
            </button>
          ))}
        </div>

        {draft.conflicts.length > 0 && !transcriptOnly && (
          <section aria-label="Расхождения исходников">
            {draft.conflicts.map((c) => {
              const pending = draft.marks.find((m) => m.key === c.markKey);
              return (
                <div className="conflict" key={c.markKey} id={`conflict-${c.markKey}`}>
                  <strong>Исходники расходятся</strong>
                  <p>{c.note}</p>
                  {c.places.map((pl) => (
                    <div key={pl.ref} className="frag">
                      <span className="t">{pl.label} · {pl.sourceName}</span>
                      <span>{textOf(pl.ref ?? '')}</span>
                      {pending?.pending && (
                        <button type="button" className="btn small" aria-label={`Взять отсюда: ${pl.sourceName}, ${pl.label}`} onClick={() => p.onTakeFrom(c.markKey, pl.ref!)}>Взять отсюда</button>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </section>
        )}

        {tab.kind === 'video' && video && (
          <section aria-label={`Видео: ${video.name}`}>
            <div className="video">
              <strong>{video.name}</strong>
              <small>Видео в демо не настоящее. Показан таймкод и текст расшифровки.</small>
            </div>
            <div className="controls">
              <button type="button" className="btn" onClick={toggle}>{player.playing ? 'Пауза' : 'Воспроизвести'}</button>
              <span className="mono"><span className="sr">Текущее время: </span>{clock(player.t, long)}</span>
              <input
                type="range" min={0} max={duration} step={100} value={player.t}
                aria-label="Положение в видео" aria-valuetext={clock(player.t, long)}
                onChange={(e) => setPlayer({ t: Number(e.target.value), playing: false, end: 0 })}
              />
              <span className="mono">{clock(duration, long)}</span>
            </div>
            <p className="now-text"><span className="sr">Текст в этом месте: </span>{nowSeg ? <>«{nowSeg.text}»</> : <span className="muted">В этом месте речи нет</span>}</p>
            {!transcriptOnly && (
              <section aria-label="Расшифровка вокруг места">
                <h3>{p.picking ? 'Выберите место' : 'Расшифровка'}</h3>
                {pickShown.map((s) => (
                  <div className={flashing(hitSegs(s))} key={s.id} data-frag={s.id}>
                    <span className="t">{span(s.startMs, s.endMs, long)}</span>
                    <span className="who">{s.speakerName}</span>
                    <span>{s.text}</span>
                    {s.instruction && <span className="instr">{INSTRUCTION}</span>}
                    {p.picking && <button type="button" className="btn small" aria-label={`Выбрать это место: ${span(s.startMs, s.endMs, long)}`} onClick={() => p.onPick(s.id)}>Выбрать это место</button>}
                  </div>
                ))}
              </section>
            )}
          </section>
        )}

        {tab.kind === 'doc' && doc && !transcriptOnly && (
          <section aria-label={`Документ: ${doc.name}`}>
            <h3 className="doc-title">{doc.name}</h3>
            <p className="note">Документ · {doc.paragraphs.length} {doc.paragraphs.length === 1 ? 'абзац' : 'абзацев'}</p>
            {doc.paragraphs.map((x) => {
              const on = sel?.place.kind === 'doc' && sel.place.docId === doc.id && sel.place.n === x.n;
              return (
                <div className={flashing(on)} key={x.id} data-frag={x.id}>
                  <span className="t">Абзац {x.n}</span>
                  <span>{x.text}</span>
                  {x.instruction && <span className="instr">{INSTRUCTION}</span>}
                  {p.picking && <button type="button" className="btn small" aria-label={`Выбрать это место: абзац ${x.n}`} onClick={() => p.onPick(x.id)}>Выбрать это место</button>}
                </div>
              );
            })}
          </section>
        )}
        <p className="source-foot">Ссылка подтверждает, что факт есть в исходнике. Достоверность проверяет редактор.</p>
      </div>
    </aside>
  );
}
