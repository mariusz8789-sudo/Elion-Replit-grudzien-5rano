/**
 * PUBLIC-SURFACE LEAK SCANNER (D-168) — the mechanical half of the public-demo
 * security gate documented in `docs/genesis1/PUBLIC-DEMO-SECURITY.md`.
 *
 * It answers one question, the same way every time: does a string that a public
 * visitor can see contain something that only the operator should see? Three
 * classes count as a leak:
 *
 *   SECRET        — material shaped like a real credential (AWS key id, GitHub
 *                   token, private-key PEM header, Anthropic/OpenAI key, JWT, …).
 *   INTERNAL_PATH — an absolute filesystem path of the host, or a developer's
 *                   home directory (`/home/<user>/…`, `/Users/<user>/…`,
 *                   `C:\Users\…`). A path names the deployment's layout and, for
 *                   a committed artefact, the author's own machine and username.
 *   STACK_TRACE   — a V8 or Python frame. A frame carries both a path and the
 *                   internal call structure, and it is never an answer a visitor
 *                   needs.
 *   INTERNAL_HOST — a private service address (`*.railway.internal`, `*.internal`).
 *
 * Two profiles, because the two surfaces tolerate different things:
 *
 *   'response' — an HTTP body or anything rendered to a visitor. STRICT: any
 *                absolute system path is a finding. URLs are stripped first, so
 *                a public allowlist like `https://www.ebi.ac.uk/chembl/api/data/
 *                molecule/<ID>.json` is not mistaken for a filesystem path.
 *   'artifact' — a file committed to the repository that ships publicly (docs,
 *                evidence artefacts, the built frontend). Only home/user paths,
 *                secrets, stack traces and internal hosts count: `/usr/bin/python3`
 *                written in a document as an example is documentation, not a leak.
 *
 * NO FINDING EVER ECHOES THE MATCHED VALUE. A gate that prints the secret it
 * found puts the secret in CI logs. Findings carry the pattern id, the line
 * number and the matched length — enough to find it, never enough to use it.
 *
 * Exceptions: `security/public-surface-exceptions.json`. Each entry is a
 * decision with a reason and a decision id, not a silencer — see `loadExceptions`.
 */

/** Credential shapes. Deliberately specific: a gate that fires on the word "token" is a gate nobody runs. */
export const SECRET_PATTERNS = Object.freeze([
  { id: 'AWS_ACCESS_KEY_ID', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: 'PRIVATE_KEY_PEM', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { id: 'GITHUB_TOKEN', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/ },
  { id: 'GITHUB_PAT', re: /\bgithub_pat_[A-Za-z0-9_]{30,}\b/ },
  { id: 'GITLAB_TOKEN', re: /\bglpat-[A-Za-z0-9_-]{20,}\b/ },
  { id: 'SLACK_TOKEN', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { id: 'GOOGLE_API_KEY', re: /\bAIza[0-9A-Za-z_-]{30,}\b/ },
  { id: 'ANTHROPIC_API_KEY', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { id: 'OPENAI_API_KEY', re: /\bsk-(?:proj-)?[A-Za-z0-9]{32,}\b/ },
  { id: 'GOOGLE_OAUTH_TOKEN', re: /\bya29\.[A-Za-z0-9_-]{20,}/ },
  { id: 'SENDGRID_KEY', re: /\bSG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/ },
  { id: 'JWT', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\./ },
  { id: 'BEARER_LITERAL', re: /\b[Bb]earer\s+[A-Za-z0-9_-]{24,}\b/ },
  { id: 'URL_EMBEDDED_CREDENTIALS', re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]{4,}@/ },
]);

/** A developer's or container's home directory. The most common committed leak, and the one that names a person. */
export const HOME_PATH_PATTERNS = Object.freeze([
  { id: 'UNIX_HOME_PATH', re: /\/(?:home|Users)\/[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9._-]/ },
  { id: 'WINDOWS_USER_PATH', re: /[A-Za-z]:\\+Users\\+[A-Za-z0-9][A-Za-z0-9._-]*/ },
  { id: 'ROOT_HOME_PATH', re: /\/root\/[A-Za-z0-9._-]/ },
]);

/** Any absolute host path. Only the 'response' profile uses this — see the module note. */
export const SYSTEM_PATH_PATTERNS = Object.freeze([
  { id: 'ABSOLUTE_SYSTEM_PATH', re: /\/(?:usr|opt|etc|var|bin|sbin|lib|srv|mnt|proc|app|data|tmp|private)\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*/ },
  { id: 'FILE_URL', re: /\bfile:\/\/\/?[A-Za-z0-9._/-]/ },
]);

export const STACK_TRACE_PATTERNS = Object.freeze([
  { id: 'V8_STACK_FRAME', re: /(?:^|\\n|\n)\s*at (?:[A-Za-z0-9_$.<>[\]]+ )?\(?(?:\/|[A-Za-z]:\\|file:|node:|async )/ },
  { id: 'PYTHON_TRACEBACK', re: /Traceback \(most recent call last\)|(?:^|\\n|\n)\s*File "[^"]+", line \d+/ },
]);

export const INTERNAL_HOST_PATTERNS = Object.freeze([
  { id: 'RAILWAY_INTERNAL_HOST', re: /\b[A-Za-z0-9][A-Za-z0-9-]*\.railway\.internal\b/ },
  { id: 'PRIVATE_INTERNAL_HOST', re: /\bhttps?:\/\/[A-Za-z0-9][A-Za-z0-9-]*\.(?:internal|local|lan)\b/ },
]);

const PROFILES = Object.freeze({
  response: Object.freeze([...SECRET_PATTERNS, ...HOME_PATH_PATTERNS, ...SYSTEM_PATH_PATTERNS, ...STACK_TRACE_PATTERNS, ...INTERNAL_HOST_PATTERNS]),
  artifact: Object.freeze([...SECRET_PATTERNS, ...HOME_PATH_PATTERNS, ...STACK_TRACE_PATTERNS, ...INTERNAL_HOST_PATTERNS]),
});

export const PROFILE_IDS = Object.freeze(Object.keys(PROFILES));

/** `https://host/a/b` must not read as the filesystem path `/a/b`. Replaced by a same-shaped token, never deleted. */
const stripUrls = (text) => text.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>)\]}]*/gi, '<url>');

/**
 * Scan one string. `profile` is 'response' (strict) or 'artifact'.
 * Returns { clean, findings: [{ patternId, line, length }] } — never the matched text.
 */
export function scanPublicText(text, { profile = 'response' } = {}) {
  const patterns = PROFILES[profile];
  if (!patterns) throw new Error(`UNKNOWN_SCAN_PROFILE: ${profile}`);
  const findings = [];
  const lines = String(text ?? '').split('\n');
  lines.forEach((rawLine, index) => {
    // URL stripping only applies to the PATH classes. A credential embedded in a URL, and an
    // internal host, are only visible before stripping — so those two classes read the raw line.
    const stripped = stripUrls(rawLine);
    for (const p of patterns) {
      const readsRawLine = SECRET_PATTERNS.includes(p) || INTERNAL_HOST_PATTERNS.includes(p);
      const subject = readsRawLine ? rawLine : stripped;
      const m = subject.match(p.re);
      if (m) findings.push(Object.freeze({ patternId: p.id, line: index + 1, length: m[0].length }));
    }
  });
  return Object.freeze({ clean: findings.length === 0, findings: Object.freeze(findings) });
}

/** Scan a JSON-serialisable value (an API response body) as its canonical JSON text. */
export function scanPublicValue(value, options = {}) {
  let text;
  try { text = JSON.stringify(value) ?? String(value); } catch { text = String(value); }
  // JSON.stringify escapes newlines as \n, so stack-frame patterns must see those too: the
  // STACK_TRACE patterns match both a literal newline and the two-character escape.
  return scanPublicText(text, options);
}

/**
 * An exception is a recorded decision, not a mute button. Every entry must carry:
 *   surface  — the route, file glob or build path it covers (exactly one surface per entry)
 *   patterns — the pattern ids it excuses (never "*")
 *   reason   — why this is not a leak, in a sentence a reviewer can check
 *   decision — the `docs/DECISIONS.md` id that recorded it
 * An entry missing any of these is a malformed exception and the gate fails on it,
 * so an undocumented exception cannot quietly widen the gate.
 */
export function validateExceptions(raw) {
  const problems = [];
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.exceptions)) {
    return { ok: false, problems: ['exceptions file must be { "exceptions": [...] }'], exceptions: [] };
  }
  const known = new Set(Object.values(PROFILES).flat().map((p) => p.id));
  raw.exceptions.forEach((entry, i) => {
    const at = `exceptions[${i}]`;
    if (typeof entry?.surface !== 'string' || !entry.surface.trim()) problems.push(`${at}.surface must be a non-empty string`);
    if (typeof entry?.reason !== 'string' || entry.reason.trim().length < 20) problems.push(`${at}.reason must explain why this is not a leak`);
    if (typeof entry?.decision !== 'string' || !/^D-\d+$/.test(entry.decision ?? '')) problems.push(`${at}.decision must be a docs/DECISIONS.md id like "D-168"`);
    if (!Array.isArray(entry?.patterns) || entry.patterns.length === 0) problems.push(`${at}.patterns must list at least one pattern id`);
    else for (const id of entry.patterns) {
      if (id === '*') problems.push(`${at}.patterns must not use "*" — name the pattern ids`);
      else if (!known.has(id)) problems.push(`${at}.patterns names an unknown pattern id: ${id}`);
    }
  });
  return { ok: problems.length === 0, problems, exceptions: raw.exceptions };
}

/** True when this surface+pattern pair was excused by a recorded exception. */
export function isExcepted(exceptions, surface, patternId) {
  return exceptions.some((e) => e.surface === surface && e.patterns.includes(patternId));
}
