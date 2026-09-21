/* Proprietary / All Rights Reserved - Genesis OS */
import type { EvidenceLedger } from '../knowledge/EvidenceLedger.js';
export interface LedgerFeedEntry { readonly index: number; readonly kind: string; readonly recordId: string; readonly contentHash: string; readonly at: number; }
export interface LedgerFeed { subscribe(cb: (e: LedgerFeedEntry) => void): () => void; status(): 'live' | 'closed'; }
export interface CepAlert { readonly patternId: string; readonly status: string; readonly score: number; readonly confidence: number; readonly at: number; }
export interface CepFeed { subscribe(cb: (a: CepAlert) => void): () => void; }
export class LedgerFeedBus implements LedgerFeed {
  private cbs = new Set<(e: LedgerFeedEntry) => void>();
  private open = true;
  push(e: LedgerFeedEntry): void { if (this.open) for (const cb of this.cbs) cb(e); }
  subscribe(cb: (e: LedgerFeedEntry) => void): () => void { this.cbs.add(cb); return () => { this.cbs.delete(cb); }; }
  status(): 'live' | 'closed' { return this.open ? 'live' : 'closed'; }
  close(): void { this.open = false; this.cbs.clear(); }
}
export class CepFeedBus implements CepFeed {
  private cbs = new Set<(a: CepAlert) => void>();
  push(a: CepAlert): void { for (const cb of this.cbs) cb(a); }
  subscribe(cb: (a: CepAlert) => void): () => void { this.cbs.add(cb); return () => { this.cbs.delete(cb); }; }
}
/** Polls a live EvidenceLedger and emits new entries (UI-side timer; engine stays timer-free). */
export function createLocalLedgerFeed(ledger: EvidenceLedger, intervalMs = 500): LedgerFeed {
  const bus = new LedgerFeedBus();
  let last = 0;
  const timer = setInterval(() => {
    const entries = ledger.getEntries();
    for (let i = last; i < entries.length; i++) { const e = entries[i]; bus.push({ index: e.index, kind: e.kind, recordId: e.recordId, contentHash: e.contentHash, at: e.at }); }
    last = entries.length;
  }, intervalMs);
  const origClose = bus.close.bind(bus);
  bus.close = () => { clearInterval(timer); origClose(); };
  return bus;
}
/** WebSocket transport with exponential backoff reconnect; parses JSON LedgerFeedEntry messages. */
export function createWebSocketLedgerFeed(url: string): LedgerFeed {
  const bus = new LedgerFeedBus();
  let ws: WebSocket | null = null; let attempt = 0; let closed = false; let timer: ReturnType<typeof setTimeout> | null = null;
  const connect = (): void => {
    if (closed) return;
    ws = new WebSocket(url);
    ws.onopen = () => { attempt = 0; };
    ws.onmessage = (m) => { try { const e = JSON.parse(String(m.data)) as LedgerFeedEntry; if (typeof e.contentHash === 'string' && typeof e.index === 'number') bus.push(e); } catch { /* drop malformed */ } };
    ws.onclose = () => { if (closed) return; attempt += 1; timer = setTimeout(connect, Math.min(8000, 250 * Math.pow(2, attempt))); };
    ws.onerror = () => { ws?.close(); };
  };
  connect();
  const origClose = bus.close.bind(bus);
  bus.close = () => { closed = true; if (timer) clearTimeout(timer); ws?.close(); origClose(); };
  return bus;
}
