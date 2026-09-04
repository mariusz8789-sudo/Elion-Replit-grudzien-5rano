# Overnight Sprint Audit Notes

## 26 August 2026 — direct browser route check

Direct navigation to `http://127.0.0.1:5000/#/city3d` did not retain the local route in the browser session; a subsequent view reported `about:blank`. No visual, UI, or behavioral conclusion is drawn from this failed browser-session observation. The established tracked CDP Earthquake runtime proof remains the authoritative runtime evidence until a local browser route can be re-established or the managed runtime is restarted.

### Follow-up evidence

The tracked CDP proof then completed successfully against `http://127.0.0.1:5000`. It verified the active read-only overlay, `MATCH` replay, complete evidence, local export, persisted history, clear behavior, invalid-input `BLOCKED` outcome, polite atomic status announcements, no console warnings/errors, and exactly one `.city-3d-canvas`. The direct browser-session issue therefore remains a browser-session observation only, not a demonstrated City3D runtime regression.
