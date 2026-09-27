// A stable, coarse per-browser fingerprint used only for the server-side duplicate-account
// heuristic (server/services/fraud.ts) - never used for tracking/ads. Built from properties
// that are stable across sessions on the same device/browser but vary across devices, hashed
// with the Web Crypto API so the raw values never leave the browser.
export async function getDeviceFingerprintHash(): Promise<string> {
  const parts = [
    navigator.userAgent,
    navigator.language,
    String(navigator.hardwareConcurrency ?? ""),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
  ].join("|");

  const data = new TextEncoder().encode(parts);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
