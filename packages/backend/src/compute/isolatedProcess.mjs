import { spawn } from 'node:child_process';
import { clearTimeout, setTimeout } from 'node:timers';

/** The line a ResearchRun child prints before its JSON answer (stdout may also carry engine noise). */
export const CHILD_RESULT_MARKER = 'GENESIS_CHILD_RESULT:';

/**
 * Runs one command in its own process group and enforces a REAL deadline: when the time is up or the caller's
 * AbortSignal fires, the whole group (the child and any engine process it started) receives SIGKILL, so work
 * stops instead of merely being ignored. The parent's event loop is never blocked while the child runs.
 * Resolves (never rejects) with { ok, code, stdout, stderr, killed: null | 'TIMEOUT' | 'ABORTED' | 'OUTPUT_LIMIT', pid }.
 */
export function runIsolatedProcess({ command, args = [], input = '', timeoutMs, signal, maxOutputBytes = 4_000_000, cwd, env, onSpawn } = {}) {
  return new Promise((resolve) => {
    if (signal?.aborted) { resolve({ ok: false, code: null, stdout: '', stderr: '', killed: 'ABORTED', pid: null }); return; }
    const child = spawn(command, args, { cwd, env, detached: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    onSpawn?.(child.pid);
    let stdout = '';
    let stderr = '';
    let killed = null;
    let bytes = 0;
    const kill = (reason) => {
      if (killed) return;
      killed = reason;
      try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch { /* already gone */ } }
    };
    const timer = Number.isFinite(timeoutMs) && timeoutMs > 0 ? setTimeout(() => kill('TIMEOUT'), timeoutMs) : null;
    const onAbort = () => kill('ABORTED');
    signal?.addEventListener('abort', onAbort, { once: true });
    const collect = (sink) => (chunk) => {
      bytes += chunk.length;
      if (bytes > maxOutputBytes) { kill('OUTPUT_LIMIT'); return; }
      if (sink === 'out') stdout += chunk; else stderr += chunk;
    };
    child.stdout.setEncoding('utf8').on('data', collect('out'));
    child.stderr.setEncoding('utf8').on('data', collect('err'));
    child.stdin.on('error', () => {});
    child.stdin.end(input);
    child.on('error', (error) => { kill('ABORTED'); stderr += String(error?.message ?? error); });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      // The group is killed too when the child ended on its own but left a descendant behind.
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* group already empty */ }
      resolve({ ok: !killed && code === 0, code, stdout, stderr, killed, pid: child.pid });
    });
  });
}
