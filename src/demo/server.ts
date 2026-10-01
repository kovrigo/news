import { createApp } from './api.ts';
import index from './ui/index.html';
import { refuseStart } from './boundary.ts';
import { BODY_MAX } from './schemas.ts';
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

// The board opens the demo at this machine's tailnet name through an https proxy to 127.0.0.1.
// paneweb's start script passes that one name in DEMO_HOST; nothing else besides 127.0.0.1 and localhost is answered.
const tailnet = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(process.env.DEMO_HOST ?? '') ? process.env.DEMO_HOST! : null;
console.log(tailnet ? `Имя в tailnet: ${tailnet}` : 'DEMO_HOST не задан: демо отвечает только на 127.0.0.1 и localhost');
const app = createApp({ statePath: statePath(), hosts: tailnet ? [tailnet] : [] });
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: Number(process.env.PORT),
  maxRequestBodySize: BODY_MAX,
  // the minified page with React's production build: the development build drew a 500-row journal four times slower
  development: false,
  routes: { '/': index },
  fetch: (req) => (new URL(req.url).pathname.startsWith('/api/') ? app.fetch(req) : new Response('Нет такого адреса', { status: 404 })),
});
console.log(`Демо: http://127.0.0.1:${server.port}/`);
