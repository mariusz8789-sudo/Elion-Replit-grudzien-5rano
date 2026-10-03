# Genesis CSRN key — owner commands (run on your own computer, never in the cloud or CI)

The production signing key does not exist yet. Until you create it, every certificate is honestly UNSIGNED ("fingerprints and replay"), and Genesis must not call its evidence "signed".
The scripts refuse to run in CI and refuse a private-key path inside the repository.

1. Create the key (once). The private key is written with mode 0600 outside the repository and is never printed:

       node scripts/csrn-keygen.mjs --private-out ~/genesis-csrn-private.jwk

2. Sign the committed evidence certificate:

       node scripts/csrn-sign.mjs --key ~/genesis-csrn-private.jwk

3. Commit only the public files (`docs/keys/genesis-csrn-signing-key.json`, `packages/frontend/public/.well-known/genesis-csrn-key.json`, the certificate). Back the private key up offline. Never put it in the repository, chat, Railway or a GitHub secret.

Rotation (new key, old signatures stay verifiable inside the old key's window):

       node scripts/csrn-keygen.mjs --rotate --private-out ~/genesis-csrn-private-2.jwk

A compromised key is not rotated: set its `status` to `REVOKED` in the public file (and in `previousKeys` if it was already retired). A REVOKED key verifies nothing.

What a valid signature means: the evidence was not altered after signing and the signer holds this key. It is not a qualified or legal electronic signature and not laboratory validation.
The validity window is checked against the certificate's claimed signing time, which is not itself signed; revocation, not the window, is the control against a stolen key.
Tests with disposable keys: `packages/frontend/src/__tests__/csrnScripts.test.ts`, `reviewerSignedEvidence.test.ts`.
