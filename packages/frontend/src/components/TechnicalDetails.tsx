import type { ReactNode } from 'react';
import { capabilityLabel, technicalDetailsLabel, type CapabilityKey } from '../core/capabilityNames';
import { HOME_ENGINES } from './home/HomeEngines';

/**
 * TECHNICAL DETAILS — the one collapsed place a customer screen keeps exact
 * engine identity (name, adapter, version). Closed by default and marked
 * `data-technical-details`, so the customer-text guard
 * (`customerFacingEngineNames.test.tsx`) knows engine names are allowed here.
 * Never nest one inside another: the guard strips each section up to its first
 * closing tag.
 */

export interface TechnicalRow {
  readonly label: string;
  readonly value: ReactNode;
}

/** The engines behind each capability, read from the one engine registry the Start screen uses. */
export function engineRowsFor(capabilities: readonly CapabilityKey[]): TechnicalRow[] {
  return capabilities.map((capability) => ({
    label: capabilityLabel(capability),
    value: HOME_ENGINES.filter((e) => e.capability === capability && e.toolId !== null).map((e) => e.name).join(', ') || '—',
  }));
}

export function TechnicalDetails({ rows, testId, children }: { readonly rows: readonly TechnicalRow[]; readonly testId?: string; readonly children?: ReactNode }): JSX.Element {
  return (
    <details className="tech-details" data-technical-details data-testid={testId}>
      <summary>{technicalDetailsLabel()}</summary>
      {rows.length > 0 && (
        <dl>
          {rows.map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}
        </dl>
      )}
      {children}
    </details>
  );
}
