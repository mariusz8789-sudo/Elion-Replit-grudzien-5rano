import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Layer boundaries, enforced statically.
 *
 * The architecture in docs/DISCOVERY_OS_ARCHITECTURE.md says L3 is pure and that
 * the three worlds may not reference each other. Written as a document, that
 * lasts until the first deadline. Written as a test, it is a rule.
 *
 * This is the same instrument as serverRouting.test.mjs: parse the source, assert
 * a property that no unit test would catch, and fail loudly when someone takes
 * the convenient shortcut. The shortcut here is genuinely tempting — one `import
 * store from '../store.mjs'` inside the reasoning core would make a dozen things
 * easier and would silently end replayability, because a reasoning step that
 * reads the world cannot be re-run against a different world.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REASONING = path.resolve(HERE, '../../reasoning/src');
const BACKEND = HERE;

function sourceFiles(dir, ext) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) { out.push(...sourceFiles(full, ext)); continue; }
    if (entry.endsWith(ext) && !entry.includes('.test.')) out.push(full);
  }
  return out;
}

const rel = (f) => path.relative(path.resolve(HERE, '../..'), f);

describe('L3 reasoning core is pure', () => {
  const files = sourceFiles(REASONING, '.ts');

  test('the package is not empty — a guard over nothing proves nothing', () => {
    assert.ok(files.length >= 15, `expected the reasoning core, found ${files.length} files`);
  });

  test('does not touch a database, the filesystem or the network', () => {
    // A reasoning step that reads the world cannot be replayed against a
    // different world, and replay is what makes an artifact auditable.
    const banned = [
      [/\bfrom\s+'node:(fs|sqlite|http|https|net)'/, 'node builtin I/O'],
      [/\bfetch\s*\(/, 'fetch'],
      [/\bdb\.prepare\s*\(/, 'a database handle'],
      [/require\s*\(\s*'node:/, 'node builtin via require'],
    ];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      for (const [pattern, what] of banned) {
        assert.ok(!pattern.test(src), `${rel(file)} uses ${what}; L3 must be a function from data to data`);
      }
    }
  });

  test('is deterministic — no clock, no randomness', () => {
    // Same inputs must give the same output, or "Genesis concluded X in March"
    // is not a checkable statement.
    for (const file of files) {
      const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      assert.ok(!/\bDate\.now\s*\(/.test(src), `${rel(file)} reads the clock`);
      assert.ok(!/\bnew Date\s*\(\s*\)/.test(src), `${rel(file)} reads the clock`);
      assert.ok(!/\bMath\.random\s*\(/.test(src), `${rel(file)} uses randomness`);
    }
  });

  test('does not import a surface', () => {
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      assert.ok(!/from\s+'react'/.test(src), `${rel(file)} imports React`);
      assert.ok(!/\b(document|localStorage|sessionStorage)\s*\./.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), `${rel(file)} touches the DOM`);
      assert.ok(!/from\s+'[^']*packages\/(frontend|backend)/.test(src), `${rel(file)} imports a package above it`);
    }
  });

  test('imports nothing outside itself', () => {
    // No third-party dependency, no reach into a sibling package. The whole
    // point of the L3 move was that the server could run this unchanged.
    for (const file of files) {
      for (const m of readFileSync(file, 'utf8').matchAll(/from\s+'([^']+)'/g)) {
        assert.ok(m[1].startsWith('.'), `${rel(file)} imports '${m[1]}'; L3 may only import itself`);
      }
    }
  });
});

describe('the three worlds stay separate', () => {
  test('lookingGlass does not import cognitive, and cognitive does not import lookingGlass', () => {
    // One bridge only: the lg_node_map table. A direct import would couple a
    // bulk-append literature corpus to a transactional campaign pipeline, and
    // the two have different failure modes, different rebuild semantics and
    // different databases.
    for (const file of sourceFiles(path.join(BACKEND, 'lookingGlass'), '.mjs')) {
      assert.ok(!/from\s+'[^']*cognitive\//.test(readFileSync(file, 'utf8')), `${rel(file)} imports cognitive/`);
    }
    for (const file of sourceFiles(path.join(BACKEND, 'cognitive'), '.mjs')) {
      assert.ok(!/from\s+'[^']*lookingGlass\//.test(readFileSync(file, 'utf8')), `${rel(file)} imports lookingGlass/`);
    }
  });
});
