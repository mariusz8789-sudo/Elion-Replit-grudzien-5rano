# Atom-Bohr G3 blocker

**Status: `BLOCKED / REFERENCE_UNPINNED`**

Until an approved token-free A4 artifact exists, the G3 workflow job is intentionally **manual-only** (`workflow_dispatch`). The normal Genesis quality gate does not claim G3 success; the fetch script still fails closed if the dynamic NIST page contains an embedded web token.

The dedicated G3 job proved that the network path and the A1–A4 URLs are reachable from GitHub Actions. A1, A2, and A3 were downloaded and hash-verified in run `33120357769` for commit `cd0dd11`.

G3 cannot be closed because the official NIST terms page selected for A4 returns an HTML snapshot containing an embedded Mapbox access token in page source. The payload is therefore unsafe to commit to the repository or retain as a distributable CI fixture. The captured CI artifact was deleted after detection, and the attempted local commit was never accepted by GitHub Push Protection.

| Gate | Result | Evidence |
| --- | --- | --- |
| A1 CODATA complete listing | Downloaded and SHA-256 verified in CI | `77fb90e66c40db3e6eb16630bc9c88e4c7c8beddbe5e71be406f2f26e3f67e67` |
| A2 ASD H I vacuum query | Downloaded and SHA-256 verified in CI | `7984eb55f092c8ae168a5e7efa8c8ce02849808ea2ec87b5988183af58484557` |
| A3 ASD H I energy levels | Downloaded and SHA-256 verified in CI | `796e2c5f41f1ab6a9f771b63e46250ae7d010625514915c3c0313a6c34328d50` |
| A4 official NIST terms | **Unsafe for repository pinning** | Raw HTML contains detected Mapbox token; not published |
| Complete G3 | **BLOCKED** | A4 cannot be pinned safely |

The official A4 URL remains recorded in the Option D specification and CI script for auditability, but no A4 raw payload or derived token-bearing HTML is stored in this repository. No alternative licensing source is substituted, and no scientific value is copied from memory.

Option D remains `NOT AUTHORIZED`. Do not implement `expectedValues[]`, `transitionWavelengthNm`, or Scientific Core migration until an official, safe, versionable A4 terms artifact can be pinned with raw bytes, SHA-256, and confirmed terms.

The next valid action is to obtain a clean official NIST terms artifact through an approved source or an explicitly authorized safe retrieval path. Replay must continue to use committed raw fixtures only; it must never refetch the network.
