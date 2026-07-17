/**
 * computeWorker (Genesis 2.1, Part 1) — wątek roboczy puli obliczeniowej.
 *
 * Uruchamiany jako worker_thread przez computePool. Wykonuje DOKŁADNIE ten sam,
 * istniejący, synchroniczny kod RDKit/ADMET-AI (buildLaboratoryReadiness / depict2d /
 * embed3d / admetAdapter.predict) — ale w OSOBNYM wątku, więc blokujący execFileSync
 * nie zamraża głównej pętli zdarzeń (np. zapisów kampanii w toku podczas predykcji
 * ADMET). Zero zmian w logice silników; zero duplikacji logiki obliczeniowej.
 */
import { parentPort } from 'node:worker_threads';
import * as rdkitAdapter from './rdkitAdapter.mjs';
import * as admetAdapter from './admetAdapter.mjs';
import { buildLaboratoryReadiness } from '../cognitive/laboratoryReadiness.mjs';

function handle(cmd, args) {
  switch (cmd) {
    case 'laboratory-readiness':
      return { readiness: buildLaboratoryReadiness(args.candidate ?? {}, { scientificQuestion: args.scientificQuestion ?? null }) };
    case 'molecule-render': {
      const smiles = String(args.smiles ?? '');
      const want3d = args.mode !== '2d';
      const depiction2d = rdkitAdapter.depict2d(smiles, { width: args.width ?? 440, height: args.height ?? 340 });
      const model3d = want3d ? rdkitAdapter.embed3d(smiles) : null;
      return { smiles, depiction2d, model3d };
    }
    case 'admet-predict':
      return admetAdapter.predict(args.smiles);
    default:
      throw new Error(`unknown compute command: ${cmd}`);
  }
}

parentPort.on('message', (msg) => {
  const { id, cmd, args } = msg;
  try {
    parentPort.postMessage({ id, ok: true, result: handle(cmd, args) });
  } catch (err) {
    parentPort.postMessage({ id, ok: false, error: String(err?.message ?? err).slice(0, 300) });
  }
});
