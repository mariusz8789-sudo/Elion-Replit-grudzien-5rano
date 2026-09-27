import path from 'node:path';
import { generateTemporalCinematicScene } from '../src/core/lookingGlass/urbanTransformation/urbanTransformationOrchestrator.ts';
import { parseTemporalSceneRequest } from '../src/core/lookingGlass/urbanTransformation/temporalSceneRequestParser.ts';
import { captureRealTemporalFrames } from '../src/core/lookingGlass/urbanTransformation/realTemporalCapture.node.ts';
import { encodeFramesToWebm } from '../src/core/lookingGlass/urbanTransformation/bundledFfmpegVideoEncoder.node.ts';

async function main() {
  const prompt = process.argv[2] ?? 'Wygeneruj 5 sekund filmu pokazującego tę samą ulicę w Warszawie w 1900 i 2026.';
  const routeUrl = process.argv[3] ?? 'http://localhost:8080/#/temporal-cinematic';
  const outDir = process.argv[4] ?? '/tmp/tc-e2e-out';

  console.log('=== STAGE 1: real pipeline (parse -> years -> world states -> consistency -> camera path) ===');
  const result = generateTemporalCinematicScene(prompt);
  console.log('status:', result.status);
  console.log('temporalStates:', result.temporalStates.map((s) => ({ year: s.year, entities: s.entities.length })));
  console.log('cameraPath points:', result.cameraPath?.points.length);
  if (!result.cameraPath || result.temporalStates.length === 0) {
    console.error('BLOCKED before camera path — cannot proceed to real capture. unresolved:', result.unresolved);
    process.exit(1);
  }

  const weather = parseTemporalSceneRequest(prompt).request.atmosphere.weather;
  console.log('weather:', weather ?? '(none parsed)');

  console.log('\n=== STAGE 2: real Playwright capture ===');
  const capture = await captureRealTemporalFrames(result.temporalStates, result.cameraPath, routeUrl, outDir, (i, total, frame) => {
    if (i % 10 === 0 || i === total - 1) console.log(`  frame ${i + 1}/${total}: ${frame.frame.source} (year ${frame.frame.year})`);
  }, undefined, weather);
  console.log('browserAvailable:', capture.browserAvailable);
  console.log('allBlocked:', capture.allBlocked);
  const captured = capture.frames.filter((f) => f.frame.source === 'CAPTURED');
  const notRendered = capture.frames.filter((f) => f.frame.source === 'NOT_RENDERED');
  console.log(`captured: ${captured.length} / ${capture.frames.length}`);
  if (notRendered.length > 0) console.log('first NOT_RENDERED note:', notRendered[0].frame.note);
  if (captured.length > 0) {
    console.log('first captured frame:', captured[0].frame, captured[0].path);
    console.log('last captured frame:', captured[captured.length - 1].frame, captured[captured.length - 1].path);
  }

  if (captured.length === 0) {
    console.error('No frames captured — stopping before encode.');
    process.exit(1);
  }

  console.log('\n=== STAGE 3: real ffmpeg encode (Playwright-bundled binary, webm) ===');
  const framePaths = captured.map((f) => f.path!);
  const video = encodeFramesToWebm(framePaths, path.join(outDir, 'output.webm'), 24);
  console.log('video:', video);

  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify({
    frameCount: capture.frames.length,
    capturedCount: captured.length,
    videoStatus: video.status,
    videoFormat: video.format,
    outputPath: path.join(outDir, 'output.webm'),
  }, null, 2));
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
