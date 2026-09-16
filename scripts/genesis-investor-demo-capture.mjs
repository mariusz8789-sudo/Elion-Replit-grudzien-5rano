#!/usr/bin/env node
/**
 * GENESIS — investor / layperson demo capture (docs/DECISIONS.md D-116).
 *
 *   node scripts/genesis-investor-demo-capture.mjs
 *   (requires the production server: `npm run build && npm start`, default http://127.0.0.1:8080)
 *
 * Drives a REAL Chromium through the REAL product — the Research Console
 * running the real LOWER-HARM pipeline on the pinned ChEMBL + ClinicalTrials.gov
 * data, the real Winner Gate, the real Research Recipe, a real replay — and
 * records it. Nothing on screen is staged: every number is whatever the
 * pipeline produced during this recording. The only things this script adds
 * are a 1.2 s title card and explanatory captions (Polish) for a viewer who
 * has never seen the system; captions never state a result before the
 * screen shows it, and label simulation/model output as such.
 *
 * Output: artifacts/genesis-investor-demo/demo.webm (raw), demo.mp4 (final cut, when
 * ffmpeg is on PATH or FFMPEG points at a binary) and demo-log.txt.
 */
/* global performance, setTimeout, location, getComputedStyle, innerHeight */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(REPO, 'artifacts', 'genesis-investor-demo');
const BASE = process.env.E2E_BASE ?? 'http://127.0.0.1:8080';
const CHROME = process.env.CHROME ?? '/usr/bin/chromium';
const W = 1920, H = 1080;

const QUESTION = 'Among candidates in the GLP-1R/GIPR/GCGR mechanistic space, find the alternative that achieves clinically meaningful efficacy at the lowest achievable burden of harm relative to semaglutide.';

const log = [];
const say = (s) => { const line = `[${(performance.now() / 1000).toFixed(1)}s] ${s}`; console.log(line); log.push(line); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: OUT_DIR, size: { width: W, height: H } }, locale: 'pl-PL' });
const page = await ctx.newPage();
const errors = [];
const overlayFaults = [];
page.on('pageerror', (e) => errors.push(e.message));

// --- overlay layer: title card + captions. Inline styles on nodes attached to <html>
// (not <body>), so no app stylesheet or body-level rule can restyle or drop them.
// The overlay never touches app state.
const CAP_STYLE = 'position:fixed;left:50%;bottom:36px;transform:translateX(-50%);z-index:2147483646;max-width:1400px;padding:18px 28px;border-radius:14px;background:rgba(5,7,15,.88);border:1px solid rgba(92,214,232,.35);box-shadow:0 12px 40px rgba(0,0,0,.5);color:#e8ecf5;font-family:-apple-system,system-ui,sans-serif;font-size:28px;line-height:1.35;text-align:center;opacity:0;transition:opacity .35s ease;pointer-events:none;';
const TITLE_STYLE = 'position:fixed;inset:0;z-index:2147483647;background:#05070f;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;transition:opacity .6s ease;font-family:-apple-system,system-ui,sans-serif;';
const TITLE_HTML = '<div style="font-family:ui-monospace,SF Mono,Menlo,monospace;font-size:96px;letter-spacing:.32em;color:#f0b35c;font-weight:700;padding-left:.32em">GENESIS</div><div style="width:120px;height:2px;background:linear-gradient(90deg,#5cd6e8,#a78bfa)"></div><div style="font-size:26px;letter-spacing:.34em;color:#5cd6e8;text-transform:uppercase;padding-left:.34em">Scientific OS</div>';
const BADGE_STYLE = { real: 'border:1px solid #6be3a2;color:#6be3a2', sim: 'border:1px solid #f0b35c;color:#f0b35c', model: 'border:1px solid #a78bfa;color:#a78bfa' };
async function installOverlay() {
  await page.evaluate((capStyle) => {
    if (document.getElementById('gx-cap')) return;
    const cap = document.createElement('div');
    cap.id = 'gx-cap';
    cap.style.cssText = capStyle;
    document.documentElement.appendChild(cap);
  }, CAP_STYLE);
}
async function title(ms) {
  await page.evaluate(({ style, html }) => {
    const t = document.createElement('div');
    t.id = 'gx-title';
    t.style.cssText = style;
    t.innerHTML = html;
    document.documentElement.appendChild(t);
  }, { style: TITLE_STYLE, html: TITLE_HTML });
  const shownAt = Date.now();
  await sleep(ms);
  await page.evaluate(() => { const t = document.getElementById('gx-title'); if (t) { t.style.opacity = '0'; setTimeout(() => t.remove(), 650); } });
  await sleep(700);
  return shownAt;
}
async function caption(tag, text, badge) {
  say(`CAPTION [${tag}] ${text}`);
  await installOverlay();
  await page.evaluate(({ tag, text, badge, badgeStyle }) => {
    const c = document.getElementById('gx-cap');
    if (!c) return;
    c.style.opacity = '0';
    setTimeout(() => {
      const b = badge ? `<span style="display:inline-block;margin-left:10px;padding:2px 9px;border-radius:6px;font-size:14px;letter-spacing:.12em;font-family:ui-monospace,SF Mono,Menlo,monospace;vertical-align:middle;${badgeStyle}">${badge.txt}</span>` : '';
      c.innerHTML = `<span style="display:block;font-family:ui-monospace,SF Mono,Menlo,monospace;font-size:15px;letter-spacing:.22em;color:#5cd6e8;margin-bottom:6px">${tag}</span>${text}${b}`;
      c.style.opacity = '1';
    }, 220);
  }, { tag, text, badge: badge ?? null, badgeStyle: badge ? BADGE_STYLE[badge.cls] : '' });
  // Self-check: the caption must really be on screen as a styled, fixed box — a caption that
  // silently fell back to unstyled flow text would make the film unreadable, so it fails the run.
  // The fade-in is a CSS transition scheduled on the main thread, so after a heavy render it can
  // land late: poll (holding the shot) instead of sampling once.
  let probe = null;
  let okOverlay = false;
  for (let i = 0; i < 16 && !okOverlay; i++) {
    await sleep(250);
    // On a WebGL route rendered by software GL the frame rate can drop below 1 fps and a CSS
    // transition never advances; after 2 s show the caption without the fade instead.
    if (i === 8) await page.evaluate(() => { const c = document.getElementById('gx-cap'); if (c) { c.style.transition = 'none'; c.style.opacity = '1'; } });
    probe = await page.evaluate(() => {
      const c = document.getElementById('gx-cap');
      if (!c) return null;
      const cs = getComputedStyle(c);
      const r = c.getBoundingClientRect();
      return { position: cs.position, opacity: Number(cs.opacity), top: r.top, bottom: r.bottom, width: r.width, vh: innerHeight };
    });
    okOverlay = probe !== null && probe.position === 'fixed' && probe.opacity > 0.9 && probe.width > 200 && probe.bottom <= probe.vh && probe.top > probe.vh * 0.5;
  }
  if (!okOverlay) overlayFaults.push(`${tag}: ${JSON.stringify(probe)}`);
}
async function captionOff() { await page.evaluate(() => { const c = document.getElementById('gx-cap'); if (c) c.style.opacity = '0'; }); }
async function goHash(hash) { await page.evaluate((h) => { location.hash = h; }, hash); await sleep(900); await installOverlay(); }
async function scrollTo(selector, block = 'start') {
  await page.evaluate(({ selector, block }) => document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block }), { selector, block });
  await sleep(900);
}
async function dismissOnboarding() {
  const s = page.getByText(/^Pomiń/);
  if (await s.count()) { await s.first().click(); await sleep(400); }
}

const REAL = { cls: 'real', txt: 'REAL DATA · ChEMBL + ClinicalTrials.gov' };
const MODEL = { cls: 'model', txt: 'MODEL_ESTIMATE · RDKit, nie pomiar' };

say('GENESIS investor demo capture');
const recordingStartedAt = Date.now();

// 0. WARM-UP (trimmed out of the final cut): load the real console once so the
// film opens on a ready product, not on a loading screen. Software GL in CI
// makes the first load slow; the cut starts at the title card below.
await page.goto(`${BASE}/#/research-console`, { waitUntil: 'load' });
await sleep(1500);
await dismissOnboarding();
await page.getByText('Run full scientific process').first().waitFor({ timeout: 120000 });
await page.evaluate(() => window.scrollTo(0, 0));
await sleep(400);
say(`console ready ${((Date.now() - recordingStartedAt) / 1000).toFixed(1)}s after recording start`);

// 1. OPENING — title card (1.3 s), then straight into the product
const titleShownAt = await title(1600);
const trimOffsetSec = Math.max(0, (titleShownAt - recordingStartedAt) / 1000 + 0.6); // the compositor lags the DOM append by roughly half a second under software GL
say(`cut starts at ${trimOffsetSec.toFixed(2)}s of the raw recording`);
await installOverlay();

// 2. QUESTION — the user types a plain-language research question
await caption('1 · PYTANIE', 'Genesis to system operacyjny nauki. Zadajesz pytanie zwykłym językiem — nie musisz znać kodu ani struktury systemu.');
await sleep(2600);
await page.getByText('REAL — LOWER-HARM (production data)').first().click();
await sleep(500);
await caption('1 · PYTANIE', 'Wybieramy tryb REAL: prawdziwe, przypięte dane ChEMBL i ClinicalTrials.gov — bez syntetycznych przykładów.', REAL);
await sleep(1800);
const ta = page.locator('textarea').first();
await ta.click();
await ta.fill('');
await caption('1 · PYTANIE', '„Znajdź alternatywę dla semaglutydu o klinicznie istotnej skuteczności i najniższym osiągalnym obciążeniu szkodą.”');
await page.keyboard.type(QUESTION, { delay: 22 });
await sleep(900);

// 3. GENESIS STARTS WORKING — the real 20-stage pipeline runs in the browser
await caption('2 · GENESIS PRACUJE', 'Genesis uruchamia pełny, 20-etapowy proces naukowy: formalizacja → kandydaci → filtry → ranking → dowody → eksperyment → falsyfikacja → bramka zwycięzcy.', REAL);
await page.getByText('Run full scientific process').first().click();
await page.waitForSelector('[data-testid="winner-record"], [data-testid="no-winner-blocker"], .gu-locked-panel', { timeout: 120000 });
say('pipeline finished');
await sleep(600);
await caption('2 · GENESIS PRACUJE', 'Najpierw kustodia dowodów: dane są zamrożone i zweryfikowane hashem SHA-256, zanim padnie jakakolwiek decyzja.', REAL);
await sleep(2600);
await scrollTo('.gu-conjunct-list');
await caption('2 · GENESIS PRACUJE', 'Każdy z 20 etapów zostawia własny odcisk (fingerprint). Nic nie da się dopisać po fakcie.');
await sleep(1800);
for (const i of [6, 10, 14, 18]) {
  await page.evaluate((n) => document.querySelectorAll('.gu-conjunct-list .gu-conjunct-item')[n]?.scrollIntoView({ behavior: 'smooth', block: 'center' }), i);
  await sleep(1100);
}

// candidates
await scrollTo('[data-testid="candidate-space"]');
// Numbers in captions are read off the live DOM — never typed in by hand.
const nCandidates = await page.locator('.gu-cspace-row').count();
const nQualify = await page.locator('.gu-cspace-row.gu-cspace-qualifies').count();
say(`candidate space: ${nCandidates} candidates, ${nQualify} qualify`);
await caption('3 · KANDYDACI', `Przestrzeń kandydatów: ${nCandidates} realnych cząsteczek z tego samego mechanizmu, ${nQualify} przechodzi próg i weto. Każda odrzucona ma podany powód — próg skuteczności albo weto bezpieczeństwa.`, REAL);
await sleep(3200);
await page.evaluate(() => document.querySelectorAll('.gu-cspace-row')[5]?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
await sleep(1600);
await page.evaluate(() => document.querySelectorAll('.gu-cspace-row')[10]?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
await caption('3 · KANDYDACI', 'Nic nie jest ukryte: kandydat z lepszą skutecznością, ale z istotnym sygnałem szkody, pozostaje widoczny — i nie może wygrać.', REAL);
await sleep(3000);

// 4. SCIENTIFIC EXPLANATION — falsification + winner gate
await scrollTo('.gu-gate');
await caption('4 · FALSYFIKACJA', 'Bramka zwycięzcy: trzy warunki i wszystkie muszą zajść. Eksperyment G2 musi rozdzielić parę, wynik musi zgadzać się z rankingiem zamrożonym PRZED eksperymentem, a faworyt musi przejść bramkę bezpieczeństwa.');
await sleep(4200);
await scrollTo('.gu-gate-g2', 'center');
await caption('4 · FALSYFIKACJA', 'Reguła decyzyjna została zamrożona (fingerprint) zanim odczytano jakąkolwiek obserwację — Genesis nie może „dopasować zwycięzcy po fakcie”.');
await sleep(3400);
await scrollTo('.gu-gate-decisions', 'center');
const gateOutcomes = await page.locator('.gu-gate-decision-outcome').allTextContents();
say(`gate outcomes: ${gateOutcomes.join(' / ')}`);
await caption('4 · FALSYFIKACJA', `Bramka bezpieczeństwa i nadzoru, osobno dla każdego z TOP2: ${gateOutcomes.map((o, i) => `${i === 0 ? 'faworyt' : 'drugi kandydat'} → ${o.trim()}`).join(', ')}. Genesis nigdy nie aktywuje niczego sam — decyzja należy do człowieka.`);
await sleep(4200);

// 5. WINNER / NO_WINNER — whatever the run really produced
const hasWinner = (await page.locator('[data-testid="winner-record"]').count()) > 0;
if (hasWinner) {
  await scrollTo('[data-testid="winner-record"]');
  const name = (await page.locator('.gu-recipe-title').first().textContent())?.trim() ?? '';
  await caption('5 · WYNIK', `WINNER: ${name.split(' ')[0]} — pod zamrożoną, zorientowaną na bezpieczeństwo regułą LOWER-HARM. To NIE jest twierdzenie o wyższości nad lekiem referencyjnym.`, REAL);
  await sleep(3800);
  await scrollTo('.gu-recipe-table', 'center');
  const nObs = await page.locator('.gu-recipe-table tbody tr').count();
  say(`winner evidence rows: ${nObs}`);
  await caption('5 · WYNIK', `Dowody: ${nObs} realne badania kliniczne (NCT). Porównania są pośrednie — Genesis mówi to wprost, zamiast udawać badanie head-to-head.`, REAL);
  await sleep(3600);
  await scrollTo('.gu-recipe-dl', 'start');
  await caption('5 · RESEARCH RECIPE', 'Research Recipe: mechanizm, wymagane właściwości, identyfikatory, wyniki falsyfikacji, ograniczenia. Bez dawkowania, bez recepty, bez procedury syntezy.');
  await sleep(4000);
  await scrollTo('.gu-recipe-disclosures', 'center');
  await caption('5 · RESEARCH RECIPE', 'Czego ten rekord NIE twierdzi — zapisane w samym artefakcie i objęte jego odciskiem.');
  await sleep(3200);
} else {
  await scrollTo('[data-testid="no-winner-blocker"]');
  await caption('5 · WYNIK', 'NO_WINNER — żaden kandydat nie spełnił wszystkich zamrożonych warunków. Genesis pokazuje dokładnie, na którym etapie zatrzymał się przebieg, i nie tworzy sztucznego zwycięzcy.', REAL);
  await sleep(4500);
}

// 6. REPLAY / TRUST
await scrollTo('[data-testid="replay-section"]');
await caption('6 · REPLAY', 'Zaufanie: Genesis odtwarza cały przebieg od zera — dwa niezależne uruchomienia — i porównuje odciski.');
await page.getByText('Replay & verify').first().click();
await page.waitForSelector('[data-testid="replay-result"]', { timeout: 120000 });
await sleep(400);
const replayText = (await page.locator('.gu-replay-verdict').first().textContent()) ?? '';
say(`replay: ${replayText}`);
await caption('6 · REPLAY', replayText.startsWith('MATCH')
  ? 'MATCH: identyczny werdykt, identyczny odcisk audytu. Ten sam wynik można sprawdzić jutro, na innej maszynie, bez zaufania na słowo.'
  : 'DRIFT: uruchomienia się różnią — Genesis pokazuje to wprost zamiast ukrywać.');
await sleep(4200);

// 7. FINAL SHOTS — closing frame on the verdict itself (the console is component-local
// state, so it is filmed before leaving the route), then the existing Molecule Lab as an
// epilogue (real RDKit geometry, honestly labelled). The heavier 3D worlds (lab-3d, city3d)
// render at <0.2 fps under the software GL this capture runs on, so they are not filmed here.
await scrollTo('.gu-verdict-banner', 'center');
await caption('GENESIS · SCIENTIFIC OS', 'Pytanie → kandydaci → dowody → falsyfikacja → bramka zwycięzcy → Research Recipe → replay. Każdy wynik audytowalny, odtwarzalny, z ludzką decyzją na końcu.');
await sleep(5500);
await captionOff();
await goHash('#/molecule');
await page.waitForSelector('canvas', { timeout: 60000 });
await sleep(3500);
await caption('EPILOG · GENESIS MOLECULE LAB', 'Struktura 3D liczona z RDKit (przykładowa cząsteczka). To model obliczeniowy — nie pomiar laboratoryjny. Genesis: system operacyjny nauki.', MODEL);
await sleep(5000);
await captionOff();
await title(1800);
await sleep(300);

await ctx.close();
await browser.close();

const videoFile = readdirSync(OUT_DIR).find((f) => f.endsWith('.webm'));
let videoPath = null;
if (videoFile !== undefined) { videoPath = path.join(OUT_DIR, 'demo.webm'); renameSync(path.join(OUT_DIR, videoFile), videoPath); }
say(`pageerrors: ${errors.length}${errors.length ? ' — ' + errors.join(' | ') : ''}`);
say(`overlay faults: ${overlayFaults.length}${overlayFaults.length ? ' — ' + overlayFaults.join(' | ') : ''}`);
say(`raw video: ${videoPath ?? '(missing)'}`);

// Final cut: drop the warm-up, encode H.264 for players that do not take webm.
if (videoPath !== null) {
  const ffmpeg = process.env.FFMPEG ?? 'ffmpeg';
  const cutPath = path.join(OUT_DIR, 'demo.mp4');
  const args = ['-v', 'error', '-y', '-ss', trimOffsetSec.toFixed(2), '-i', videoPath, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', cutPath];
  try {
    execFileSync(ffmpeg, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    say(`final cut: ${cutPath}`);
  } catch (e) {
    say(`ffmpeg not available (${e.code ?? e.message}); make the cut yourself: ffmpeg ${args.join(' ')}`);
  }
}
writeFileSync(path.join(OUT_DIR, 'demo-log.txt'), log.join('\n') + '\n');
process.exit(videoPath !== null && errors.length === 0 && overlayFaults.length === 0 ? 0 : 1);
