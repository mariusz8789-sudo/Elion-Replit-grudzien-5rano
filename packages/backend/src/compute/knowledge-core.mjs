/* esbuild bundle of packages/core/src/knowledge/ingestion/serverEntry.ts; regenerate with npm run compute:bundle:knowledge, do not edit */

// packages/core/src/knowledge/sha256.ts
var K = new Uint32Array([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
var rotr = (x, n) => x >>> n | x << 32 - n;
function sha256Bytes(message) {
  const bitLen = message.length * 8;
  const padded = new Uint8Array(message.length + 9 + 63 >> 6 << 6);
  padded.set(message);
  padded[message.length] = 128;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLen / 4294967296), false);
  view.setUint32(padded.length - 4, bitLen >>> 0, false);
  const h = new Uint32Array([1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225]);
  const w = new Uint32Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(off + t * 4, false);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ w[t - 15] >>> 3;
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ w[t - 2] >>> 10;
      w[t] = w[t - 16] + s0 + w[t - 7] + s1 >>> 0;
    }
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = e & f ^ ~e & g;
      const t1 = hh + S1 + ch + K[t] + w[t] >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = a & b ^ a & c ^ b & c;
      const t2 = S0 + maj >>> 0;
      hh = g;
      g = f;
      f = e;
      e = d + t1 >>> 0;
      d = c;
      c = b;
      b = a;
      a = t1 + t2 >>> 0;
    }
    h[0] = h[0] + a >>> 0;
    h[1] = h[1] + b >>> 0;
    h[2] = h[2] + c >>> 0;
    h[3] = h[3] + d >>> 0;
    h[4] = h[4] + e >>> 0;
    h[5] = h[5] + f >>> 0;
    h[6] = h[6] + g >>> 0;
    h[7] = h[7] + hh >>> 0;
  }
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) ov.setUint32(i * 4, h[i], false);
  return out;
}
function sha256HexSync(text) {
  const bytes = sha256Bytes(new TextEncoder().encode(text));
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

// packages/core/src/knowledge/evidenceTypes.ts
var KNOWLEDGE_DISCLAIMER = "To jest pomoc edukacyjna, nie porada medyczna, prawna, finansowa ani in\u017Cynierska. Twierdzenia z film\xF3w i narracji traktujemy jako hipotezy do weryfikacji, nie jako fakty.";

// packages/core/src/knowledge/classifyClaim.ts
var canReachVerified = (sourceKind) => sourceKind !== "video";
function classifyClaim(i) {
  const conf = Math.min(1, Math.max(0, i.confidence));
  if (conf < 0.15) return "rejected";
  const hasIndependent = i.independentSourceIds.length >= 1;
  if (canReachVerified(i.sourceKind) && hasIndependent && conf >= 0.8 && i.claimType !== "hypothesis") return "verified";
  if (conf >= 0.5) return "candidate";
  return "unverified";
}
var statusLabelPl = (s) => s === "verified" ? "potwierdzone przez niezale\u017Cne \u017Ar\xF3d\u0142a" : s === "candidate" ? "wst\u0119pny kandydat \u2014 wymaga weryfikacji" : s === "unverified" ? "niezweryfikowane" : "odrzucone";

// packages/core/src/knowledge/EvidenceLedger.ts
var stableStringify = (v) => {
  if (v === null) return "null";
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  if (typeof v === "object") {
    const o = v;
    return "{" + Object.keys(o).sort().map((k) => JSON.stringify(k) + ":" + stableStringify(o[k])).join(",") + "}";
  }
  return JSON.stringify(v);
};
var sha256hex = (t) => sha256HexSync(t);
var EvidenceLedger = class {
  constructor(clock) {
    this.clock = clock;
  }
  entries = [];
  records = /* @__PURE__ */ new Map();
  byHash = /* @__PURE__ */ new Map();
  proposals = /* @__PURE__ */ new Map();
  activeIds = [];
  version = 1;
  contentHashOf(i) {
    return sha256hex(stableStringify({ sourceUrl: i.sourceUrl, claim: i.claim, claimType: i.claimType, sourceTimestamp: i.sourceTimestamp, provenance: i.provenance }));
  }
  buildRecord(i, contentHash) {
    const status = classifyClaim({ claimType: i.claimType, sourceKind: i.provenance.sourceKind, independentSourceIds: i.provenance.independentSourceIds, confidence: i.confidence });
    return { id: "EV-" + contentHash.slice(0, 12), sourceUrl: i.sourceUrl, sourceTimestamp: i.sourceTimestamp, claim: i.claim, claimType: i.claimType, confidence: i.confidence, status, retrievedAt: this.clock.now(), contentHash, provenance: i.provenance, disclaimer: KNOWLEDGE_DISCLAIMER };
  }
  append(kind, rec) {
    const prev = this.entries.length ? this.entries[this.entries.length - 1].hash : "GENESIS";
    const at = this.clock.now();
    const index = this.entries.length;
    this.entries.push(Object.freeze({ index, kind, recordId: rec.id, contentHash: rec.contentHash, prevHash: prev, hash: sha256hex(stableStringify({ index, kind, recordId: rec.id, contentHash: rec.contentHash, prevHash: prev, at })), at }));
  }
  addRecord(i) {
    const contentHash = this.contentHashOf(i);
    const existing = this.byHash.get(contentHash);
    if (existing) return { record: existing, deduped: true };
    const rec = this.buildRecord(i, contentHash);
    this.records.set(rec.id, rec);
    this.byHash.set(contentHash, rec);
    this.activeIds.push(rec.id);
    this.append("ADD", rec);
    return { record: rec, deduped: false };
  }
  /** Propose-only: creates a pending proposal; nothing enters the active base until publish(). */
  propose(i) {
    const contentHash = this.contentHashOf(i);
    const rec = this.byHash.get(contentHash) ?? this.buildRecord(i, contentHash);
    const proposalId = "PR-" + sha256hex(stableStringify({ contentHash, at: this.clock.now(), n: this.proposals.size })).slice(0, 12);
    this.proposals.set(proposalId, { proposalId, record: rec, status: "pending", approverId: null });
    this.append("PROPOSE", rec);
    return proposalId;
  }
  publish(proposalId, approverId) {
    const p = this.proposals.get(proposalId);
    if (!p || p.status !== "pending") return null;
    this.proposals.set(proposalId, { ...p, status: "approved", approverId });
    if (!this.byHash.has(p.record.contentHash)) {
      this.records.set(p.record.id, p.record);
      this.byHash.set(p.record.contentHash, p.record);
      this.activeIds.push(p.record.id);
    }
    this.append("PUBLISH", p.record);
    this.version += 1;
    return p.record;
  }
  rejectProposal(proposalId, approverId) {
    const p = this.proposals.get(proposalId);
    if (!p || p.status !== "pending") return false;
    this.proposals.set(proposalId, { ...p, status: "discarded", approverId });
    this.append("REJECT", p.record);
    return true;
  }
  getActive() {
    return this.activeIds.map((id) => this.records.get(id));
  }
  getVersion() {
    return this.version;
  }
  getProposals() {
    return [...this.proposals.values()];
  }
  getEntries() {
    return this.entries;
  }
  verifyLedger() {
    const errors = [];
    let prev = "GENESIS";
    for (const e of this.entries) {
      if (e.prevHash !== prev) errors.push("CHAIN_BREAK@" + e.index);
      if (e.hash !== sha256hex(stableStringify({ index: e.index, kind: e.kind, recordId: e.recordId, contentHash: e.contentHash, prevHash: e.prevHash, at: e.at }))) errors.push("HASH_MISMATCH@" + e.index);
      prev = e.hash;
    }
    return { ok: errors.length === 0, errors };
  }
};

// packages/core/src/knowledge/ProposeOnlyLearner.ts
var ProposeOnlyLearner = class {
  constructor(clock, ledger) {
    this.clock = clock;
    this.ledger = ledger;
  }
  runBatch(adapter) {
    const items = adapter.fetch(this.clock);
    const proposalIds = [];
    for (const it of items) {
      const input = { sourceUrl: it.sourceUrl, sourceTimestamp: it.sourceTimestamp, claim: it.claim, claimType: it.claimType, confidence: it.confidence, provenance: it.provenance };
      proposalIds.push(this.ledger.propose(input));
    }
    return proposalIds;
  }
};

// packages/core/src/knowledge/ingestion/netUtils.ts
var realSleeper = { sleep: (ms) => new Promise((res) => setTimeout(res, ms)) };
var HttpError = class extends Error {
  constructor(status) {
    super("HTTP_" + status);
    this.status = status;
  }
};
var isRetryable = (e) => e instanceof HttpError && (e.status === 429 || e.status >= 500);
var DEFAULT_RETRY = { attempts: 4, baseMs: 250, maxMs: 4e3 };
async function withRetry(fn, policy, sleeper, retryable = isRetryable) {
  let lastErr = null;
  for (let i = 0; i < policy.attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!retryable(e) || i === policy.attempts - 1) break;
      await sleeper.sleep(Math.min(policy.maxMs, policy.baseMs * Math.pow(2, i)));
    }
  }
  throw lastErr;
}
var TokenBucket = class {
  constructor(clock, perMin) {
    this.clock = clock;
    this.perMin = perMin;
    this.tokens = perMin;
    this.last = clock.now();
  }
  tokens;
  last;
  tryTake() {
    const now = this.clock.now();
    this.tokens = Math.min(this.perMin, this.tokens + (now - this.last) / 6e4 * this.perMin);
    this.last = now;
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }
};
var originOf = (url) => {
  const m = /^https?:\/\/([^/?#]+)/i.exec(url);
  return (m ? m[1] : "").toLowerCase().replace(/^www\./, "");
};
var pathOf = (url) => {
  const m = /^https?:\/\/[^/?#]+(\/[^?#]*)?(\?[^#]*)?/i.exec(url);
  return m ? (m[1] ?? "/") + (m[2] ?? "") : "/";
};
function parseRobots(body, uaToken) {
  const rules = [];
  let applies = false;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    if (key === "user-agent") applies = val === "*" || val.toLowerCase().includes(uaToken.toLowerCase());
    else if (applies && (key === "disallow" || key === "allow") && val) rules.push({ allow: key === "allow", path: val });
  }
  return { disallowed: (path) => {
    let best = null;
    for (const r of rules) if (path.startsWith(r.path) && (!best || r.path.length >= best.path.length)) best = r;
    return best ? !best.allow : false;
  } };
}
var stripHtml = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
var extractTitle = (html) => {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? stripHtml(m[1]).slice(0, 200) : "";
};

// packages/core/src/knowledge/ingestion/OmniIngestionController.ts
var OmniIngestionController = class _OmniIngestionController {
  constructor(clock, registry, adapters) {
    this.clock = clock;
    this.registry = registry;
    this.adapters = adapters;
  }
  static detectPlatform(url) {
    const o = originOf(url);
    if (/youtube\.com|youtu\.be/.test(o)) return "YOUTUBE";
    if (/facebook\.com/.test(o)) return "FACEBOOK";
    if (/(x|twitter)\.com/.test(o)) return "X";
    if (/t\.me|telegram\.(org|me)/.test(o)) return "TELEGRAM";
    return "WEB";
  }
  async ingest(urls) {
    const fetched = [];
    const skipped = [];
    for (const url of urls) {
      const platform = _OmniIngestionController.detectPlatform(url);
      const policy = this.registry.get(originOf(url));
      if (platform === "WEB" && policy && policy.legalStatus === "PENDING") {
        skipped.push({ url, reason: "LEGAL_GATE_PENDING" });
        continue;
      }
      const adapter = this.adapters[platform];
      if (!adapter) {
        skipped.push({ url, reason: "NO_ADAPTER" });
        continue;
      }
      const res = await adapter.ingest(url);
      if (!res.ok) {
        skipped.push({ url, reason: res.error ?? "UNKNOWN" });
        continue;
      }
      for (const it of res.items) fetched.push(it);
    }
    return { fetched, skipped, batchFingerprint: sha256hex(stableStringify({ urls, fetched })), at: this.clock.now() };
  }
};

// packages/core/src/knowledge/ingestion/SourcePolicyRegistry.ts
var DEFAULT_POLICIES = [
  { domain: "youtube.com", legalStatus: "PENDING", officialApiOnly: true, rateLimitPerMin: 10, notes: "Metadata wy\u0142\u0105cznie przez YouTube Data API z wstrzykiwanym kluczem; transkrypcje zablokowane do czasu weryfikacji prawnej." },
  { domain: "youtu.be", legalStatus: "PENDING", officialApiOnly: true, rateLimitPerMin: 10, notes: "Jak youtube.com." },
  { domain: "facebook.com", legalStatus: "PENDING", officialApiOnly: true, rateLimitPerMin: 5, notes: "Wy\u0142\u0105cznie oficjalny Graph API; brak automatyzacji przegl\u0105darki i obchodzenia zabezpiecze\u0144." },
  { domain: "x.com", legalStatus: "PENDING", officialApiOnly: true, rateLimitPerMin: 5, notes: "Wy\u0142\u0105cznie oficjalne X API v2." },
  { domain: "twitter.com", legalStatus: "PENDING", officialApiOnly: true, rateLimitPerMin: 5, notes: "Jak x.com." },
  { domain: "t.me", legalStatus: "PENDING", officialApiOnly: true, rateLimitPerMin: 5, notes: "Wy\u0142\u0105cznie oficjalny Bot API / r\u0119czne dostarczenie eksportu." },
  { domain: "example.org", legalStatus: "VERIFIED", officialApiOnly: false, rateLimitPerMin: 30, notes: "Domena testowa/demo." },
  { domain: "wikimedia.org", legalStatus: "VERIFIED", officialApiOnly: false, rateLimitPerMin: 30, notes: "Tre\u015Bci publiczne; preferowane oficjalne API." }
];
var SourcePolicyRegistry = class {
  map = /* @__PURE__ */ new Map();
  constructor(policies = DEFAULT_POLICIES) {
    for (const p of policies) this.map.set(p.domain, p);
  }
  register(p) {
    this.map.set(p.domain, p);
  }
  get(domain) {
    return this.map.get(domain) ?? this.map.get(domain.replace(/^www\./, ""));
  }
  isLegalCleared(domain) {
    const p = this.get(domain);
    return !!p && p.legalStatus === "VERIFIED";
  }
};

// packages/core/src/knowledge/ingestion/YouTubeOfficialApiAdapter.ts
var YouTubeOfficialApiAdapter = class _YouTubeOfficialApiAdapter {
  constructor(clock, transport, sleeper, keys) {
    this.clock = clock;
    this.transport = transport;
    this.sleeper = sleeper;
    this.keys = keys;
  }
  platform = "YOUTUBE";
  static videoId(url) {
    const m = /[?&]v=([\w-]{6,})/.exec(url) ?? /youtu\.be\/([\w-]{6,})/.exec(url);
    return m ? m[1] : null;
  }
  async ingest(url) {
    const key = this.keys.getKey();
    if (!key) return { ok: false, error: "REQUIRES_OFFICIAL_API", items: [], note: "Wstrzyknij klucz YouTube Data API przez KeyProvider; scraping niedost\u0119pny." };
    const id = _YouTubeOfficialApiAdapter.videoId(url);
    if (!id) return { ok: false, error: "PARSE", items: [] };
    let body;
    try {
      body = (await withRetry(() => this.transport.fetch("https://www.googleapis.com/youtube/v3/videos?part=snippet&id=" + encodeURIComponent(id) + "&key=" + encodeURIComponent(key)), DEFAULT_RETRY, this.sleeper)).body;
    } catch (e) {
      return { ok: false, error: e instanceof HttpError && e.status === 404 ? "PARSE" : "NETWORK", items: [] };
    }
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      return { ok: false, error: "PARSE", items: [] };
    }
    const sn = parsed.items?.[0]?.snippet;
    if (!sn?.title) return { ok: false, error: "PARSE", items: [] };
    const items = [{ sourceUrl: url, sourceTimestamp: sn.publishedAt ?? null, claim: sn.title, claimType: "reported_claim", confidence: 0.4, provenance: { sourceKind: "video", author: sn.channelTitle, retrievedBy: "youtube-official-api", independentSourceIds: [] } }];
    if (sn.description && sn.description.trim().length > 0) items.push({ sourceUrl: url, sourceTimestamp: sn.publishedAt ?? null, claim: sn.description.trim().slice(0, 300), claimType: "reported_claim", confidence: 0.35, provenance: { sourceKind: "video", author: sn.channelTitle, retrievedBy: "youtube-official-api", independentSourceIds: [] } });
    return { ok: true, items, note: "CAPTIONS_DISABLED_PENDING_LEGAL_REVIEW" };
  }
};

// packages/core/src/knowledge/ingestion/PublicWebAdapter.ts
var PublicWebAdapter = class {
  constructor(clock, transport, sleeper, uaToken = "GenesisResearchBot/0.1 (+contact: ops@genesis.local)", perMin = 30) {
    this.clock = clock;
    this.transport = transport;
    this.sleeper = sleeper;
    this.uaToken = uaToken;
    this.bucket = new TokenBucket(clock, perMin);
  }
  platform = "WEB";
  robotsCache = /* @__PURE__ */ new Map();
  bucket;
  async ingest(url) {
    if (!this.bucket.tryTake()) return { ok: false, error: "RATE_LIMITED", items: [] };
    const origin = "https://" + originOf(url);
    let robots = this.robotsCache.get(originOf(url));
    if (!robots) {
      try {
        const r = await withRetry(() => this.transport.fetch(origin + "/robots.txt"), { attempts: 2, baseMs: 200, maxMs: 1e3 }, this.sleeper);
        robots = parseRobots(r.status === 200 ? r.body : "", this.uaToken);
      } catch {
        robots = parseRobots("", this.uaToken);
      }
      this.robotsCache.set(originOf(url), robots);
    }
    if (robots.disallowed(pathOf(url))) return { ok: false, error: "ROBOTS_DISALLOWED", items: [] };
    let res;
    try {
      res = await withRetry(() => this.transport.fetch(url, { headers: { "User-Agent": this.uaToken } }), DEFAULT_RETRY, this.sleeper);
    } catch {
      return { ok: false, error: "NETWORK", items: [] };
    }
    if (res.status !== 200) return { ok: false, error: "NETWORK", items: [] };
    const title = extractTitle(res.body);
    const text = stripHtml(res.body).slice(0, 400);
    const claim = title || text.slice(0, 120);
    if (!claim) return { ok: false, error: "PARSE", items: [] };
    return { ok: true, items: [{ sourceUrl: url, sourceTimestamp: null, claim, claimType: "reported_claim", confidence: 0.5, provenance: { sourceKind: "web", retrievedBy: "public-web-robots-aware", independentSourceIds: [] } }] };
  }
};

// packages/core/src/knowledge/ingestion/SocialOfficialApiAdapter.ts
var SocialOfficialApiAdapter = class _SocialOfficialApiAdapter {
  constructor(platform, clock, transport, sleeper, keys) {
    this.platform = platform;
    this.clock = clock;
    this.transport = transport;
    this.sleeper = sleeper;
    this.keys = keys;
  }
  /** Numeric id after /posts/, /status/ or /statuses/; otherwise the last path segment (5+ chars). Never guesses. */
  static postId(url) {
    const m = /(?:posts|status|statuses)\/(\d+)/.exec(url) ?? /\/([A-Za-z0-9_]{5,})\/?(?:\?|#|$)/.exec(url);
    return m ? m[1] : null;
  }
  async ingest(url) {
    const key = this.keys.getKey();
    if (!key) return { ok: false, error: "REQUIRES_OFFICIAL_API", items: [], note: "Wymagany oficjalny klucz API platformy; brak automatyzacji przegl\u0105darki." };
    if (this.platform === "TELEGRAM") return { ok: false, error: "REQUIRES_OFFICIAL_API", items: [], note: "U\u017Cyj oficjalnego eksportu kana\u0142u lub dostarcz tre\u015B\u0107 r\u0119cznie; brak publicznego API post\xF3w." };
    const id = _SocialOfficialApiAdapter.postId(url);
    if (!id) return { ok: false, error: "PARSE", items: [] };
    const endpoint = this.platform === "X" ? "https://api.x.com/2/tweets?ids=" + encodeURIComponent(id) + "&tweet.fields=created_at,text" : "https://graph.facebook.com/v19.0/" + encodeURIComponent(id) + "?fields=message,created_time,permalink_url&access_token=" + encodeURIComponent(key);
    let body;
    try {
      body = (await withRetry(() => this.transport.fetch(endpoint, this.platform === "X" ? { headers: { Authorization: "Bearer " + key } } : void 0), DEFAULT_RETRY, this.sleeper)).body;
    } catch {
      return { ok: false, error: "NETWORK", items: [] };
    }
    let text;
    let createdAt;
    try {
      const j = JSON.parse(body);
      if (this.platform === "X") {
        text = j.data?.[0]?.text;
        createdAt = j.data?.[0]?.created_at ?? null;
      } else {
        text = j.message;
        createdAt = j.created_time ?? null;
      }
    } catch {
      return { ok: false, error: "PARSE", items: [] };
    }
    if (!text) return { ok: false, error: "PARSE", items: [] };
    return { ok: true, items: [{ sourceUrl: url, sourceTimestamp: createdAt, claim: text.slice(0, 300), claimType: "reported_claim", confidence: 0.4, provenance: { sourceKind: "web", author: this.platform, retrievedBy: this.platform.toLowerCase() + "-official-api", independentSourceIds: [] } }] };
  }
};

// packages/core/src/knowledge/ingestion/EnvKeyProvider.ts
function envKeyProvider(env, name) {
  return { getKey: () => {
    const v = env[name];
    return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
  } };
}
var KEY_ENV_NAMES = Object.freeze({ YOUTUBE: "YOUTUBE_API_KEY", X: "X_API_KEY", FACEBOOK: "FACEBOOK_API_KEY" });
export {
  DEFAULT_POLICIES,
  EvidenceLedger,
  KEY_ENV_NAMES,
  KNOWLEDGE_DISCLAIMER,
  OmniIngestionController,
  ProposeOnlyLearner,
  PublicWebAdapter,
  SocialOfficialApiAdapter,
  SourcePolicyRegistry,
  YouTubeOfficialApiAdapter,
  classifyClaim,
  envKeyProvider,
  originOf,
  realSleeper,
  statusLabelPl
};
