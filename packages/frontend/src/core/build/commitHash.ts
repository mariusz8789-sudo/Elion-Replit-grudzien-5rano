/**
 * CODE COMMIT HASH — identifies which build of Genesis produced a given
 * experiment result, alongside modelVersion and seed. Injected once at build
 * time from the real repository (see vite.config.ts's `define`), not typed
 * in here. If the build environment could not read a real git HEAD (no
 * `.git`, shallow clone, packaged tarball), the injected value is an honest
 * `NOT_AVAILABLE: <reason>` string — never a fabricated hash.
 */
declare const __GENESIS_COMMIT_HASH__: string;

export function codeCommitHash(): string {
  return typeof __GENESIS_COMMIT_HASH__ === 'string' ? __GENESIS_COMMIT_HASH__ : 'NOT_AVAILABLE: build did not inject a commit hash';
}
