import { z } from 'zod';
import { E } from './texts.ts';

export const BODY_MAX = 8 * 1024;
export const SENTENCE_MAX = 300;
export const COMMENT_MAX = 500;
export const FIELD_MAX = 120;

const id = z.string().min(1).max(64);
const sentence = z.string().max(SENTENCE_MAX, E.sentenceLong);
const comment = z.string().max(COMMENT_MAX, E.commentLong);
const field = z.string().max(FIELD_MAX, E.fieldLong);
const ms = z.number().int().min(0).max(86_400_000);
const so = z.strictObject;

export const empty = so({});
export const login = so({ userId: id });
export const newStory = so({ setId: id });
export const speakers = so({ videoId: id, speaker: z.number().int().min(1).max(99), name: field });
export const lock = so({ confirmed: z.boolean().optional() });
export const edit = so({
  baseVersion: z.number().int().min(0),
  op: z.discriminatedUnion('op', [
    so({ op: z.literal('setText'), sentenceId: id, text: sentence }),
    so({ op: z.literal('addSentence'), afterId: id.nullable(), text: sentence }),
    so({ op: z.literal('removeSentence'), sentenceId: id }),
    so({ op: z.literal('setSource'), sentenceId: id, factIndex: z.number().int().min(0).max(50), ref: id }),
    so({ op: z.literal('removeSync'), itemId: id }),
    so({ op: z.literal('syncRange'), itemId: id, startMs: ms, endMs: ms }),
    so({ op: z.literal('setTitle'), itemId: id, name: field, position: field }),
    so({ op: z.literal('removeTitle'), itemId: id }),
    so({ op: z.literal('setTitleSource'), itemId: id, ref: id }),
    so({ op: z.literal('setSegment'), segmentId: id, text: sentence }),
  ]),
});
export const decide = so({
  markKey: z.string().min(1).max(128),
  action: z.enum(['take', 'confirm', 'keep', 'checked', 'pick', 'accept', 'undo']),
  reason: comment.optional(),
  ref: id.optional(),
});
export const recheck = so({ sentenceId: id });
export const addDir = so({ markKey: z.string().min(1).max(128) });
export const approve = so({ version: z.number().int().min(0), clickKey: z.string().min(8).max(64) });
export const returnDraft = so({ comment });
export const notNeeded = so({ on: z.boolean() });
export const exportBody = so({
  kinds: z.array(z.enum(['transcript', 'syncs', 'titles', 'voiceover', 'leadin'])).min(1).max(5).refine((k) => new Set(k).size === k.length),
  format: z.enum(['txt', 'docx']),
  noHeader: z.boolean(),
  clickKey: z.string().min(8).max(64),
});
export const person = so({ name: field, position: field });
export const place = so({ name: field });
export const staff = so({ canApprove: z.boolean().optional(), enabled: z.boolean().optional() });

// First Russian message of a zod error; unknown or missing fields get the common text.
export function reason(e: z.ZodError): string {
  const m = e.issues.map((i) => i.message).find((t) => /[а-яё]/i.test(t));
  return m ?? E.badBody;
}
