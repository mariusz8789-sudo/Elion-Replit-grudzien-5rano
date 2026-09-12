/**
 * Genesis OS — punkt wejścia procesu backendu (P0.1).
 *
 * JEDYNY POWÓD, DLA KTÓREGO TO NIE JEST W `server.mjs`: ESM rozwiązuje i
 * linkuje CAŁY graf modułów przed wykonaniem czegokolwiek. `server.mjs`
 * importuje statycznie `store.mjs` → `node:sqlite`, więc na Node < 22.5.0
 * proces umiera na rozwiązywaniu modułu, zanim jakikolwiek kod w `server.mjs`
 * (choćby w pierwszej linii) dostanie szansę powiedzieć operatorowi, co jest
 * nie tak. Bramka musi więc wykonać się w module, który nie ma tego importu
 * w swoim grafie — i dopiero potem wciągnąć serwer dynamicznie.
 *
 * Wszystkie wejścia procesu (npm start, npm run dev, Dockerfile CMD,
 * .replit run) celują tutaj; `nodeRuntime.test.mjs` pilnuje mechanicznie, że
 * żadne z nich nie omija bramki.
 */

import { assertSupportedNodeRuntime, nodeRuntimeMessage } from './nodeRuntime.mjs';

const runtime = assertSupportedNodeRuntime();
console.log(JSON.stringify({ t: new Date().toISOString(), level: 'info', msg: 'runtime_ok', detail: nodeRuntimeMessage(runtime) }));

await import('./server.mjs');
