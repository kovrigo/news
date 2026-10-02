import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { MOCK_UNKNOWN } from '../../core/failures.ts';
import type { Asr, AsrSegment } from './types.ts';

// Recordings live in <storyDir>/asr/<sha256 of file bytes>.json.
export function mockAsr(storyDir: string): Asr {
  return {
    name: 'mock',
    async transcribe(file) {
      const key = createHash('sha256').update(file.bytes).digest('hex');
      const rec = Bun.file(join(storyDir, 'asr', `${key}.json`));
      if (!(await rec.exists())) throw new Error(MOCK_UNKNOWN);
      return (await rec.json()) as AsrSegment[];
    },
  };
}
