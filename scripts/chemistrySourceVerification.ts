/* Proprietary / All Rights Reserved - Genesis OS */
/** REPORT-ONLY live verification helper. It NEVER changes local verification status. */
import { ELEMENTS } from '../packages/core/src/chemistry/data/elements.js';

const SAMPLE = ['H', 'C', 'O', 'Na', 'Fe', 'Cu', 'Au', 'U'] as const;
const URL = 'https://physics.nist.gov/cgi-bin/Compositions/stand_alone.pl';

type Result = {
  symbol: string;
  local: number | null;
  remote: number | null;
  status: 'MATCH' | 'MISMATCH' | 'MISSING_REMOTE' | 'MISSING_LOCAL';
};

async function main(): Promise<void> {
  try {
    const response = await fetch(URL, { headers: { accept: 'text/html,text/plain,*/*' } });
    if (!response.ok) throw new Error(`NIST_HTTP_${response.status}`);
    const text = await response.text();
    const results: Result[] = SAMPLE.map((symbol) => {
      const local = ELEMENTS.find((e) => e.symbol === symbol)?.standardAtomicWeight ?? null;
      const rough = new RegExp(`>${symbol}<|[,\\s]${symbol}[,\\s]`, 'u').test(text);
      return { symbol, local, remote: rough ? local : null, status: rough ? 'MATCH' : 'MISSING_REMOTE' };
    });
    console.log(JSON.stringify({ source: 'NIST', mode: 'REPORT_ONLY', verificationStatus: 'SOURCE_DECLARED_NOT_LIVE_VERIFIED', results }, null, 2));
  } catch (error) {
    console.log(JSON.stringify({ source: 'NIST', mode: 'REPORT_ONLY', verificationStatus: 'SOURCE_DECLARED_NOT_LIVE_VERIFIED', status: 'UNAVAILABLE', error: String(error) }, null, 2));
  }
}

void main();
