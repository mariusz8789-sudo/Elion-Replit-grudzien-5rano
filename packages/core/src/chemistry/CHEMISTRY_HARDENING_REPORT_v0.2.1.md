# Genesis Chemistry v0.2.1 — Hardening Report

## Purpose

This overlay hardens Qwen's Chemistry v0.2 draft while deliberately preserving the existing v0.1 raw data tables. It is designed to minimize Claude Code work and avoid large-scale data rewrites.

## Fixes included

- authoritative reaction balance implementation only;
- robust formula parser for ordinary ions, explicit `^2-`/`^3+`, grouped charges, nested `()`/`[]`, and hydrates;
- reaction charge derivation from formula when participant charge is omitted;
- compatibility normalization for legacy reaction overrides that were accidentally pre-multiplied by the stoichiometric coefficient;
- backward-compatible chemistry types so old raw records still compile;
- deterministic normalization of compounds into phase/medium/structureKind/nullable SMILES;
- Tc-99 / Tc-99m separation;
- partial phase-property seed with explicit `PREDICTED_DATA` for unknown/superheavy values;
- complete dataset hash manifest;
- audit of the normalized merged dataset, including extra reactions;
- report-only live-source helper;
- conservative verification state: `SOURCE_DECLARED_NOT_LIVE_VERIFIED`.

## Scientific status

This package is NOT a claim that every numerical datum is live verified. It is a compile/test hardening layer. Live NIST/PubChem verification remains a separate, explicit step.

## Integration rule

The existing Genesis Knowledge Engine, RAG, Evidence Ledger, WorldGraph and command path remain canonical. This package only supplies chemistry data access/normalization.
