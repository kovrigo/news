import { saveState, statePath } from './state.ts';
import { buildSeed } from './seed.ts';

const path = statePath();
saveState(path, await buildSeed(Date.now()));
console.log(`Демо сброшено: ${path}`);
