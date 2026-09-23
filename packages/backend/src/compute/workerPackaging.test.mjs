import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORKER_GROUPS } from './scientificCapabilityContract.mjs';

/**
 * Static guarantees for the scientific worker images. Each assertion corresponds
 * to a defect found by building the workers' pinned environments from scratch:
 * meeko's undeclared runtime imports, unpinned transitive versions, an unpinned
 * (and potentially CUDA) torch, source builds in a compiler-less image, and the
 * PyPI "meep" name collision.
 */
const BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(BACKEND, rel), 'utf8');

const PIP_WORKERS = Object.freeze({
  'chem-light': { requirements: ['requirements-pyscf.txt', 'requirements-biopython.txt'], imports: ['pyscf', 'Bio'] },
  structural: {
    requirements: ['requirements-rdkit.txt', 'requirements-openmm.txt', 'requirements-vina.txt', 'requirements-meeko.txt'],
    imports: ['rdkit', 'openmm', 'vina', 'meeko', 'scipy', 'gemmi'],
  },
  admet: { requirements: ['requirements-admet.txt'], imports: ['torch', 'admet_ai', 'chemprop'] },
});

function pins(text) {
  const out = new Map();
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = /^([A-Za-z0-9_.-]+)==([A-Za-z0-9_.+!-]+)$/.exec(line);
    if (!m) throw new Error(`not an exact pin: "${line}"`);
    out.set(m[1].toLowerCase().replace(/_/g, '-'), m[2]);
  }
  return out;
}

describe('every worker group has an image', () => {
  test('each WORKER_GROUPS entry has packages/backend/workers/<group>/Dockerfile and no leftover proposal', () => {
    for (const group of Object.keys(WORKER_GROUPS)) {
      assert.ok(existsSync(path.join(BACKEND, 'workers', group, 'Dockerfile')), `missing Dockerfile for ${group}`);
    }
    assert.equal(existsSync(path.join(BACKEND, 'workers/pymeep/Dockerfile.proposal')), false);
  });
});

describe('pip-based workers are fully pinned, binary-only and import-checked at build time', () => {
  for (const [group, spec] of Object.entries(PIP_WORKERS)) {
    test(`${group}: Dockerfile installs binary-only with its constraints lock and checks every import`, () => {
      const dockerfile = read(`workers/${group}/Dockerfile`);
      assert.match(dockerfile, /--only-binary=:all:/, 'the slim image has no compiler: a source build must fail loudly');
      assert.match(dockerfile, new RegExp(`-c packages/backend/workers/${group}/constraints\\.txt`));
      assert.match(dockerfile, new RegExp(`COPY packages/backend/workers/${group}/constraints\\.txt`));
      const importLine = dockerfile.split('\n').find((l) => l.includes('-c "import'));
      assert.ok(importLine, 'build-time import check missing');
      for (const mod of spec.imports) assert.ok(new RegExp(`\\b${mod}\\b`).test(importLine), `${mod} is not import-checked`);
      for (const req of spec.requirements) assert.match(dockerfile, new RegExp(`-r packages/backend/${req.replace('.', '\\.')}`));
      assert.match(dockerfile, /^USER node$/m);
      assert.match(dockerfile, /^HEALTHCHECK /m);
      assert.doesNotMatch(dockerfile, /pip install[^\n]*\bmeep\b/);
    });

    test(`${group}: every requirement pin agrees with the constraints lock`, () => {
      const lock = pins(read(`workers/${group}/constraints.txt`));
      assert.ok(lock.size > 0);
      for (const req of spec.requirements) {
        for (const [name, version] of pins(read(req))) {
          assert.equal(lock.get(name), version, `${req}: ${name}==${version} disagrees with the ${group} lock (${lock.get(name)})`);
        }
      }
    });
  }

  test('meeko pins the runtime imports its metadata does not declare (scipy, gemmi)', () => {
    const meeko = pins(read('requirements-meeko.txt'));
    assert.ok(meeko.has('scipy'));
    assert.ok(meeko.has('gemmi'));
  });

  test('admet: torch is pinned from the CPU index, locked, and a CUDA build fails the image build', () => {
    const dockerfile = read('workers/admet/Dockerfile');
    assert.match(dockerfile, /torch==2\.14\.0 --index-url https:\/\/download\.pytorch\.org\/whl\/cpu/);
    assert.match(dockerfile, /torch\.version\.cuda is None/);
    const lock = pins(read('workers/admet/constraints.txt'));
    assert.equal(lock.get('torch'), '2.14.0');
    for (const name of lock.keys()) assert.ok(!/^(nvidia-|cuda-|triton$)/.test(name), `CUDA-only package ${name} in the CPU lock`);
  });
});

describe('pymeep worker is built only from conda-forge', () => {
  test('the explicit lock pins every package by conda-forge URL and md5', () => {
    const lock = read('workers/pymeep/conda-linux-64.lock');
    assert.match(lock, /^@EXPLICIT$/m);
    const entries = lock.split('\n').filter((l) => l.startsWith('https://'));
    assert.ok(entries.length > 50);
    for (const entry of entries) assert.match(entry, /^https:\/\/conda\.anaconda\.org\/conda-forge\/(linux-64|noarch)\/[^#\s]+#[a-f0-9]{32}$/);
    assert.ok(entries.some((e) => /\/pymeep-1\.34\.0-nompi_py311[^/]*$/.test(e)), 'the verified pymeep build is locked');
    assert.ok(entries.some((e) => /\/python-3\.11\./.test(e)));
  });

  test('the Dockerfile verifies micromamba by SHA-256, creates the env only from the lock, and never touches PyPI meep', () => {
    const dockerfile = read('workers/pymeep/Dockerfile');
    assert.match(dockerfile, /MICROMAMBA_URL=https:\/\/conda\.anaconda\.org\/conda-forge\//);
    assert.match(dockerfile, /MICROMAMBA_SHA256=[a-f0-9]{64}/);
    assert.match(dockerfile, /sha256sum -c -/);
    assert.match(dockerfile, /micromamba create -y -p \/opt\/genesis-meep --file \/tmp\/conda-linux-64\.lock/);
    assert.match(dockerfile, /ENV GENESIS_MEEP_PYTHON=\/opt\/genesis-meep\/bin\/python/);
    assert.doesNotMatch(dockerfile, /pip install/);
    assert.match(dockerfile, /^USER node$/m);
  });
});
