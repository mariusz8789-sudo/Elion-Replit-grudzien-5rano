import { writeFile } from 'node:fs/promises';

const endpoint = 'http://127.0.0.1:9222';
const origin = process.env.GENESIS_RUNTIME_ORIGIN ?? 'http://127.0.0.1:5000/#/city3d';
const suffix = process.env.GENESIS_PROOF_SUFFIX ? `-${process.env.GENESIS_PROOF_SUFFIX}` : '';
const screenshotPath = `/home/ubuntu/genesis-epidemic-digital-twin/artifacts/screenshots/city3d-earthquake-demonstrator${suffix}-1920x1080.png`;
const reportPath = `/home/ubuntu/genesis-epidemic-digital-twin/artifacts/earthquake-city3d-runtime-proof${suffix}.json`;
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const targets = await (await fetch(`${endpoint}/json/list`)).json();
const target = targets.find((candidate) => candidate.type === 'page') ?? targets[0];
if (!target?.webSocketDebuggerUrl) throw new Error('No Chromium page target is available on CDP port 9222.');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let nextId = 1;
const pending = new Map();
const consoleEntries = [];
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(String(data));
  if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(message.params.type)) {
    consoleEntries.push(message.params.args.map((item) => item.value ?? item.description ?? '').join(' '));
  }
  const resolver = pending.get(message.id);
  if (resolver) { pending.delete(message.id); resolver(message); }
});
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, (message) => message.error ? reject(new Error(message.error.message)) : resolve(message.result));
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => (await cdp('Runtime.evaluate', { expression, returnByValue: true })).result.value;

try {
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: origin });
  await sleep(900);
  await evaluate(`(() => [...document.querySelectorAll('button')].find((b) => /^Pomiń/.test(b.textContent?.trim() ?? ''))?.click())()`);
  await sleep(1900);
  // The target may have prior DevTools history from a Fast Refresh session;
  // only diagnostics emitted by this clean navigation belong to this proof.
  consoleEntries.length = 0;
  const before = JSON.parse(await evaluate(`JSON.stringify((() => ({
    canvasCount: document.querySelectorAll('canvas').length,
    cityCanvasCount: document.querySelectorAll('.city-3d-canvas').length,
    panelPresent: Boolean(document.querySelector('.earthquake-scenario-panel')),
    runEnabled: ![...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Uruchom scenariusz')?.disabled
  }))())`));
  await evaluate(`(() => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Uruchom scenariusz')?.click())()`);
  await sleep(1300);
  await evaluate(`(() => {
    const panel = document.querySelector('.earthquake-scenario-panel');
    panel?.querySelector('.earthquake-evidence-details summary')?.click();
    const rail = document.querySelector('.city-world-right');
    if (rail && panel) rail.scrollTop = Math.max(0, panel.offsetTop - 14);
  })()`);
  await sleep(220);
  const active = JSON.parse(await evaluate(`JSON.stringify((() => {
    const panel = document.querySelector('.earthquake-scenario-panel');
    const verdict = panel?.querySelector('.earthquake-verdict b')?.textContent?.trim() ?? null;
    const proof = panel?.textContent ?? '';
    return {
      canvasCount: document.querySelectorAll('canvas').length,
      cityCanvasCount: document.querySelectorAll('.city-3d-canvas').length,
      verdict,
      replayMatch: /replay\\s*MATCH/i.test(proof),
      evidenceComplete: /evidence\\s*COMPLETE/i.test(proof),
      scenarioSynthetic: /SCENARIO/.test(proof) && /SYNTHETIC/.test(proof),
      mappingVisible: /Mapping/.test(proof),
      evidenceHashVisible: /Evidence SHA-256/.test(proof),
      registryModuleVisible: /Registry module/.test(proof) && /earthquake/.test(proof) && /schema 1\.0\.0/.test(proof),
      capabilitiesVisible: /Declared capabilities/.test(proof) && /ground-motion-attenuation-synthetic/.test(proof),
      notModeledVisible: /NOT_MODELED/.test(proof),
      clearedButtonEnabled: ![...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Wyczyść overlay')?.disabled,
      stageFailed: Boolean(document.querySelector('.empty-state')),
      loading: Boolean(document.querySelector('.route-loading'))
    };
  })())`));
  const image = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(screenshotPath, Buffer.from(image.data, 'base64'));
  await evaluate(`(() => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Wyczyść overlay')?.click())()`);
  await sleep(220);
  const cleared = JSON.parse(await evaluate(`JSON.stringify((() => ({
    verdict: document.querySelector('.earthquake-scenario-panel .earthquake-verdict b')?.textContent?.trim() ?? null,
    cityCanvasCount: document.querySelectorAll('.city-3d-canvas').length,
    stageFailed: Boolean(document.querySelector('.empty-state'))
  }))())`));
  const report = { before, active, cleared, consoleEntries };
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  const assertions = [
    before.cityCanvasCount === 1,
    before.panelPresent,
    before.runEnabled,
    active.cityCanvasCount === 1,
    active.verdict === 'OVERLAY ACTIVE',
    active.replayMatch,
    active.evidenceComplete,
    active.scenarioSynthetic,
    active.mappingVisible,
    active.evidenceHashVisible,
    active.registryModuleVisible,
    active.capabilitiesVisible,
    active.notModeledVisible,
    active.clearedButtonEnabled,
    !active.stageFailed,
    !active.loading,
    cleared.verdict === 'OVERLAY CLEARED',
    cleared.cityCanvasCount === 1,
    !cleared.stageFailed,
  ];
  if (!assertions.every(Boolean)) throw new Error(`Earthquake City3D runtime proof failed: ${JSON.stringify(report)}`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  socket.close();
}
