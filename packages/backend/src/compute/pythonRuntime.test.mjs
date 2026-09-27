import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { resolvePythonExecutable } from './pythonRuntime.mjs';

const saved = { specific: process.env.GENESIS_TEST_PYTHON, general: process.env.GENESIS_PYTHON };

afterEach(() => {
  if (saved.specific === undefined) delete process.env.GENESIS_TEST_PYTHON; else process.env.GENESIS_TEST_PYTHON = saved.specific;
  if (saved.general === undefined) delete process.env.GENESIS_PYTHON; else process.env.GENESIS_PYTHON = saved.general;
});

test('specific configured interpreter wins and is trimmed', () => {
  process.env.GENESIS_TEST_PYTHON = '  C:\\Python\\python.exe  ';
  process.env.GENESIS_PYTHON = 'fallback-python';
  assert.equal(resolvePythonExecutable('GENESIS_TEST_PYTHON'), 'C:\\Python\\python.exe');
});

test('blank configuration never becomes an empty executable', () => {
  process.env.GENESIS_TEST_PYTHON = '   ';
  process.env.GENESIS_PYTHON = '';
  assert.equal(resolvePythonExecutable('GENESIS_TEST_PYTHON'), process.platform === 'win32' ? 'python' : 'python3');
});
