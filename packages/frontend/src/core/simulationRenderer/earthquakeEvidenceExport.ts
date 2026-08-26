/**
 * EARTHQUAKE LOCAL EVIDENCE EXPORT.
 *
 * Serializes only the real command-center execution record. This module owns no
 * download transport, solver, renderer or external publishing behavior.
 */
import { canonicalJson } from '../events/hash';
import type { EarthquakeCommandCenterExecution } from './earthquakeCommandCenter';
import { EARTHQUAKE_CITYWORLD_MAPPING } from './earthquakeCoordinateMapping';

export const EARTHQUAKE_EVIDENCE_EXPORT_SCHEMA_VERSION = '1.0.0';

export type EarthquakeEvidenceExport = Readonly<Record<string, unknown>>;

/** Creates an auditable, deterministic snapshot of exactly what the UI received. */
export function buildEarthquakeEvidenceExport(execution: EarthquakeCommandCenterExecution): EarthquakeEvidenceExport {
  const shared = {
    exportSchemaVersion: EARTHQUAKE_EVIDENCE_EXPORT_SCHEMA_VERSION,
    exportKind: 'GENESIS_EARTHQUAKE_EXECUTION_EVIDENCE',
    labels: ['SCENARIO', 'SYNTHETIC', 'NON_OPERATIONAL'],
    envelope: {
      status: execution.envelope.status,
      blockCode: execution.envelope.blockCode,
      blockReason: execution.envelope.blockReason,
      hazardType: execution.envelope.hazardType,
      datasetStatus: execution.envelope.datasetStatus,
      notModeled: execution.envelope.notModeled,
      moduleDescriptor: execution.envelope.moduleDescriptor,
    },
  };

  if (execution.status === 'BLOCKED') {
    return Object.freeze({
      ...shared,
      commandCenterStatus: 'BLOCKED',
      blockCode: execution.blockCode,
      blockReason: execution.blockReason,
      overlay: null,
      mapping: null,
    });
  }

  return Object.freeze({
    ...shared,
    commandCenterStatus: 'READY',
    sourceArtifact: execution.scenario.artifact,
    hazardInput: execution.scenario.input,
    hazardRun: execution.scenario.run,
    evidence: execution.evidence,
    replay: execution.replay,
    projection: execution.projection,
    mapping: {
      mappingId: execution.mapping.mappingId,
      mappingSchemaVersion: execution.mapping.mappingSchemaVersion,
      mappingFingerprint: execution.mapping.mappingFingerprint,
      sourceCoordinateSystem: EARTHQUAKE_CITYWORLD_MAPPING.sourceCoordinateSystem,
      targetCoordinateSystem: EARTHQUAKE_CITYWORLD_MAPPING.targetCoordinateSystem,
      sites: execution.mapping.sites,
    },
    overlayGate: execution.overlayGate,
    overlay: execution.overlay === null ? null : {
      siteCount: execution.overlay.sites.length,
      datasetStatus: execution.overlay.datasetStatus,
    },
  });
}

/** Uses the existing canonical serializer so equivalent records always export byte-identically. */
export function serializeEarthquakeEvidenceExport(execution: EarthquakeCommandCenterExecution): string {
  return `${canonicalJson(buildEarthquakeEvidenceExport(execution))}\n`;
}

export function getEarthquakeEvidenceExportFilename(execution: EarthquakeCommandCenterExecution): string {
  const id = execution.status === 'READY'
    ? execution.scenario.run.hazardRunId
    : `${execution.blockCode.toLowerCase()}-blocked`;
  return `genesis-earthquake-evidence-${id}.json`;
}
