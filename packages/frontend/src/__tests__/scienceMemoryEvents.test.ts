import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { notifyScienceMemoryChanged, subscribeScienceMemory } from '../core/scienceMemoryEvents';

/**
 * SCIENCE MEMORY EVENTS — two things proven here:
 *
 * 1. The pub/sub mechanism itself (subscribe, unsubscribe, multiple
 *    listeners, no listeners, a listener that unsubscribes itself mid-
 *    notification) — mirroring the shape `scienceChatBridge.ts` already has
 *    tests for.
 * 2. THE GUARD: `notifyScienceMemoryChanged` must be called from exactly
 *    one place in the whole source tree — `core/scienceMemory.ts`, right
 *    after its own real mutation — never speculatively from a screen or any
 *    other module. A source scan, not a convention anyone has to remember,
 *    the same posture `earthquakeNoNetworkBoundary.test.ts` already takes
 *    toward its own boundary.
 */

describe('subscribeScienceMemory / notifyScienceMemoryChanged', () => {
  it('delivers a notification to a subscribed listener', () => {
    let calls = 0;
    const unsubscribe = subscribeScienceMemory(() => { calls += 1; });
    notifyScienceMemoryChanged();
    expect(calls).toBe(1);
    unsubscribe();
  });

  it('stops delivering once unsubscribed', () => {
    let calls = 0;
    const unsubscribe = subscribeScienceMemory(() => { calls += 1; });
    unsubscribe();
    notifyScienceMemoryChanged();
    expect(calls).toBe(0);
  });

  it('delivers to every subscribed listener, independently', () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = subscribeScienceMemory(a);
    const unsubB = subscribeScienceMemory(b);
    notifyScienceMemoryChanged();
    unsubA();
    notifyScienceMemoryChanged();
    unsubB();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it('notifying with no subscribers does not throw', () => {
    expect(() => notifyScienceMemoryChanged()).not.toThrow();
  });

  it('tolerates a listener that unsubscribes itself mid-notification (iterates a snapshot, not the live Set)', () => {
    let otherCalls = 0;
    const unsubSelf = subscribeScienceMemory(() => unsubSelf());
    subscribeScienceMemory(() => { otherCalls += 1; });
    expect(() => notifyScienceMemoryChanged()).not.toThrow();
    expect(otherCalls).toBe(1);
  });
});

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(HERE, '..');
const SANCTIONED_CALLER = join(SRC_DIR, 'core', 'scienceMemory.ts');
const DEFINITION_FILE = join(SRC_DIR, 'core', 'scienceMemoryEvents.ts');
const THIS_FILE = fileURLToPath(import.meta.url);

// A CALL — `notifyScienceMemoryChanged(` — never the function's own
// declaration (`function notifyScienceMemoryChanged(`), which only exists in
// DEFINITION_FILE and is explicitly excluded from this scan anyway.
const CALL_PATTERN = /\bnotifyScienceMemoryChanged\s*\(/;

function collectTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectTypeScriptFiles(path);
    return entry.isFile() && (path.endsWith('.ts') || path.endsWith('.tsx')) ? [path] : [];
  });
}

describe('notifyScienceMemoryChanged call-site boundary', () => {
  it('is called from exactly one place in the whole source tree: scienceMemory.ts, right after its own real mutation', () => {
    const files = collectTypeScriptFiles(SRC_DIR).filter(
      (file) => file !== SANCTIONED_CALLER && file !== DEFINITION_FILE && file !== THIS_FILE,
    );
    expect(files.length).toBeGreaterThan(100); // sanity: this really scanned the whole tree, not an empty directory

    const offenders = files.filter((file) => CALL_PATTERN.test(readFileSync(file, 'utf8')));
    expect(offenders.map((f) => relative(SRC_DIR, f).split(sep).join('/'))).toEqual([]);
  });

  it('scienceMemory.ts itself really does call it — the boundary protects a real, wired call, not an unused export', () => {
    const source = readFileSync(SANCTIONED_CALLER, 'utf8');
    const matches = source.match(new RegExp(CALL_PATTERN, 'g')) ?? [];
    // Once after saveExperiment's real write, once after deleteExperiment's real write.
    expect(matches.length).toBe(2);
  });
});
