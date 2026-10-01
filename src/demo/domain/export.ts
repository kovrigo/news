import { DemoError, type Ctx, type Draft, type Kind, type State, type Story } from './types.ts';
import { fmtClock, fmtDateTime } from '../format.ts';
import { DRAFT_NAMES, E, EXPORT_BANNER, TIME_ZONE } from '../texts.ts';
import { addJournal } from './journal.ts';
import { zip, type ZipEntry } from './zip.ts';

export type Format = 'txt' | 'docx';
export type ExportFile = { name: string; mime: string; bytes: Uint8Array };

const enc = new TextEncoder();
const speakerName = (story: Story, videoId: string, speaker: number): string => story.speakerNames[`${videoId}:${speaker}`] ?? `Спикер ${speaker}`;
const videoName = (story: Story, id: string): string => story.videos.find((v) => v.id === id)?.name ?? id;
const userName = (state: State, id: string | null): string => (id ? (state.users.find((u) => u.id === id)?.name ?? '') : '');

// One description of the content; the text file and the DOCX both come from it.
export function describe(state: State, story: Story, d: Draft): { header: string[]; body: string[] } {
  const a = d.approval!;
  const header = [
    `Сюжет: ${story.title}`,
    `Черновик: ${DRAFT_NAMES[d.kind]}`,
    `Утвердил: ${userName(state, a.userId)}, ${fmtDateTime(a.at)} (${TIME_ZONE})`,
    `Версия: ${a.version}`,
  ];
  const body: string[] = [];
  if (d.kind === 'transcript') {
    for (const s of story.segments) {
      body.push(`${fmtClock(s.startMs, true)} · ${videoName(story, s.videoId)} · ${speakerName(story, s.videoId, s.speaker)}`, s.text, '');
    }
  } else if (d.kind === 'syncs') {
    d.syncs.forEach((it, i) => {
      const segs = story.segments.filter((s) => s.videoId === it.videoId && s.startMs < it.endMs && s.endMs > it.startMs);
      body.push(
        `Синхрон ${i + 1}`,
        `Начало: ${fmtClock(it.startMs, true)}`,
        `Конец: ${fmtClock(it.endMs, true)}`,
        `Длительность: ${fmtClock(it.endMs - it.startMs, true)}`,
        `Говорящий: ${segs[0] ? speakerName(story, it.videoId, segs[0].speaker) : ''}`,
        `Текст: ${segs.map((s) => s.text).join(' ')}`,
        '',
      );
    });
  } else if (d.kind === 'titles') {
    for (const t of d.titles) body.push(`${t.name} — ${t.position}`);
  } else {
    for (const s of d.sentences) body.push(s.text);
  }
  return { header, body };
}

export function toText(header: string[], body: string[], noHeader: boolean): Uint8Array {
  const dash = '-'.repeat(40);
  const lines = noHeader ? [EXPORT_BANNER, '', ...body] : [EXPORT_BANNER, ...header, dash, ...body];
  return enc.encode('﻿' + lines.join('\r\n') + '\r\n');
}

const esc = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const DOC_CT = 'application/vnd.openxmlformats-officedocument.wordprocessingml';

export function toDocx(header: string[], body: string[]): Uint8Array {
  const paras = [EXPORT_BANNER, ...header, '', ...body]
    .map((t) => (t === '' ? '<w:p/>' : `<w:p><w:r><w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`))
    .join('');
  const xml = (s: string): Uint8Array => enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${s}`);
  const files: ZipEntry[] = [
    { name: '[Content_Types].xml', data: xml(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="${DOC_CT}.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="${DOC_CT}.styles+xml"/></Types>`) },
    { name: '_rels/.rels', data: xml('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>') },
    { name: 'word/_rels/document.xml.rels', data: xml('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>') },
    { name: 'word/styles.xml', data: xml(`<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="24"/><w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`) },
    { name: 'word/document.xml', data: xml(`<w:document xmlns:w="${W}"><w:body>${paras}</w:body></w:document>`) },
  ];
  return zip(files);
}

// Names: Windows-forbidden characters become a dash; at most 100 characters including the extension.
export function fileName(base: string, ext: string): string {
  const clean = base.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/, '');
  return `${clean.slice(0, 100 - ext.length - 1).replace(/[. ]+$/, '')}.${ext}`;
}

export function exportDrafts(
  state: State,
  ctx: Ctx,
  story: Story,
  a: { kinds: Kind[]; format: Format; noHeader: boolean; clickKey: string },
): ExportFile {
  if (a.kinds.length === 0) throw new DemoError(400, E.exportNothing);
  const drafts = a.kinds.map((k) => story.drafts.find((d) => d.kind === k)!);
  for (const d of drafts) if (d.state !== 'approved' || !d.approval) throw new DemoError(403, E.notApproved);
  const key = `export:${story.id}:${a.clickKey}`;
  if (!(key in state.keys)) {
    let last = 0;
    for (const d of drafts) {
      d.exportedAt = ctx.now;
      d.modifiedAfterExport = false;
      last = addJournal(state, ctx, story, 'export', { draft: d.kind, detail: a.format === 'docx' ? 'DOCX' : 'текстовый файл' }).id;
    }
    state.keys[key] = last;
  }
  const one = (d: Draft): ExportFile => {
    const { header, body } = describe(state, story, d);
    const base = `${story.title} — ${DRAFT_NAMES[d.kind]}`;
    if (a.format === 'docx') return { name: fileName(base, 'docx'), mime: `${DOC_CT}.document`, bytes: toDocx(header, body) };
    return { name: fileName(base, 'txt'), mime: 'text/plain; charset=utf-8', bytes: toText(header, body, a.noHeader && d.kind === 'leadin') };
  };
  const files = drafts.map(one);
  if (files.length === 1) return files[0]!;
  return { name: fileName(story.title, 'zip'), mime: 'application/zip', bytes: zip(files.map((f) => ({ name: f.name, data: f.bytes }))) };
}
