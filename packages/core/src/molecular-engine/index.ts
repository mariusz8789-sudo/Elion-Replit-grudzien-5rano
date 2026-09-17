// Collision-free barrel (both modules export shared helpers).
export * as searchCore from './GenesisMolecularSearchCore.js';
export * as sandbox from './GenesisPhysicoChemicalSandbox.js';
export type { Genome, SearchParams, SearchResult, HistoryEntry, Clock } from './GenesisMolecularSearchCore.js';
export type { MolecularGraph, CandidateAssessment, Descriptors, CandidateLabel, ElementId } from './GenesisPhysicoChemicalSandbox.js';
