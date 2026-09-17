/* Proprietary / All Rights Reserved - Genesis OS */
import { stableStringify, sha256hex } from '../../expansionHash.js';
import type { SandboxContext, SpeculativeSolverPlugin, SpeculativeSolverState, SandboxRunResult, SpeculativeLedgerEntry, WarningFlag } from './speculativeTypes.js';
/** Gate-keeping registry: speculative solvers run ONLY when allowUnphysicalSandbox is true; tag integrity enforced. */
export class SpeculativeSolverRegistry {
  private plugins = new Map<string, SpeculativeSolverPlugin<unknown>>();
  private ledger: SpeculativeLedgerEntry[] = [];
  register<P>(p: SpeculativeSolverPlugin<P>): void {
    if (p.tag === 'VERIFIED_PHYSICS') throw new Error('SPECULATIVE_REGISTRY_REJECTS_VERIFIED_TAG:' + p.id);
    this.plugins.set(p.id, p as SpeculativeSolverPlugin<unknown>);
  }
  run<P>(id: string, params: P, ctx: SandboxContext): SandboxRunResult<SpeculativeSolverState> {
    const plugin = this.plugins.get(id);
    if (!plugin) return { ok: false, error: 'UNKNOWN_SOLVER' };
    if (!ctx.allowUnphysicalSandbox) return { ok: false, error: 'SANDBOX_DISABLED' };
    let state = plugin.createInitialState(ctx, params);
    state = plugin.step(state, ctx, params);
    const warnings: readonly WarningFlag[] = plugin.warnings(state);
    const fingerprint = plugin.fingerprint(state);
    const prev = this.ledger.length ? this.ledger[this.ledger.length - 1].hash : 'GENESIS';
    const at = ctx.clock.now(); const index = this.ledger.length;
    this.ledger.push(Object.freeze({ index, solverId: id, fingerprint, warnings, at, prevHash: prev, hash: sha256hex(stableStringify({ index, solverId: id, fingerprint, warnings, at, prevHash: prev })) }));
    if (ctx.ecs) { const e = ctx.ecs.createEntity(); ctx.ecs.setComponent(e, 'speculativeState', { solverId: id, tag: plugin.tag, fingerprint, warnings }); }
    return { ok: true, state, warnings, fingerprint };
  }
  getLedger(): readonly SpeculativeLedgerEntry[] { return this.ledger; }
  verifyLedger(): { ok: boolean; errors: readonly string[] } {
    const errors: string[] = []; let prev = 'GENESIS';
    for (const e of this.ledger) { if (e.prevHash !== prev) errors.push('CHAIN_BREAK@' + e.index);
      if (e.hash !== sha256hex(stableStringify({ index: e.index, solverId: e.solverId, fingerprint: e.fingerprint, warnings: e.warnings, at: e.at, prevHash: e.prevHash }))) errors.push('HASH_MISMATCH@' + e.index); prev = e.hash; }
    return { ok: errors.length === 0, errors };
  }
}
