import { createApp } from './api.ts';
import index from './ui/index.html';
import { refuseStart } from './boundary.ts';
import { NO_STATE, stateExists, statePath } from './state.ts';

// The boundary is checked before anything starts: only the mock adapters exist, and nothing else is an option.
const refused = refuseStart(process.env);
if (refused) {
  console.error(refused);
  process.exit(2);
}
if (!stateExists(statePath())) {
  console.error(NO_STATE);
  process.exit(2);
}

const app = createApp({ statePath: statePath() });
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: Number(process.env.PORT),
  routes: { '/': index },
  fetch: (req) => (new URL(req.url).pathname.startsWith('/api/') ? app.fetch(req) : new Response('Нет такого адреса', { status: 404 })),
});
console.log(`Демо: http://127.0.0.1:${server.port}/`);
