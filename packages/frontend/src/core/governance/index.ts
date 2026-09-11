/**
 * GENESIS SOVEREIGN FOUNDATION.
 *
 * A bounded, UI-less, storage-less foundation for role-, approval- and
 * audit-governed operation, meant to be integrated by C3. Read
 * `capabilities.ts` first: its header states what already existed and is
 * deliberately not rebuilt here, and what was genuinely missing.
 *
 * The one property to preserve through any future change: this layer can only
 * NARROW what the server already permitted, never widen it. `decision.ts`
 * achieves that by taking the server's verdict as an input rather than
 * re-deriving it, and `governance.test.ts` checks it exhaustively.
 */
export * from './capabilities';
export * from './decision';
export * from './approval';
export * from './audit';
