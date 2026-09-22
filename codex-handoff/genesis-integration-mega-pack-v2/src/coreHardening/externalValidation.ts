/** ADAPTER/VALIDATOR UTILITY (fix area 6). Records external validation that already
 * happened; never generates or claims validation on its own. */
export type ValidationStatus = "NOT_STARTED" | "IN_REVIEW" | "PASS" | "NEEDS_FIX" | "FAIL";

export interface ExternalValidationRecord {
  id: string;
  domain: string;
  artifactRef: string;
  validator: string;
  validatorType: "DOMAIN_EXPERT" | "REFERENCE_BENCHMARK" | "HARDWARE_TEST" | "REGULATORY_REVIEW";
  status: ValidationStatus;
  evidenceRefs: string[];
  notes: string[];
}

export class ExternalValidationRegistry {
  private readonly records = new Map<string, ExternalValidationRecord>();

  upsert(record: ExternalValidationRecord): void {
    this.records.set(record.id, structuredClone(record));
  }

  list(domain?: string): ExternalValidationRecord[] {
    return [...this.records.values()]
      .filter((x) => !domain || x.domain === domain)
      .map((x) => structuredClone(x));
  }
}
