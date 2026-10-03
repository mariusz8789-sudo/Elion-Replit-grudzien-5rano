# Run 9 fresh set - access probe, 2026-10-03 00:22Z

Target, exactly as preregistered: Zenodo record 14794785 (doi 10.5281/zenodo.14794785),
the files `annotations.csv` and `ground_truth.tar.gz`. Nothing was downloaded.

| request | client | result |
|---|---|---|
| `https://zenodo.org/api/records/14794785` | curl | `CONNECT tunnel failed, response 403` |
| the same | curl -v | `CONNECT zenodo.org:443` answered `HTTP/1.1 403 Forbidden` by the egress proxy |
| `https://doi.org/10.5281/zenodo.14794785` | curl | `CONNECT tunnel failed, response 403` |
| `https://zenodo.org/api/records/14794785` | python requests | `ProxyError ... Tunnel connection failed: 403 Forbidden` |
| `https://zenodo.org/records/14794785/files/annotations.csv?download=1` | python requests | the same |
| `https://zenodo.org/api/records/14794785` | wget | exit 4 |

The proxy status endpoint records every one of these as
`connect_rejected: gateway answered 403 to CONNECT (policy denial or upstream failure)`
for `zenodo.org:443` and `doi.org:443`.

**Diagnosis: a domain allowlist restriction in the environment's egress policy.** DNS
works, because zenodo.org resolves to six addresses. The request never reached Zenodo,
so this is not a TLS error, an authentication error or a missing record. The proxy's
own guidance says a 403 on CONNECT is an organisation policy denial that must not be
retried or routed around. Using a mirror or any other copy is also excluded by the
preregistration's `noSubstituteSource` rule.

**What needs to be allowed:** `zenodo.org`. The record id is already known, so the DOI
resolver `doi.org` is not needed. Zenodo has served record files from `zenodo.org`
itself. Whether any download redirects to a second storage host cannot be checked until
the first host is open. The first download will check it, and the result will be
recorded in seal B.

The project currently runs on the built-in cloud environment, which has no network
settings. Allowing the host means adding a cloud environment with Custom network
access, as described at
https://code.claude.com/docs/en/cloud-environments#network-access. The change takes
effect only in sessions started after it.
