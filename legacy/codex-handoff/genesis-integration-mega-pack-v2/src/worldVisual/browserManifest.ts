export interface BrowserEvidenceEntry {
  id: string;
  url: string;
  route: string;
  screenshotPath: string;
  capturedAt: string;
  browser: string;
  realCanvasVisible: boolean;
  consoleFatalErrors: string[];
  metadata: Record<string, string | number | boolean | null>;
}

export interface BrowserEvidenceManifest {
  runId: string;
  entries: BrowserEvidenceEntry[];
}

export function validateBrowserEvidence(manifest: BrowserEvidenceManifest): string[] {
  const issues: string[] = [];
  for (const e of manifest.entries) {
    if (!e.realCanvasVisible) issues.push(`${e.id}: no real visible canvas/render proof`);
    if (e.consoleFatalErrors.length > 0) issues.push(`${e.id}: fatal console errors present`);
    if (!e.screenshotPath.trim()) issues.push(`${e.id}: missing screenshot path`);
    if (!e.route.trim()) issues.push(`${e.id}: missing route`);
  }
  return issues;
}
