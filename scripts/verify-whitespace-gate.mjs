#!/usr/bin/env node
/**
 * Two-direction proof for the CI "Sprawdzenie białych znaków w zmianie" step.
 *
 * The gate runs `git diff --check <base> <head> -- . ':(exclude)*.md'`. This script builds a
 * throwaway repository and proves both directions of that exact filter:
 *
 *   1. a Markdown hard line-break (two trailing spaces) must PASS;
 *   2. trailing whitespace in a code file (.ts) must FAIL.
 *
 * It touches nothing in the working repository and performs no network access.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PATHSPEC = ['--', '.', ':(exclude)*.md'];

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function diffCheckExitCode(cwd, base, head) {
  try {
    git(cwd, 'diff', '--check', base, head, ...PATHSPEC);
    return 0;
  } catch (error) {
    return typeof error.status === 'number' ? error.status : 1;
  }
}

const repo = mkdtempSync(join(tmpdir(), 'genesis-whitespace-gate-'));
try {
  git(repo, 'init', '--quiet');
  git(repo, 'config', 'user.email', 'gate@example.invalid');
  git(repo, 'config', 'user.name', 'Whitespace Gate Proof');
  writeFileSync(join(repo, 'README.md'), '# base\n');
  writeFileSync(join(repo, 'f.ts'), 'export const a = 1;\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '--quiet', '-m', 'base');
  const base = git(repo, 'rev-parse', 'HEAD').trim();

  // Direction 1: Markdown hard line-break must pass.
  writeFileSync(join(repo, 'README.md'), '# base\n\nline one  \nline two\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '--quiet', '-m', 'markdown hard break');
  const markdownHead = git(repo, 'rev-parse', 'HEAD').trim();
  const markdownExit = diffCheckExitCode(repo, base, markdownHead);

  // Direction 2: trailing whitespace in a code file must fail.
  writeFileSync(join(repo, 'f.ts'), 'export const a = 1; \n');
  git(repo, 'add', '.');
  git(repo, 'commit', '--quiet', '-m', 'code trailing whitespace');
  const codeHead = git(repo, 'rev-parse', 'HEAD').trim();
  const codeExit = diffCheckExitCode(repo, markdownHead, codeHead);

  const results = [
    { direction: 'markdown hard line-break (README.md)', expected: 0, actual: markdownExit },
    { direction: 'trailing whitespace in code (f.ts)', expected: 2, actual: codeExit },
  ];
  for (const row of results) {
    console.log(
      `${row.actual === row.expected ? 'OK  ' : 'FAIL'} ${row.direction}: exit=${row.actual} (expected ${row.expected})`,
    );
  }
  if (results.some((row) => row.actual !== row.expected)) {
    console.error('Whitespace gate proof failed.');
    process.exit(1);
  }
  console.log('Whitespace gate proof passed in both directions.');
} finally {
  rmSync(repo, { recursive: true, force: true });
}
