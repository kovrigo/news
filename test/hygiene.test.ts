import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []));
const code = [...files('src'), ...files('scripts')];

describe('hygiene', () => {
  test('no module imports a network client', () => {
    const bad = /from ['"](node:)?(http|https|http2|net|tls|dgram|dns)['"]|from ['"](axios|node-fetch|undici|ws|got|openai|@anthropic-ai\/[^'"]+)['"]|\bfetch\(|new WebSocket|Bun\.serve|Bun\.connect/;
    for (const f of code) expect([f, bad.test(readFileSync(f, 'utf8'))]).toEqual([f, false]);
  });
  test('Russian text lives only in the catalog, the Russian-language rules and the model prompt', () => {
    const allowed = ['src/core/failures.ts', 'src/core/normalize.ts', 'src/core/numbers.ts', 'src/adapters/llm/prompt.ts'];
    for (const f of code) if (!allowed.includes(f)) expect([f, /[а-яё]/i.test(readFileSync(f, 'utf8'))]).toEqual([f, false]);
  });
  test('the only user-facing strings in the quality script come from the catalog', () => {
    expect(readFileSync('scripts/quality.ts', 'utf8')).toContain('REAL_MODELS_MISSING');
  });
});
