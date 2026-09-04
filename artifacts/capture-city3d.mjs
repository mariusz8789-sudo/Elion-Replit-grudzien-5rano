import { writeFile } from 'node:fs/promises';

const endpoint = 'http://127.0.0.1:9222';
const captureView = process.env.GENESIS_CAPTURE_VIEW ?? 'city';
const captureSuffix = process.env.GENESIS_CAPTURE_SUFFIX ?? 'final';
const runModelBeforeCapture = process.env.GENESIS_CAPTURE_REAL_RUN === '1';
const realRunMilliseconds = Number(process.env.GENESIS_CAPTURE_REAL_RUN_MS ?? 3500);
const screenshotPath = `/home/ubuntu/genesis-epidemic-digital-twin/artifacts/screenshots/city3d-${captureView}-${captureSuffix}.png`;
const reportPath = `/home/ubuntu/genesis-epidemic-digital-twin/artifacts/city3d-live-metrics-${captureSuffix}.json`;
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const targets = await (await fetch(`${endpoint}/json/list`)).json();
const target = targets.find((candidate) => candidate.url.includes('#/city3d')) ?? targets[0];
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let nextId = 1;
const pending = new Map();
const consoleEntries = [];
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(String(data));
  if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(message.params.type)) {
    consoleEntries.push(message.params.args.map((argument) => argument.value ?? argument.description ?? '').join(' '));
  }
  const callback = pending.get(message.id);
  if (callback) { pending.delete(message.id); callback(message); }
});
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, (message) => message.error ? reject(new Error(message.error.message)) : resolve(message.result));
  socket.send(JSON.stringify({ id, method, params }));
});

await cdp('Page.enable');
await cdp('Runtime.enable');
const activeHref = (await cdp('Runtime.evaluate', { expression: 'location.href', returnByValue: true })).result.value;
if (!target.url.includes('#/city3d') || String(activeHref).startsWith('chrome-error://')) {
  await cdp('Page.navigate', { url: 'http://localhost:5000/#/city3d' });
  await sleep(2200);
}
await cdp('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
if (runModelBeforeCapture) {
  await cdp('Runtime.evaluate', { expression: `(() => {
    const buttons = [...document.querySelectorAll('button')];
    buttons.find((button) => button.textContent?.trim() === '10x')?.click();
    buttons.find((button) => /Start/i.test(button.textContent ?? ''))?.click();
  })()` });
  await sleep(Number.isFinite(realRunMilliseconds) && realRunMilliseconds > 0 ? realRunMilliseconds : 3500);
}
await cdp('Runtime.evaluate', { expression: `(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === '${captureView.toUpperCase()}')?.click())()` });
await sleep(1500);
const state = await cdp('Runtime.evaluate', { expression: `JSON.stringify((() => {
  const cityCanvas = document.querySelector('.city-3d-canvas');
  const evidenceToggle = document.querySelector('.evidence-panel-toggle');
  const layout = document.querySelector('.city-world-layout');
  const evidenceRect = document.querySelector('.evidence-panel')?.getBoundingClientRect();
  const layoutRect = layout?.getBoundingClientRect();
  return {
  title: document.title,
  canvasCount: document.querySelectorAll('canvas').length,
  cityCanvasCount: document.querySelectorAll('.city-3d-canvas').length,
  cityCanvas: Boolean(cityCanvas),
  rail: document.querySelector('.city-world-analytics-rail')?.innerText ?? null,
  scenario: Boolean(document.querySelector('.scenario-command-panel')),
  hospital: Boolean(document.querySelector('.hospital-panel')),
  evidence: Boolean(document.querySelector('.evidence-panel')),
  evidenceExpanded: evidenceToggle?.getAttribute('aria-expanded') ?? null,
  evidenceViewportContained: Boolean(evidenceRect && layoutRect && evidenceRect.right <= layoutRect.right && evidenceRect.left >= layoutRect.left),
  loading: document.querySelector('.route-loading')?.innerText ?? null,
  failed: document.querySelector('.empty-state')?.innerText ?? null,
  metrics: [...document.querySelectorAll('.observability-panel, .city-world-shell')].map((node) => node.innerText).join(' ').match(/draw calls\\s*(\\d+).*?triangles\\s*(\\d+).*?render\\s*([\\d.]+)\\s*ms/is)?.slice(1) ?? null
  };
})())`, returnByValue: true });
const image = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
await writeFile(screenshotPath, Buffer.from(image.data, 'base64'));
await writeFile(reportPath, JSON.stringify({ ...JSON.parse(state.result.value), consoleEntries }, null, 2));
socket.close();
