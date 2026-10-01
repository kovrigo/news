import { TIME_ZONE } from './texts.ts';

const date = new Intl.DateTimeFormat('ru-RU', { timeZone: TIME_ZONE, day: 'numeric', month: 'long', year: 'numeric' });
const time = new Intl.DateTimeFormat('ru-RU', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false });
const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE });

export const fmtDate = (ms: number): string => date.format(ms).replace(/\s*г\.$/, '');
export const fmtTime = (ms: number): string => time.format(ms);
export const fmtDateTime = (ms: number): string => `${fmtDate(ms)}, ${fmtTime(ms)}`;
export const dayOf = (ms: number): string => dayKey.format(ms);

const p2 = (n: number): string => String(n).padStart(2, '0');
// MM:SS, or H:MM:SS for hours > 0 (or when forced: files always use hours)
export function fmtClock(ms: number, hours = false): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 || hours ? `${p2(h)}:${p2(m)}:${p2(s % 60)}` : `${p2(m)}:${p2(s % 60)}`;
}
export function fmtSpan(a: number, b: number, hours = false): string {
  return `${fmtClock(a, hours)}–${fmtClock(b, hours)}`;
}
export function fmtDuration(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h} ч ${m % 60} мин` : `${m} мин`;
}
