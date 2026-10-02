import { z } from 'zod';

export type AsrSegment = {
  startMs: number;
  endMs: number;
  speaker: number;
  text: string;
  confidence: number; // 0..1
  lang: 'ru' | 'other';
};
export interface Asr {
  name: string;
  transcribe(file: { name: string; bytes: Uint8Array }): Promise<AsrSegment[]>;
}

// Every adapter output, recorded or real, passes this check.
export const asrOutput = z.array(
  z.strictObject({
    startMs: z.number().int().min(0),
    endMs: z.number().int().min(0),
    speaker: z.number().int().min(1),
    text: z.string(),
    confidence: z.number().min(0).max(1),
    lang: z.enum(['ru', 'other']),
  }),
);
