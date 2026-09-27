import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INGESTION_ROWS,
  ScientificIngestionView,
  runDefaultIngestion,
  shortHash,
  type IngestionFetcher,
} from '../components/ScientificIngestionPanel';
import type { ScientificIngestionResult } from '../core/backend/client';

/**
 * D-149 panel — static-markup test (this repo's component-test pattern, no
 * jsdom). The client is stubbed; nothing here touches the network. The
 * assertion that matters: the panel prints the status the backend returned
 * and nothing more flattering.
 */

const at = '2026-09-27T12:00:00.000Z';
const live: ScientificIngestionResult = {
  source: 'uniprot', id: 'P00519', url: 'https://rest.uniprot.org/uniprotkb/P00519.json', status: 'LIVE', httpStatus: 200,
  sha256: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789', bytes: 1234, fetchedAt: at,
};
const noAccess: ScientificIngestionResult = {
  source: 'chembl', id: 'CHEMBL941', url: 'https://www.ebi.ac.uk/chembl/api/data/molecule/CHEMBL941.json', status: 'NO_ACCESS',
  httpStatus: null, sha256: null, bytes: 0, fetchedAt: at, error: 'network_error: CONNECT tunnel failed, response 403',
};
const pinned: ScientificIngestionResult = {
  source: 'pdb', id: '1IEP', url: 'https://files.rcsb.org/download/1IEP.pdb', status: 'PINNED_FALLBACK', httpStatus: null,
  sha256: '5f6aee6029f9a2a2c2be32d4eb948ae70808690573e1b69a0850cdffd7048ca7', bytes: 100, fetchedAt: at,
  error: 'network_error: CONNECT tunnel failed, response 403',
  pinned: {
    path: 'packages/backend/src/compute/targets/abl1-1iep/1iep_receptorH.pdb', sha256: '5f6aee6029f9a2a2c2be32d4eb948ae70808690573e1b69a0850cdffd7048ca7', bytes: 100,
    recordedSha256: '5f6aee6029f9a2a2c2be32d4eb948ae70808690573e1b69a0850cdffd7048ca7', recordedIn: 'SOURCE.json', matchesRecord: true,
    nature: 'PREPARED receptor, not the raw RCSB file',
  },
};

const stubFetcher: IngestionFetcher = async (source, id) => {
  if (source === 'uniprot') return { ok: true, data: { ...live, id } };
  if (source === 'chembl') return { ok: true, data: { ...noAccess, id } };
  if (source === 'pdb') return { ok: true, data: { ...pinned, id } };
  return { ok: false, status: 0, error: 'offline', message: 'Brak połączenia z backendem.' };
};

describe('ScientificIngestionPanel (D-149)', () => {
  it('renders the four default rows, the caveat and the live button before any fetch', () => {
    const markup = renderToStaticMarkup(<ScientificIngestionView rows={DEFAULT_INGESTION_ROWS} states={{}} busy={false} onFetch={() => {}} />);
    expect(markup).toContain('Ingestia na żywo z hashem');
    expect(markup).toContain('Bez sieci status to NO_ACCESS; wynik przypięty jest oznaczony osobno, nigdy nie udaje pobrania na żywo.');
    expect(markup).toContain('Pobierz na żywo');
    for (const id of ['1IEP', 'CHEMBL941', 'P00519', 'NCT03987919']) expect(markup).toContain(`<code>${id}</code>`);
    expect(markup).toContain('nie pobrano');
    expect(markup).not.toContain('ingestion-status-LIVE');
  });

  it('runDefaultIngestion asks the client for every default id and keeps each answer as returned', async () => {
    const calls: string[] = [];
    const spy: IngestionFetcher = async (s, id) => { calls.push(`${s}:${id}`); return stubFetcher(s, id); };
    const states = await runDefaultIngestion(spy);
    expect(calls).toEqual(['pdb:1IEP', 'chembl:CHEMBL941', 'uniprot:P00519', 'clinicaltrials:NCT03987919']);
    expect(states.uniprot).toEqual({ kind: 'done', result: live });
    expect(states.chembl).toEqual({ kind: 'done', result: noAccess });
    expect(states.pdb).toEqual({ kind: 'done', result: pinned });
    expect(states.clinicaltrials).toEqual({ kind: 'failed', error: 'offline', message: 'Brak połączenia z backendem.' });
  });

  it('shows LIVE / NO_ACCESS / PINNED_FALLBACK exactly as the backend returned them, with 12-char hash and fetchedAt', async () => {
    const states = await runDefaultIngestion(stubFetcher);
    const markup = renderToStaticMarkup(<ScientificIngestionView rows={DEFAULT_INGESTION_ROWS} states={states} busy={false} onFetch={() => {}} />);
    expect(markup).toContain('data-testid="ingestion-status-LIVE"');
    expect(markup).toContain('data-testid="ingestion-status-NO_ACCESS"');
    expect(markup).toContain('data-testid="ingestion-status-PINNED_FALLBACK"');
    expect(markup).toContain(`<code>${shortHash(live.sha256)}</code>`);
    expect(shortHash(live.sha256)).toBe('abcdef012345…');
    expect(shortHash(null)).toBe('—');
    expect(markup).toContain(at);
    expect(markup).toContain('CONNECT tunnel failed, response 403');
    expect(markup).toContain('1iep_receptorH.pdb');
    expect(markup).toContain('hash zgodny z zapisem');
    expect(markup).toContain('PREPARED receptor, not the raw RCSB file');
    expect(markup).toContain('BŁĄD API');
    // A NO_ACCESS row never shows a hash.
    const chemblRow = markup.slice(markup.indexOf('ingestion-row-chembl'), markup.indexOf('ingestion-row-uniprot'));
    expect(chemblRow).toContain('<code>—</code>');
  });
});
