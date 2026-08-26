import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';

const endpoint = 'http://127.0.0.1:9222';
const configuredOrigin = process.env.GENESIS_RUNTIME_ORIGIN ?? 'http://127.0.0.1:5000/#/city3d';
// Accept a bare dev/preview origin while retaining an explicitly supplied hash route.
const origin = configuredOrigin.includes('#')
  ? configuredOrigin
  : `${configuredOrigin.replace(/\/$/, '')}/#/city3d`;
const proofUrl = origin.includes('#')
  ? origin.replace('#', `?proof=${Date.now()}#`)
  : `${origin}${origin.includes('?') ? '&' : '?'}proof=${Date.now()}`;
const suffix = process.env.GENESIS_PROOF_SUFFIX ? `-${process.env.GENESIS_PROOF_SUFFIX}` : '';
const screenshotPath = `/home/ubuntu/genesis-epidemic-digital-twin/artifacts/screenshots/city3d-earthquake-demonstrator${suffix}-1920x1080.png`;
const reportPath = `/home/ubuntu/genesis-epidemic-digital-twin/artifacts/earthquake-city3d-runtime-proof${suffix}.json`;
const downloadDir = '/home/ubuntu/Downloads/genesis-earthquake-runtime-proof';
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
const evaluate = async (expression) => {
  const response = await cdp('Runtime.evaluate', { expression, returnByValue: true });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
  }
  return response.result.value;
};

try {
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await mkdir(downloadDir, { recursive: true });
  try {
    await cdp('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });
  } catch {
    await cdp('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });
  }
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: proofUrl });
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
  await evaluate(`(() => {
    const setNumeric = (label, value) => {
      const input = [...document.querySelectorAll('input')].find((node) => node.getAttribute('aria-label') === label);
      if (!(input instanceof HTMLInputElement)) throw new Error('Missing input: ' + label);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, String(value));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setNumeric('Synthetic magnitude', 5.8);
    setNumeric('Synthetic depth km', 11);
    setNumeric('Synthetic fixture X', 1);
    setNumeric('Synthetic fixture Y', -1);
    setNumeric('Synthetic seed', 43);
  })()`);
  await evaluate(`(() => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Uruchom scenariusz')?.click())()`);
  await sleep(1300);
  await evaluate(`(() => {
    const panel = document.querySelector('.earthquake-scenario-panel');
    panel?.querySelector('.earthquake-evidence-details summary')?.click();
    panel?.querySelector('.earthquake-impact-details summary')?.click();
    panel?.querySelector('.earthquake-history-details summary')?.click();
    const rail = document.querySelector('.city-world-right');
    if (rail && panel) rail.scrollTop = Math.max(0, panel.offsetTop - 14);
  })()`);
  await sleep(220);
  const active = JSON.parse(await evaluate(`JSON.stringify((() => {
    const panel = document.querySelector('.earthquake-scenario-panel');
    const verdict = panel?.querySelector('.earthquake-verdict b')?.textContent?.trim() ?? null;
    const proof = panel?.textContent ?? '';
    const outcomeRegion = panel?.querySelector('.earthquake-proof[role="status"]');
    return {
      canvasCount: document.querySelectorAll('canvas').length,
      cityCanvasCount: document.querySelectorAll('.city-3d-canvas').length,
      verdict,
      replayMatch: /replay\\s*MATCH/i.test(proof),
      evidenceComplete: /evidence\\s*COMPLETE/i.test(proof),
      scenarioSynthetic: /SCENARIO/.test(proof) && /SYNTHETIC/.test(proof),
      mappingVisible: /Mapping/.test(proof),
      evidenceHashVisible: /Evidence SHA-256/.test(proof),
      modelDerivedImpactsVisible: /Model-derived impacts/.test(proof)
        && /Read-only synthetic ground-shaking values/.test(proof)
        && /Intensity [(]g[)]/.test(proof)
        && /building damage/.test(proof),
      registryModuleVisible: /Registry module/.test(proof) && /earthquake/.test(proof) && /schema 1[.]0[.]0/.test(proof),
      capabilitiesVisible: /Declared capabilities/.test(proof) && /ground-motion-attenuation-synthetic/.test(proof),
      notModeledVisible: /NOT_MODELED/.test(proof),
      parametersVisible: ['Synthetic magnitude', 'Synthetic depth km', 'Synthetic fixture X', 'Synthetic fixture Y', 'Synthetic seed'].every((label) => Boolean([...document.querySelectorAll('input')].find((node) => node.getAttribute('aria-label') === label))),
      persistedHistoryVisible: /Local persisted runs/.test(proof),
      persistedHistoryEntries: panel?.querySelectorAll('.earthquake-history-list li').length ?? 0,
      persistedHistoryMatch: [...(panel?.querySelectorAll('.earthquake-history-verdict') ?? [])].some((element) => element.textContent?.trim() === 'MATCH'),
      clearedButtonEnabled: ![...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Wyczyść overlay')?.disabled,
      outcomeAnnounced: outcomeRegion?.getAttribute('aria-live') === 'polite'
        && outcomeRegion?.getAttribute('aria-atomic') === 'true'
        && /OVERLAY ACTIVE/.test(outcomeRegion.textContent ?? ''),
      stageFailed: Boolean(document.querySelector('.empty-state')),
      loading: Boolean(document.querySelector('.route-loading'))
    };
  })())`));
  const downloadsBefore = new Set(await readdir(downloadDir));
  await evaluate(`(() => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Eksportuj evidence')?.click())()`);
  await sleep(350);
  const downloadedFiles = (await readdir(downloadDir)).filter((file) => !downloadsBefore.has(file) && file.endsWith('.json'));
  const downloaded = downloadedFiles.length === 1
    ? JSON.parse(await readFile(`${downloadDir}/${downloadedFiles[0]}`, 'utf8'))
    : null;
  const exportDownload = {
    fileCount: downloadedFiles.length,
    filename: downloadedFiles[0] ?? null,
    schemaVersion: downloaded?.exportSchemaVersion ?? null,
    commandCenterStatus: downloaded?.commandCenterStatus ?? null,
    replayStatus: downloaded?.replay?.status ?? null,
    evidenceComplete: Array.isArray(downloaded?.evidence?.missingFields) && downloaded.evidence.missingFields.length === 0,
    magnitude: downloaded?.hazardInput?.scientificFields?.magnitude ?? null,
    depthKm: downloaded?.hazardInput?.scientificFields?.depthKm ?? null,
    seed: downloaded?.hazardInput?.seed ?? null,
    mappingFingerprint: downloaded?.mapping?.mappingFingerprint ?? null,
    labels: downloaded?.labels ?? [],
  };
  const image = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(screenshotPath, Buffer.from(image.data, 'base64'));
  await evaluate(`(() => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Wyczyść overlay')?.click())()`);
  await sleep(220);
  const cleared = JSON.parse(await evaluate(`JSON.stringify((() => ({
    verdict: document.querySelector('.earthquake-scenario-panel .earthquake-verdict b')?.textContent?.trim() ?? null,
    cityCanvasCount: document.querySelectorAll('.city-3d-canvas').length,
    stageFailed: Boolean(document.querySelector('.empty-state'))
  }))())`));
  await evaluate(`(() => document.querySelector('.evidence-panel .evidence-panel-toggle')?.click())()`);
  await sleep(180);
  await evaluate(`(() => [...document.querySelectorAll('.evidence-panel button')].find((b) => b.textContent?.trim() === '▶ Uruchom eksperyment')?.click())()`);
  await sleep(1500);
  await evaluate(`(() => [...document.querySelectorAll('.evidence-panel button')].find((b) => b.textContent?.trim() === '↻ Replay')?.click())()`);
  await sleep(260);
  await evaluate(`(() => [...document.querySelectorAll('.evidence-panel button')].find((b) => b.textContent?.trim() === '⚠ Symuluj rozjazd')?.click())()`);
  await sleep(120);
  const evidenceReplay = JSON.parse(await evaluate(`JSON.stringify((() => {
    const panel = document.querySelector('.evidence-panel');
    const statuses = [...(panel?.querySelectorAll('[role="status"]') ?? [])];
    return {
      expanded: panel?.querySelector('.evidence-panel-toggle')?.getAttribute('aria-expanded') === 'true',
      replayAnnounced: statuses.some((element) => element.getAttribute('aria-live') === 'polite'
        && element.getAttribute('aria-atomic') === 'true'
        && /replay\\s*MATCH/i.test(element.textContent ?? '')),
      driftAnnounced: statuses.some((element) => element.getAttribute('aria-live') === 'polite'
        && element.getAttribute('aria-atomic') === 'true'
        && /Symulacja rozjazdu/.test(element.textContent ?? '')
        && /DRIFT/.test(element.textContent ?? '')),
      historyEntries: panel?.querySelectorAll('.evidence-history li').length ?? 0,
      errorAbsent: !panel?.querySelector('.evidence-error[role="alert"]'),
      cityCanvasCount: document.querySelectorAll('.city-3d-canvas').length,
      stageFailed: Boolean(document.querySelector('.empty-state')),
    };
  })())`));
  await evaluate(`(() => {
    const input = [...document.querySelectorAll('input')].find((node) => node.getAttribute('aria-label') === 'Synthetic depth km');
    if (!(input instanceof HTMLInputElement)) throw new Error('Missing synthetic depth control');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, '-1');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Uruchom scenariusz')?.click();
  })()`);
  await sleep(420);
  const blockedParameter = JSON.parse(await evaluate(`JSON.stringify((() => {
    const panel = document.querySelector('.earthquake-scenario-panel');
    const outcomeRegion = panel?.querySelector('.earthquake-proof[role="status"]');
    return {
      verdict: panel?.querySelector('.earthquake-verdict b')?.textContent?.trim() ?? null,
      invalidBlockVisible: /INVALID_SCENARIO_SPEC/.test(panel?.textContent ?? ''),
      overlayNotRendered: /NOT_RENDERED/.test(panel?.textContent ?? ''),
      outcomeAnnounced: outcomeRegion?.getAttribute('aria-live') === 'polite'
        && outcomeRegion?.getAttribute('aria-atomic') === 'true'
        && /ENVELOPE BLOCKED/.test(outcomeRegion.textContent ?? ''),
      cityCanvasCount: document.querySelectorAll('.city-3d-canvas').length,
      stageFailed: Boolean(document.querySelector('.empty-state')),
    };
  })())`));
  // A fresh document lets this proof fail only Evidence Store's durable write.
  // The panel must surface an alert rather than falsely report a saved run.
  await cdp('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === 'genesis-os:evidence-store/v1') {
          throw new DOMException('Simulated Evidence registry read failure', 'SecurityError');
        }
        return originalSetItem.call(this, key, value);
      };
    })();`,
  });
  await cdp('Page.navigate', { url: proofUrl.replace('#', '&evidencePersistenceFailure=1#') });
  await sleep(900);
  await evaluate(`(() => [...document.querySelectorAll('button')].find((b) => /^Pomiń/.test(b.textContent?.trim() ?? ''))?.click())()`);
  await sleep(1900);
  consoleEntries.length = 0;
  await evaluate(`(() => document.querySelector('.evidence-panel .evidence-panel-toggle')?.click())()`);
  await evaluate(`(() => [...document.querySelectorAll('.evidence-panel button')].find((b) => b.textContent?.trim() === '▶ Uruchom eksperyment')?.click())()`);
  await sleep(1500);
  const evidencePersistenceFailure = JSON.parse(await evaluate(`JSON.stringify((() => {
    const panel = document.querySelector('.evidence-panel');
    const alert = panel?.querySelector('.evidence-error[role="alert"]');
    return {
      expanded: panel?.querySelector('.evidence-panel-toggle')?.getAttribute('aria-expanded') === 'true',
      alertText: alert?.textContent?.trim() ?? null,
      alertVisible: (alert?.textContent ?? '').includes('EKSPERYMENT: Local persistence write failed for "evidence-store/v1"'),
      cityCanvasCount: document.querySelectorAll('.city-3d-canvas').length,
      stageFailed: Boolean(document.querySelector('.empty-state')),
    };
  })())`));
  const report = { before, active, exportDownload, cleared, evidenceReplay, blockedParameter, evidencePersistenceFailure, consoleEntries };
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
    active.modelDerivedImpactsVisible,
    active.registryModuleVisible,
    active.capabilitiesVisible,
    active.notModeledVisible,
    active.parametersVisible,
    active.persistedHistoryVisible,
    active.persistedHistoryEntries >= 1,
    active.persistedHistoryMatch,
    active.clearedButtonEnabled,
    active.outcomeAnnounced,
    !active.stageFailed,
    !active.loading,
    exportDownload.fileCount === 1,
    exportDownload.schemaVersion === '1.0.0',
    exportDownload.commandCenterStatus === 'READY',
    exportDownload.replayStatus === 'MATCH',
    exportDownload.evidenceComplete,
    exportDownload.magnitude === 5.8,
    exportDownload.depthKm === 11,
    exportDownload.seed === 43,
    Boolean(exportDownload.mappingFingerprint),
    ['SCENARIO', 'SYNTHETIC', 'NON_OPERATIONAL'].every((label) => exportDownload.labels.includes(label)),
    cleared.verdict === 'OVERLAY CLEARED',
    cleared.cityCanvasCount === 1,
    !cleared.stageFailed,
    evidenceReplay.expanded,
    evidenceReplay.replayAnnounced,
    evidenceReplay.driftAnnounced,
    evidenceReplay.historyEntries >= 1,
    evidenceReplay.errorAbsent,
    evidenceReplay.cityCanvasCount === 1,
    !evidenceReplay.stageFailed,
    blockedParameter.verdict === 'ENVELOPE BLOCKED',
    blockedParameter.invalidBlockVisible,
    blockedParameter.overlayNotRendered,
    blockedParameter.outcomeAnnounced,
    blockedParameter.cityCanvasCount === 1,
    !blockedParameter.stageFailed,
    evidencePersistenceFailure.expanded,
    evidencePersistenceFailure.alertVisible,
    evidencePersistenceFailure.cityCanvasCount === 1,
    !evidencePersistenceFailure.stageFailed,
    consoleEntries.length === 0,
  ];
  if (!assertions.every(Boolean)) throw new Error(`Earthquake City3D runtime proof failed: ${JSON.stringify(report)}`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  socket.close();
}
