import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import { MOCK_UNKNOWN } from '../../core/failures.ts';
import type { DraftKind, DraftModel } from './types.ts';

export const mockKey = (kind: DraftKind, material: string): string =>
  createHash('sha256').update(`${kind}\n${material}`).digest('hex');

const recording = z.strictObject({ raw: z.string(), costRub: z.number().min(0) });

// Recordings live in <storyDir>/llm/<sha256 of kind + "\n" + material>.json.
export function mockModel(storyDir: string): DraftModel {
  return {
    name: 'mock',
    async build(req) {
      const rec = Bun.file(join(storyDir, 'llm', `${mockKey(req.kind, req.material)}.json`));
      if (!(await rec.exists())) throw new Error(MOCK_UNKNOWN);
      return recording.parse(await rec.json());
    },
  };
}
