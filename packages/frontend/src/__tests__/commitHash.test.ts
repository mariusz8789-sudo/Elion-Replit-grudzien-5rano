/// <reference types="node" />
import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { codeCommitHash } from '../core/build/commitHash';

/**
 * Proves the injected commit hash is the REAL current git HEAD of this repo
 * (read independently here via execSync), not a hand-typed placeholder.
 */
describe('codeCommitHash — real git HEAD, not a fabricated value', () => {
  it('matches the actual repository HEAD', () => {
    const realHead = execSync('git rev-parse HEAD').toString().trim();
    expect(codeCommitHash()).toBe(realHead);
  });

  it('is a 40-character hex string (a real SHA-1 git commit id)', () => {
    expect(codeCommitHash()).toMatch(/^[0-9a-f]{40}$/);
  });
});
