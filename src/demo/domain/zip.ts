import { crc32, deflateRawSync } from 'node:zlib';

export type ZipEntry = { name: string; data: Uint8Array };

// Smallest ZIP writer: deflated entries, UTF-8 names.
export function zip(entries: ZipEntry[], at = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const time = (at.getUTCHours() << 11) | (at.getUTCMinutes() << 5) | (at.getUTCSeconds() >> 1);
  const date = (Math.max(0, at.getUTCFullYear() - 1980) << 9) | ((at.getUTCMonth() + 1) << 5) | at.getUTCDate();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (v: DataView, o: number, n: number): void => v.setUint16(o, n, true);
  const u32 = (v: DataView, o: number, n: number): void => v.setUint32(o, n, true);
  for (const e of entries) {
    const name = enc.encode(e.name);
    const packed = deflateRawSync(e.data);
    const crc = crc32(e.data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    u32(lv, 0, 0x04034b50); u16(lv, 4, 20); u16(lv, 6, 0x0800); u16(lv, 8, 8); u16(lv, 10, time); u16(lv, 12, date);
    u32(lv, 14, crc); u32(lv, 18, packed.length); u32(lv, 22, e.data.length); u16(lv, 26, name.length); u16(lv, 28, 0);
    local.set(name, 30);
    const cen = new Uint8Array(46 + name.length);
    const cv = new DataView(cen.buffer);
    u32(cv, 0, 0x02014b50); u16(cv, 4, 20); u16(cv, 6, 20); u16(cv, 8, 0x0800); u16(cv, 10, 8); u16(cv, 12, time); u16(cv, 14, date);
    u32(cv, 16, crc); u32(cv, 20, packed.length); u32(cv, 24, e.data.length); u16(cv, 28, name.length); u32(cv, 42, offset);
    cen.set(name, 46);
    parts.push(local, packed);
    central.push(cen);
    offset += local.length + packed.length;
  }
  const size = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  u32(ev, 0, 0x06054b50); u16(ev, 8, entries.length); u16(ev, 10, entries.length); u32(ev, 12, size); u32(ev, 16, offset);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of all) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
