// videoId is "V<n>" (n from 1, story order); docId is "<n>" (n from 1, story order).
export type Segment = {
  id: string; // "S1".. story-wide
  videoId: string;
  startMs: number;
  endMs: number;
  speaker: number; // per video, from 1
  text: string;
  flags: Array<'unclear' | 'not_russian'>;
};
export type DocParagraph = { id: string /* "P<doc>.<n>" */; docId: string; n: number; text: string };
export type Material = { segments: Segment[]; paragraphs: DocParagraph[] };
export type Place =
  | { kind: 'video'; videoId: string; startMs: number; endMs: number }
  | { kind: 'doc'; docId: string; n: number };
