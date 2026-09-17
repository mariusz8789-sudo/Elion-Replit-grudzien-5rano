#!/usr/bin/env node
/* global performance, setTimeout, location, getComputedStyle, innerHeight */
/**
 * GENESIS — film with the VOICE GUIDE (docs/DECISIONS.md D-119) plus a short
 * walk through several product functions.
 *
 *   npm run guide-film:capture
 *   (requires the production server: `npm run build && npm start`, default http://127.0.0.1:8080)
 *
 * Part 1 is the autonomous Genesis Tour exactly as a person gets it at `#/tour`:
 * the guide's own captions, the REAL LOWER-HARM pipeline on the pinned data, the
 * real Winner Gate, the real replay, ending in the Discovery Hall. Nothing is
 * staged and this script never touches app state — it only adds a title card,
 * a small chapter tag at the top (the guide owns the bottom of the screen) and,
 * in part 2, explanatory captions while it opens Worlds, Molecule Lab, the
 * live epidemic city from Science Chat and Evidence & memory.
 *
 * The recording is video only: headless Chromium has no audio device, so the
 * browser voice is not on the track. Captions carry every sentence the voice says.
 *
 * Output: artifacts/genesis-guide-film/film.webm (raw), film.mp4 (final cut when
 * ffmpeg is on PATH or FFMPEG points at a binary) and film-log.txt.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(REPO, 'artifacts', 'genesis-guide-film');
const BASE = process.env.E2E_BASE ?? 'http://127.0.0.1:8080';
const CHROME = process.env.CHROME ?? '/usr/bin/chromium';
const W = 1920, H = 1080;
const TOUR_TIMEOUT_MS = 6 * 60 * 1000;

const log = [];
const say = (s) => { const line = `[${(performance.now() / 1000).toFixed(1)}s] ${s}`; console.log(line); log.push(line); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: OUT_DIR, size: { width: W, height: H } }, locale: 'pl-PL' });
await ctx.addInitScript(() => {
  window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true }));
  window.localStorage.setItem('genesis.voiceGuide.v1', JSON.stringify({ enabled: true, volume: 0.9, rate: 0.95, lang: 'pl', captions: true }));
});
const page = await ctx.newPage();
const errors = [];
const overlayFaults = [];
page.on('pageerror', (e) => errors.push(e.message));

// --- overlay: title card, a top chapter tag (part 1) and bottom captions (part 2). Inline styles on
// nodes attached to <html>, never to app state.
const CAP_STYLE = 'position:fixed;left:50%;bottom:36px;transform:translateX(-50%);z-index:2147483646;max-width:1400px;padding:18px 28px;border-radius:14px;background:rgba(5,7,15,.88);border:1px solid rgba(92,214,232,.35);box-shadow:0 12px 40px rgba(0,0,0,.5);color:#e8ecf5;font-family:-apple-system,system-ui,sans-serif;font-size:28px;line-height:1.35;text-align:center;opacity:0;transition:opacity .35s ease;pointer-events:none;';
const TAG_STYLE = 'position:fixed;left:50%;top:76px;transform:translateX(-50%);z-index:2147483646;padding:8px 18px;border-radius:999px;background:rgba(5,7,15,.82);border:1px solid rgba(92,214,232,.35);color:#5cd6e8;font-family:ui-monospace,SF Mono,Menlo,monospace;font-size:16px;letter-spacing:.22em;opacity:0;transition:opacity .35s ease;pointer-events:none;';
const TITLE_STYLE = 'position:fixed;inset:0;z-index:2147483647;background:#05070f;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;transition:opacity .6s ease;font-family:-apple-system,system-ui,sans-serif;';
const TITLE_HTML = (sub) => `<div style="font-family:ui-monospace,SF Mono,Menlo,monospace;font-size:88px;letter-spacing:.28em;color:#5cd6e8;font-weight:700;padding-left:.28em">GENESIS PHYSICS</div><div style="width:120px;height:2px;background:linear-gradient(90deg,#5cd6e8,#a78bfa)"></div><div style="font-size:26px;letter-spacing:.34em;color:#e8ecf5;text-transform:uppercase;padding-left:.34em">${sub}</div>`;
const BADGE_STYLE = { real: 'border:1px solid #6be3a2;color:#6be3a2', sim: 'border:1px solid #f0b35c;color:#f0b35c', model: 'border:1px solid #a78bfa;color:#a78bfa' };
const REAL = { cls: 'real', txt: 'REAL DATA · ChEMBL + ClinicalTrials.gov' };
const SIM = { cls: 'sim', txt: 'SYMULACJA · model, nie pomiar' };
const MODEL = { cls: 'model', txt: 'MODEL_ESTIMATE · RDKit, nie pomiar' };

async function installOverlay() {
  await page.evaluate(({ capStyle, tagStyle }) => {
    if (!document.getElementById('gx-cap')) { const c = document.createElement('div'); c.id = 'gx-cap'; c.style.cssText = capStyle; document.documentElement.appendChild(c); }
    if (!document.getElementById('gx-tag')) { const t = document.createElement('div'); t.id = 'gx-tag'; t.style.cssText = tagStyle; document.documentElement.appendChild(t); }
  }, { capStyle: CAP_STYLE, tagStyle: TAG_STYLE });
}
async function title(sub, ms) {
  await page.evaluate(({ style, html }) => {
    const t = document.createElement('div'); t.id = 'gx-title'; t.style.cssText = style; t.innerHTML = html; document.documentElement.appendChild(t);
  }, { style: TITLE_STYLE, html: TITLE_HTML(sub) });
  const shownAt = Date.now();
  await sleep(ms);
  await page.evaluate(() => { const t = document.getElementById('gx-title'); if (t) { t.style.opacity = '0'; setTimeout(() => t.remove(), 650); } });
  await sleep(700);
  return shownAt;
}
async function tag(text) {
  say(`TAG ${text}`);
  await installOverlay();
  await page.evaluate((text) => { const t = document.getElementById('gx-tag'); if (t) { t.textContent = text; t.style.opacity = text ? '1' : '0'; } }, text);
}
async function caption(chapter, text, badge) {
  say(`CAPTION [${chapter}] ${text}`);
  await installOverlay();
  await page.evaluate(({ chapter, text, badge, badgeStyle }) => {
    const c = document.getElementById('gx-cap');
    if (!c) return;
    c.style.opacity = '0';
    setTimeout(() => {
      const b = badge ? `<span style="display:inline-block;margin-left:10px;padding:2px 9px;border-radius:6px;font-size:14px;letter-spacing:.12em;font-family:ui-monospace,SF Mono,Menlo,monospace;vertical-align:middle;${badgeStyle}">${badge.txt}</span>` : '';
      c.innerHTML = `<span style="display:block;font-family:ui-monospace,SF Mono,Menlo,monospace;font-size:15px;letter-spacing:.22em;color:#5cd6e8;margin-bottom:6px">${chapter}</span>${text}${b}`;
      c.style.opacity = '1';
    }, 220);
  }, { chapter, text, badge: badge ?? null, badgeStyle: badge ? BADGE_STYLE[badge.cls] : '' });
  let probe = null;
  let okOverlay = false;
  for (let i = 0; i < 16 && !okOverlay; i++) {
    await sleep(250);
    if (i === 8) await page.evaluate(() => { const c = document.getElementById('gx-cap'); if (c) { c.style.transition = 'none'; c.style.opacity = '1'; } });
    probe = await page.evaluate(() => {
      const c = document.getElementById('gx-cap');
      if (!c) return null;
      const cs = getComputedStyle(c); const r = c.getBoundingClientRect();
      return { position: cs.position, opacity: Number(cs.opacity), top: r.top, bottom: r.bottom, width: r.width, vh: innerHeight };
    });
    okOverlay = probe !== null && probe.position === 'fixed' && probe.opacity > 0.9 && probe.width > 200 && probe.bottom <= probe.vh && probe.top > probe.vh * 0.5;
  }
  if (!okOverlay) overlayFaults.push(`${chapter}: ${JSON.stringify(probe)}`);
}
async function captionOff() { await page.evaluate(() => { const c = document.getElementById('gx-cap'); if (c) c.style.opacity = '0'; }); }
async function goHash(hash) { await page.evaluate((h) => { location.hash = h; }, hash); await sleep(1200); await installOverlay(); }

say('GENESIS guide film capture');
const recordingStartedAt = Date.now();

// 0. WARM-UP (trimmed): load Start once so the film opens on a ready product.
await page.goto(`${BASE}/#/`, { waitUntil: 'load' });
await sleep(1500);
await page.getByTestId('start-tour').first().waitFor({ timeout: 120000 }).catch(() => {});
say(`start ready ${((Date.now() - recordingStartedAt) / 1000).toFixed(1)}s after recording start`);

// 1. OPENING
const titleShownAt = await title('Przewodnik głosowy · Genesis Tour', 2000);
const trimOffsetSec = Math.max(0, (titleShownAt - recordingStartedAt) / 1000 + 0.6);
say(`cut starts at ${trimOffsetSec.toFixed(2)}s of the raw recording`);
await installOverlay();

// 2. PART 1 — the autonomous tour, untouched. The guide narrates; we only watch its state.
await tag('CZĘŚĆ 1 · GENESIS TOUR — PRZEWODNIK PROWADZI SAM');
await goHash('#/tour');
const tourStart = Date.now();
let lastState = null;
let lastCaption = null;
let ended = false;
while (Date.now() - tourStart < TOUR_TIMEOUT_MS) {
  const snap = await page.evaluate(() => ({
    state: document.querySelector('[data-testid="guide-state"]')?.textContent?.trim() ?? null,
    caption: document.querySelector('[data-testid="guide-caption"]')?.textContent?.trim() ?? null,
    hallEnd: document.querySelector('[data-testid="hall-tour-end"]') !== null,
    hash: location.hash,
  })).catch(() => null);
  if (snap === null) { await sleep(500); continue; }
  if (snap.state !== lastState) { lastState = snap.state; say(`guide state → ${snap.state ?? '(none)'} @ ${snap.hash}`); }
  if (snap.caption && snap.caption !== lastCaption) { lastCaption = snap.caption; say(`guide says: ${snap.caption}`); }
  if (snap.hallEnd) { ended = true; say('hall tour end reached'); break; }
  await sleep(700);
}
if (!ended) errors.push(`tour did not reach the Discovery Hall end within ${TOUR_TIMEOUT_MS / 1000}s (last state ${lastState})`);
await sleep(4000);
await tag('');

// 3. PART 2 — several functions, briefly.
await tag('CZĘŚĆ 2 · KILKA FUNKCJI');
await goHash('#/worlds');
await caption('ŚWIATY 3D', 'Cztery światy, jeden język wizualny: Miasto, Laboratorium, Molekuła, Discovery Hall. Każdy ma zapisany cel badawczy i jawną etykietę REAL / WIZUALIZACJA.');
await sleep(7000);

await goHash('#/molecule');
await page.waitForSelector('canvas', { timeout: 60000 }).catch(() => {});
await sleep(2500);
await caption('MOLECULE LAB', 'Struktura 3D liczona z RDKit. To model obliczeniowy, nie pomiar laboratoryjny — i tak jest opisany na ekranie.', MODEL);
await sleep(8000);

await goHash('#/');
await sleep(800);
await caption('SCIENCE CHAT', 'Jedno pole na każdej stronie. Wpisujemy: „Pokaż epidemię w mieście”.');
const ask = page.locator('.topbar-ask-input').first();
await ask.click();
await ask.type('Pokaż epidemię w mieście', { delay: 45 });
await sleep(600);
await ask.press('Enter');
await sleep(2500);
await caption('SCIENCE CHAT', 'Chat wybrał istniejący model (SIR/SEIR) i otworzył żywą symulację: agenci w mieście, zakażenia z realnych kontaktów. Wykres jest skutkiem, nie założeniem.', SIM);
await sleep(9000);
await captionOff();
const chatHash = await page.evaluate(() => location.hash);
say(`after chat command: ${chatHash}`);

await goHash('#/memory');
await caption('DOWODY I PAMIĘĆ', 'Zapisane przebiegi, evidence, replay. Każdy wynik na tym ekranie ma odcisk, a każdy werdykt — pieczęć SHA-256 z łańcuchem audytu.', REAL);
await sleep(7000);
await captionOff();
await tag('');

// 4. CLOSING
await title('genesis-physics.com', 2600);

await ctx.close();
await browser.close();

const videoFile = readdirSync(OUT_DIR).find((f) => f.endsWith('.webm'));
let videoPath = null;
if (videoFile !== undefined) { videoPath = path.join(OUT_DIR, 'film.webm'); renameSync(path.join(OUT_DIR, videoFile), videoPath); }
say(`pageerrors: ${errors.length}${errors.length ? ' — ' + errors.join(' | ') : ''}`);
say(`overlay faults: ${overlayFaults.length}${overlayFaults.length ? ' — ' + overlayFaults.join(' | ') : ''}`);
say(`raw video: ${videoPath ?? '(missing)'}`);

if (videoPath !== null) {
  const ffmpeg = process.env.FFMPEG ?? 'ffmpeg';
  const cutPath = path.join(OUT_DIR, 'film.mp4');
  const args = ['-v', 'error', '-y', '-ss', trimOffsetSec.toFixed(2), '-i', videoPath, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', cutPath];
  try {
    execFileSync(ffmpeg, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    say(`final cut: ${cutPath}`);
  } catch (e) {
    say(`ffmpeg not available (${e.code ?? e.message}); make the cut yourself: ffmpeg ${args.join(' ')}`);
  }
}
writeFileSync(path.join(OUT_DIR, 'film-log.txt'), log.join('\n') + '\n');
process.exit(videoPath !== null && errors.length === 0 && overlayFaults.length === 0 ? 0 : 1);
