/** Resolve one configured Python executable consistently across scientific adapters. */
export function resolvePythonExecutable(...specificEnvironmentVariables) {
  for (const name of [...specificEnvironmentVariables, 'GENESIS_PYTHON']) {
    const configured = process.env[name];
    if (typeof configured === 'string' && configured.trim().length > 0) return configured.trim();
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}
