import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const dockerfile = readFileSync(path.join(REPO, 'Dockerfile'), 'utf8');

test('production image installs the pinned RDKit reference runtime', () => {
  assert.match(dockerfile, /COPY packages\/backend\/requirements-rdkit\.txt packages\/backend\/requirements-rdkit\.txt/);
  assert.match(dockerfile, /python3 -m venv \/opt\/genesis-science/);
  assert.match(dockerfile, /pip install[^\n]*-r packages\/backend\/requirements-rdkit\.txt/);
});

test('production image points the canonical adapter at its isolated interpreter', () => {
  assert.match(dockerfile, /ENV GENESIS_RDKIT_PYTHON=\/opt\/genesis-science\/bin\/python/);
  assert.doesNotMatch(dockerfile, /ENV GENESIS_RDKIT_PYTHON=(?:python|python3)\s*$/m);
});
