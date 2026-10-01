import { NO_PORT, REAL_MODELS_REFUSED } from './texts.ts';

// Start-up rules of the demo. Returns the message to print when it must not start; the exit code is 2.
export function refuseStart(env: Record<string, string | undefined>): string | null {
  if (env.MODELS !== undefined && env.MODELS !== 'mock') return REAL_MODELS_REFUSED(env.MODELS);
  if (!env.PORT) return NO_PORT;
  return null;
}
