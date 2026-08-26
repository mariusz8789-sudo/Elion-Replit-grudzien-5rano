import { writeFile } from 'node:fs/promises';

const endpoint = 'http://127.0.0.1:9222';
const benchmarkSuffix = process.env.GENESIS_BENCHMARK_SUFFIX ?? '';
const output = benchmarkSuffix
  ? `/home/ubuntu/genesis-epidemic-digital-twin/artifacts/city3d-benchmark-${benchmarkSuffix}.json`
  : '/home/ubuntu/genesis-epidemic-digital-twin/artifacts/city3d-benchmark.json';
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const targets = await (await fetch(`${endpoint}/json/list`)).json();
const target = targets.find((candidate) => String(candidate.url).includes('#/city3d'))
  ?? targets.find((candidate) => String(candidate.url).includes('localhost:5000'))
  ?? targets.find((candidate) => candidate.type === 'page');
if (!target?.webSocketDebuggerUrl) throw new Error('No inspectable Chromium page target is available for the City3D benchmark.');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let nextId = 1;
const pending = new Map();
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(String(data));
  const callback = pending.get(message.id);
  if (callback) { pending.delete(message.id); callback(message); }
});
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, (message) => message.error ? reject(new Error(message.error.message)) : resolve(message.result));
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => (await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;

await cdp('Page.enable');
await cdp('Runtime.enable');
const activeHref = await evaluate('location.href');
if (!String(target.url).includes('#/city3d') || String(activeHref).startsWith('chrome-error://')) {
  await cdp('Page.navigate', { url: 'http://localhost:5000/#/city3d' });
  await sleep(8500);
} else {
  await sleep(1500);
}

const readMetrics = () => evaluate(`(() => {
  const text = [...document.querySelectorAll('.observability-panel, .city-world-shell')].map((node) => node.innerText).join(' ');
  const read = (label) => { const m = text.match(new RegExp(label + '\\\\s*([0-9.]+)', 'i')); return m ? Number(m[1]) : null; };
  return { text, fps: read('FPS'), frameMs: read('frame'), renderMs: read('render'), drawCalls: read('draw calls'), triangles: read('triangles'), canvasCount: document.querySelectorAll('.city-3d-canvas').length };
})()`);
const setPopulation = (population) => evaluate(`(() => {
  const input = document.querySelector('input[aria-label="Liczba agentów"]');
  if (!input) throw new Error('nAgents control unavailable');
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  set.call(input, String(${population}));
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
})()`);

const rows = [];
for (const population of [260, 500, 1000]) {
  await setPopulation(population);
  await sleep(1500);
  const samples = [];
  for (let i = 0; i < 3; i++) { await sleep(400); samples.push(await readMetrics()); }
  const average = (key) => {
    const values = samples.map((sample) => sample[key]).filter((value) => Number.isFinite(value));
    return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100 : null;
  };
  rows.push({ population, samples, mean: { frameMs: average('frameMs'), renderMs: average('renderMs'), drawCalls: average('drawCalls'), triangles: average('triangles'), fps: average('fps') } });
}
await setPopulation(260);
await sleep(1200);
await writeFile(output, `${JSON.stringify({ generatedAt: new Date().toISOString(), methodology: 'Real nAgents control; three post-settle readings from existing WebGLRenderer.info observability values.', rows }, null, 2)}\n`);
socket.close();
