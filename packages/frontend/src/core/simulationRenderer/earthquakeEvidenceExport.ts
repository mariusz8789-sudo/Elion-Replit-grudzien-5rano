/**
 * EARTHQUAKE LOCAL EVIDENCE EXPORT.
 *
 * Serializes only the real command-center execution record. This module owns no
 * download transport, solver, renderer or external publishing behavior.
 */
import { canonicalJson } from '../events/hash';
import type {
  EarthquakeCommandCenterBlockedExecution,
  EarthquakeCommandCenterExecution,
  EarthquakeCommandCenterReadyExecution,
} from './earthquakeCommandCenter';
import {
  EARTHQUAKE_CITYWORLD_MAPPING,
  type EarthquakeCityOverlayProjection,
} from './earthquakeCoordinateMapping';

export const EARTHQUAKE_EVIDENCE_EXPORT_SCHEMA_VERSION = '1.0.0' as const;
export const EARTHQUAKE_EVIDENCE_EXPORT_KIND = 'GENESIS_EARTHQUAKE_EXECUTION_EVIDENCE' as const;
export const EARTHQUAKE_EVIDENCE_EXPORT_LABELS = Object.freeze([
  'SCENARIO',
  'SYNTHETIC',
  'NON_OPERATIONAL',
] as const);

interface EarthquakeEvidenceExportCommon {
  readonly exportSchemaVersion: typeof EARTHQUAKE_EVIDENCE_EXPORT_SCHEMA_VERSION;
  readonly exportKind: typeof EARTHQUAKE_EVIDENCE_EXPORT_KIND;
  readonly labels: typeof EARTHQUAKE_EVIDENCE_EXPORT_LABELS;
  readonly envelope: Pick<
    EarthquakeCommandCenterExecution['envelope'],
    | 'status'
    | 'blockCode'
    | 'blockReason'
    | 'hazardType'
    | 'datasetStatus'
    | 'notModeled'
    | 'moduleDescriptor'
  >;
}

export interface EarthquakeReadyEvidenceExport extends EarthquakeEvidenceExportCommon {
  readonly commandCenterStatus: 'READY';
  readonly sourceArtifact: EarthquakeCommandCenterReadyExecution['scenario']['artifact'];
  readonly hazardInput: EarthquakeCommandCenterReadyExecution['scenario']['input'];
  readonly hazardRun: EarthquakeCommandCenterReadyExecution['scenario']['run'];
  readonly evidence: EarthquakeCommandCenterReadyExecution['evidence'];
  readonly replay: EarthquakeCommandCenterReadyExecution['replay'];
  readonly projection: EarthquakeCommandCenterReadyExecution['projection'];
  readonly mapping: Readonly<{
    mappingId: string;
    mappingSchemaVersion: string;
    mappingFingerprint: string;
    sourceCoordinateSystem: string;
    targetCoordinateSystem: string;
    sites: EarthquakeCityOverlayProjection['sites'];
  }>;
  readonly overlayGate: EarthquakeCommandCenterReadyExecution['overlayGate'];
  readonly overlay: Readonly<{ siteCount: number; datasetStatus: 'SCENARIO' }> | null;
}

export interface EarthquakeBlockedEvidenceExport extends EarthquakeEvidenceExportCommon {
  readonly commandCenterStatus: 'BLOCKED';
  readonly blockCode: EarthquakeCommandCenterBlockedExecution['blockCode'];
  readonly blockReason: string;
  readonly overlay: null;
  readonly mapping: null;
}

export type EarthquakeEvidenceExport = EarthquakeReadyEvidenceExport | EarthquakeBlockedEvidenceExport;

function buildEarthquakeEvidenceExportCommon(
  execution: EarthquakeCommandCenterExecution,
): EarthquakeEvidenceExportCommon {
  return Object.freeze({
    exportSchemaVersion: EARTHQUAKE_EVIDENCE_EXPORT_SCHEMA_VERSION,
    exportKind: EARTHQUAKE_EVIDENCE_EXPORT_KIND,
    labels: EARTHQUAKE_EVIDENCE_EXPORT_LABELS,
    envelope: {
      status: execution.envelope.status,
      blockCode: execution.envelope.blockCode,
      blockReason: execution.envelope.blockReason,
      hazardType: execution.envelope.hazardType,
      datasetStatus: execution.envelope.datasetStatus,
      notModeled: execution.envelope.notModeled,
      moduleDescriptor: execution.envelope.moduleDescriptor,
    },
  });
}

/** Creates an auditable, deterministic snapshot of exactly what the UI received. */
export function buildEarthquakeEvidenceExport(
  execution: EarthquakeCommandCenterExecution,
): EarthquakeEvidenceExport {
  const shared = buildEarthquakeEvidenceExportCommon(execution);

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
    overlay:
      execution.overlay === null
        ? null
        : {
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
  const id =
    execution.status === 'READY'
      ? execution.scenario.run.hazardRunId
      : `${execution.blockCode.toLowerCase()}-blocked`;
  return `genesis-earthquake-evidence-${id}.json`;
}
