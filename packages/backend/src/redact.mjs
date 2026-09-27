/**
 * Absolute-filesystem-path redaction for strings that originate from a live
 * subprocess/environment (adapter `detect()`/`referenceCase()` error text,
 * a configured interpreter path, a Python traceback). The single canonical
 * implementation — any module that returns such a string in an HTTP
 * response or a persisted record reuses this rather than rolling its own.
 *
 * Never applied to a module's own static, repo-relative constants (those
 * cannot contain a machine-specific path by construction).
 */
const UNIX_PATH_RE = /\/(?:[^\s"'<>]+\/)+[^\s"'<>]*/g;
const WIN_PATH_RE = /[A-Za-z]:\\(?:[^\s"'<>\\]+\\)*[^\s"'<>\\]*/g;

export function redact(value) {
  if (typeof value !== 'string') return value;
  return value.replace(UNIX_PATH_RE, '<path-redacted>').replace(WIN_PATH_RE, '<path-redacted>');
}

export function redactDeep(value) {
  if (typeof value === 'string') return redact(value);
  if (Array.isArray(value)) return value.map(redactDeep);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = redactDeep(v);
    return out;
  }
  return value;
}
