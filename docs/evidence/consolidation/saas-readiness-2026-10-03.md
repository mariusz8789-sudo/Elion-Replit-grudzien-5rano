# SaaS / pilot readiness audit — 2026-10-03

Labels: PILOT_READY (a supervised pilot with a named customer can run today) / SAAS_PARTIAL (works, but a self-serve multi-customer service would hit the gap) / ENTERPRISE_BLOCKED (an enterprise buyer would stop here).
"Checked" means read in code or exercised by a test in this audit; "not checked" is stated, never assumed. Nothing here is deployed and no number is invented.

| AREA | LABEL | CHECKED | GAP |
|---|---|---|---|
| Accounts and sessions | PILOT_READY | scrypt password hashes with per-user salt (auth.mjs); session tokens stored hashed (store.mjs, R-001); auth rate limiter | No MFA, no password reset flow checked, no SSO/SAML/OIDC (none found in the backend) → ENTERPRISE_BLOCKED for SSO |
| Project-level access (owner / editor / viewer) | PILOT_READY | role checks on research-run routes, access levels and an access audit (access.mjs); new artifact route: 401 without a token, no read for another account, no server path in the response (researchRunArtifacts.test.mjs) | Row-level isolation was not re-audited route by route; one SQLite file serves all tenants, so there is no physical tenant separation → SAAS_PARTIAL |
| Evidence integrity | PILOT_READY | hash-chained ResearchRun state, fail-closed on a broken chain, content-addressed artifacts verified on read, replay MATCH, CSRN tamper tests | Signing key not generated (owner command in docs/keys/OWNER-CSRN-KEY-COMMANDS.md): certificates are UNSIGNED, wording stays "fingerprints and replay" |
| Compute execution | PILOT_READY | durable lease queue, dead-letter, cancel, restart, real engines in CI (RDKit, PySCF, Vina, OpenMM, ADMET) | Single node. Multi-replica queue and shared object storage are BLOCKED_EXTERNAL; the admission function refuses it |
| Licence control | PILOT_READY | ADMET and retrosynthesis default to TECHNICAL_VALIDATION; COMMERCIAL_PRODUCT is BLOCKED_BY_LICENSE at execution (tested) | Licence review of Vina/Meeko and OpenMM not confirmed; retrosynthesis engine not installed anywhere in CI |
| Persistence and backup | SAAS_PARTIAL | database durability is classified at start and in /api/health (dbDurability.mjs); persistent volume required for accounts | No automated backup, restore drill or retention policy found; artifact files live next to the database |
| Request protection | PILOT_READY | request size limits, per-IP rate limiters, security headers, path-traversal guard, `npm audit --omit=dev`: 0 vulnerabilities, secret scan of tracked files: no key material | No WAF, no per-tenant quotas |
| Observability | SAAS_PARTIAL | structured logs, /api/health, /api/genesis/self | No alerting, tracing or SLO definition found |
| Billing, plans, usage metering | ENTERPRISE_BLOCKED | none exists in the code; pricing source of truth is granty/monetyzacja-source-of-truth-2026-09-29.md | Nothing to charge with yet |
| Data export and deletion | SAAS_PARTIAL | evidence and replay are exportable by design | No account-level export or deletion workflow checked (GDPR) |
| Audit trail for customers | SAAS_PARTIAL | access audit and the research chain are append-only | No customer-facing audit export |

Overall: PILOT_READY for one supervised customer on one node with the owner as operator. SAAS_PARTIAL for self-serve use. ENTERPRISE_BLOCKED on SSO, billing, backups with a restore drill, and multi-replica infrastructure.
Owner actions that unblock a pilot: choose the pilot customer and persistent volume, decide on backup, generate the CSRN key on his own machine.
