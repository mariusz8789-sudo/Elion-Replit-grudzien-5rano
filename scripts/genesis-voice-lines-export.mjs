#!/usr/bin/env node
/**
 * GENESIS — export the voice guide's lines for the TTS generator (D-119).
 *
 *   npm run voice:lines
 *
 * Builds every sentence the guide can say for the committed, replay-verified
 * LOWER-HARM run (artifacts/lower-harm/*): all beats × three levels × two
 * languages, the "explain simpler" variants, the Follow-the-Evidence steps and
 * the Discovery Hall shots. Writes packages/frontend/public/audio/lines.json,
 * which scripts/genesis_tts.py reads to render MP3s + manifest.json. At
 * runtime a recording plays ONLY when its text equals the sentence the model
 * derives from the live run, so a stale recording can never speak over a
 * different result.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(REPO, 'packages/frontend/public/audio');
const ART = path.join(REPO, 'artifacts/lower-harm');

const work = mkdtempSync(path.join(tmpdir(), 'genesis-voice-lines-'));
const entry = path.join(work, 'entry.ts');
writeFileSync(entry, [
  "export * from '/home/user/Elion-Replit-grudzien-5rano/packages/frontend/src/core/guide/narrationModel';".replace('/home/user/Elion-Replit-grudzien-5rano', REPO),
  "export { followEvidenceSteps } from '/home/user/Elion-Replit-grudzien-5rano/packages/frontend/src/core/guide/followEvidence';".replace('/home/user/Elion-Replit-grudzien-5rano', REPO),
  "export { buildDiscoveryHallSequence } from '/home/user/Elion-Replit-grudzien-5rano/packages/frontend/src/core/three/discoveryHallSequence';".replace('/home/user/Elion-Replit-grudzien-5rano', REPO),
].join('\n'));
const bundle = path.join(work, 'guide.mjs');
execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), [entry, '--bundle', '--format=esm', '--platform=node', '--target=node22', '--log-level=error', `--outfile=${bundle}`], { cwd: REPO, stdio: ['ignore', 'ignore', 'inherit'] });
const guide = await import(bundle);

const detail = JSON.parse(readFileSync(path.join(ART, 'run-detail.json'), 'utf8'));
const record = JSON.parse(readFileSync(path.join(ART, 'winner-record.json'), 'utf8'));
const replay = JSON.parse(readFileSync(path.join(ART, 'replay-verification.json'), 'utf8'));
const run = {
  kind: 'RUN', verdict: replay.runA.verdict, mode: 'PRODUCTION', auditFingerprint: replay.runA.auditFingerprint, recipeFingerprint: replay.runA.recipeFingerprint,
  stages: replay.stages, detail, winnerRecord: record,
  evidenceCustody: replay.evidenceCustody === null ? null : { ok: replay.evidenceCustody.ok, sourceId: replay.evidenceCustody.sourceId, record: { artifact: { hash: replay.evidenceCustody.hash, hashPolicy: replay.evidenceCustody.hashPolicy } } },
};

const lines = [];
for (const lang of ['pl', 'en']) {
  // Beats for a finished run (with MATCH replay), plus the pre-run and in-flight variants.
  const variants = [
    { tag: '', facts: guide.factsFromRun(run, { ok: true }) },
    { tag: '', facts: guide.factsFromRun(null, null) },
    { tag: '', facts: guide.factsFromRun(null, null, true) },
  ];
  const seen = new Set();
  for (const { facts } of variants) {
    for (const level of ['EXPLORER', 'SCIENTIST', 'AUDITOR']) {
      for (const b of guide.buildNarration(facts, { level, lang })) {
        for (const [key, text] of [[`${b.id}:${level}`, b.text], [`${b.id}:plain`, b.plain]]) {
          const k = `${lang}|${key}|${text}`;
          if (seen.has(k)) continue;
          seen.add(k);
          lines.push({ id: key, lang, text });
        }
      }
    }
  }
  for (const s of guide.followEvidenceSteps(guide.factsFromRun(run, { ok: true }), lang)) lines.push({ id: `follow:${s.id}`, lang, text: s.text });
}
for (const s of guide.buildDiscoveryHallSequence(run)) lines.push({ id: `hall:${s.id}`, lang: 'pl', text: `${s.title}. ${s.lines[0] ?? ''}` });

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(path.join(OUT_DIR, 'lines.json'), JSON.stringify(lines, null, 2) + '\n');
console.log(`wrote ${path.relative(REPO, path.join(OUT_DIR, 'lines.json'))}: ${lines.length} lines (${lines.filter((l) => l.lang === 'pl').length} pl, ${lines.filter((l) => l.lang === 'en').length} en)`);
