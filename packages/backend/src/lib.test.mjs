import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  sanitizeFlat,
  createRateLimiter,
  mimeFor,
  isHashedAsset,
  resolveStaticPath,
  SECURITY_HEADERS,
  LAB_KNOWLEDGE_FILES,
  buildKnowledgeIndex,
  knowledgeExcerptFor,
  AI_UNAVAILABLE_MESSAGE,
} from './lib.mjs';

describe('sanitizeFlat', () => {
  test('rejects non-object input', () => {
    assert.deepEqual(sanitizeFlat(null), {});
    assert.deepEqual(sanitizeFlat(undefined), {});
    assert.deepEqual(sanitizeFlat('string'), {});
    assert.deepEqual(sanitizeFlat(42), {});
    assert.deepEqual(sanitizeFlat([1, 2, 3]), {});
  });

  test('keeps numbers, booleans, strings', () => {
    const out = sanitizeFlat({ a: 1, b: true, c: 'hi' });
    assert.deepEqual(out, { a: 1, b: true, c: 'hi' });
  });

  test('drops non-primitive values silently', () => {
    const out = sanitizeFlat({ ok: 1, nested: { x: 1 }, fn: () => 1, arr: [1, 2], nil: null });
    assert.deepEqual(out, { ok: 1 });
  });

  test('rejects non-finite numbers', () => {
    const out = sanitizeFlat({ a: NaN, b: Infinity, c: -Infinity, d: 5 });
    assert.deepEqual(out, { d: 5 });
  });

  test('truncates long string values to 200 chars', () => {
    const out = sanitizeFlat({ s: 'x'.repeat(500) });
    assert.equal(out.s.length, 200);
  });

  test('truncates long keys to 60 chars', () => {
    const longKey = 'k'.repeat(200);
    const out = sanitizeFlat({ [longKey]: 1 });
    const keys = Object.keys(out);
    assert.equal(keys.length, 1);
    assert.equal(keys[0].length, 60);
  });

  test('respects maxKeys limit', () => {
    const input = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${i}`, i]));
    const out = sanitizeFlat(input, 5);
    assert.equal(Object.keys(out).length, 5);
  });
});

describe('createRateLimiter', () => {
  test('allows up to the limit, blocks after', () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });
    assert.equal(limiter.allow('1.2.3.4'), true);
    assert.equal(limiter.allow('1.2.3.4'), true);
    assert.equal(limiter.allow('1.2.3.4'), true);
    assert.equal(limiter.allow('1.2.3.4'), false);
  });

  test('tracks IPs independently', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    assert.equal(limiter.allow('a'), true);
    assert.equal(limiter.allow('b'), true);
    assert.equal(limiter.allow('a'), false);
    assert.equal(limiter.allow('b'), false);
  });

  test('resets the window after windowMs elapses', async () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 20 });
    assert.equal(limiter.allow('x'), true);
    assert.equal(limiter.allow('x'), false);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(limiter.allow('x'), true);
  });

  test('cleanup removes only expired buckets', () => {
    const limiter = createRateLimiter({ limit: 5, windowMs: 1000 });
    limiter.allow('fresh');
    limiter.allow('stale');
    assert.equal(limiter.size(), 2);
    // "now" far in the future: both buckets appear expired relative to it.
    limiter.cleanup(Date.now() + 5000);
    assert.equal(limiter.size(), 0);
  });
});

describe('mimeFor', () => {
  test('resolves known extensions', () => {
    assert.equal(mimeFor('index.html'), 'text/html; charset=utf-8');
    assert.equal(mimeFor('app.js'), 'text/javascript; charset=utf-8');
    assert.equal(mimeFor('styles.css'), 'text/css; charset=utf-8');
    assert.equal(mimeFor('icon.png'), 'image/png');
    assert.equal(mimeFor('manifest.webmanifest'), 'application/manifest+json; charset=utf-8');
  });

  test('falls back to octet-stream for unknown extensions', () => {
    assert.equal(mimeFor('data.bin'), 'application/octet-stream');
    assert.equal(mimeFor('no-extension'), 'application/octet-stream');
  });
});

describe('isHashedAsset', () => {
  test('matches Vite content-hashed filenames', () => {
    assert.equal(isHashedAsset('index-CJ3HY2uy.css'), true);
    assert.equal(isHashedAsset('index-DtIbrL6w.js'), true);
  });

  test('does not match plain filenames', () => {
    assert.equal(isHashedAsset('index.html'), false);
    assert.equal(isHashedAsset('manifest.webmanifest'), false);
    assert.equal(isHashedAsset('sw.js'), false);
  });
});

describe('resolveStaticPath', () => {
  const staticDir = path.resolve('/app/dist');

  test('resolves a normal path inside staticDir', () => {
    const r = resolveStaticPath(staticDir, '/assets/index.js');
    assert.equal(r.ok, true);
    assert.equal(r.filePath, path.join(staticDir, 'assets', 'index.js'));
  });

  test('resolves the root path to staticDir itself', () => {
    const r = resolveStaticPath(staticDir, '/');
    assert.equal(r.ok, true);
    // path.join(staticDir, '/') keeps a trailing separator — harmless (the
    // server statSync()s it as a directory and falls back to index.html).
    assert.equal(r.filePath, path.join(staticDir, '/'));
  });

  test('rejects classic ../ traversal', () => {
    const r = resolveStaticPath(staticDir, '/../../etc/passwd');
    assert.equal(r.ok, false);
  });

  test('rejects URL-encoded traversal (..%2f)', () => {
    const r = resolveStaticPath(staticDir, '/..%2f..%2fetc%2fpasswd');
    assert.equal(r.ok, false);
  });

  test('rejects sibling-directory prefix confusion (no separator boundary)', () => {
    // "/app/dist-evil/x" starts with the string "/app/dist" but is NOT inside it —
    // a naive startsWith(staticDir) check would wrongly allow this.
    const r = resolveStaticPath(staticDir, '/../dist-evil/secret.txt');
    assert.equal(r.ok, false);
  });
});

describe('SECURITY_HEADERS', () => {
  test('includes the expected hardening headers', () => {
    assert.equal(SECURITY_HEADERS['x-content-type-options'], 'nosniff');
    assert.equal(SECURITY_HEADERS['x-frame-options'], 'DENY');
    assert.ok(SECURITY_HEADERS['content-security-policy'].includes("default-src 'self'"));
    assert.ok(SECURITY_HEADERS['content-security-policy'].includes("frame-ancestors 'none'"));
    assert.ok(SECURITY_HEADERS['referrer-policy']);
    assert.ok(SECURITY_HEADERS['permissions-policy']);
  });
});

describe('AI_UNAVAILABLE_MESSAGE (production hardening: no secrets/config leaked to clients)', () => {
  test('is a non-empty, Polish, user-facing message', () => {
    assert.ok(AI_UNAVAILABLE_MESSAGE.length > 0);
    assert.match(AI_UNAVAILABLE_MESSAGE, /Narrator/);
  });

  test('never names the environment variable or other server configuration details', () => {
    assert.doesNotMatch(AI_UNAVAILABLE_MESSAGE, /ANTHROPIC_API_KEY/i);
    assert.doesNotMatch(AI_UNAVAILABLE_MESSAGE, /process\.env/i);
    assert.doesNotMatch(AI_UNAVAILABLE_MESSAGE, /\.env\b/i);
    assert.doesNotMatch(AI_UNAVAILABLE_MESSAGE, /restart|zrestartuj/i);
  });
});

describe('buildKnowledgeIndex / knowledgeExcerptFor (Narrator grounding)', () => {
  function fakeReader(files) {
    return (filePath) => {
      const name = path.basename(filePath);
      if (!(name in files)) throw new Error(`ENOENT: ${filePath}`);
      return files[name];
    };
  }

  test('loads a file for every lab id that has one available', () => {
    const files = { 'quantum.md': '# Quantum content', 'nuclear.md': '# Nuclear content' };
    const index = buildKnowledgeIndex('/fake/knowledge', fakeReader(files));
    assert.equal(index.get('quantum'), '# Quantum content');
    assert.equal(index.get('nuclear'), '# Nuclear content');
  });

  test('missing files are skipped silently, not thrown', () => {
    const index = buildKnowledgeIndex('/fake/knowledge', fakeReader({}));
    assert.equal(index.size, 0);
    assert.equal(index.get('quantum'), undefined);
  });

  test('spacetime and einstein share the same knowledge file, per LAB_KNOWLEDGE_FILES', () => {
    assert.equal(LAB_KNOWLEDGE_FILES.spacetime, LAB_KNOWLEDGE_FILES.einstein);
  });

  test('every registered lab id maps to a .md filename', () => {
    for (const [labId, filename] of Object.entries(LAB_KNOWLEDGE_FILES)) {
      assert.match(filename, /\.md$/, `${labId} -> ${filename}`);
    }
  });

  test('knowledgeExcerptFor returns null when no file was loaded for that lab', () => {
    const index = buildKnowledgeIndex('/fake/knowledge', fakeReader({}));
    assert.equal(knowledgeExcerptFor(index, 'quantum'), null);
  });

  test('knowledgeExcerptFor returns the full content when under the limit', () => {
    const index = buildKnowledgeIndex('/fake/knowledge', fakeReader({ 'quantum.md': 'short content' }));
    assert.equal(knowledgeExcerptFor(index, 'quantum', 4000), 'short content');
  });

  test('knowledgeExcerptFor truncates content over the character limit', () => {
    const long = 'x'.repeat(5000);
    const index = buildKnowledgeIndex('/fake/knowledge', fakeReader({ 'quantum.md': long }));
    const excerpt = knowledgeExcerptFor(index, 'quantum', 100);
    assert.equal(excerpt.length, 100 + '\n…(przycięte)'.length);
    assert.ok(excerpt.endsWith('…(przycięte)'));
  });
});
