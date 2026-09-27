import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  classifyHttpOutcome,
  type RetrievalOutcome,
  type SourceConnector,
  type SourceDescriptor,
} from './scientificSourceAccess';

/**
 * REAL HTTP RETRIEVAL, Node side.
 *
 * Uses curl rather than global fetch for one concrete reason: this runtime
 * routes egress through an authenticating proxy declared in HTTPS_PROXY, and
 * curl honours it while Node's built-in fetch does not. The same
 * `.node.ts` convention as the RDKit and ADMET transports keeps
 * `node:child_process` out of the browser bundle.
 *
 * NO CREDENTIALS ARE SENT AND NONE ARE ACCEPTED. This connector retrieves
 * public URLs only. A source that needs a credential must be marked
 * REQUIRES_AUTH by the caller and handled by a future authenticated
 * connector — it is not something to work around here.
 */
const MAX_BYTES = 32 * 1024 * 1024;

export function createNodeHttpSourceConnector(options: { timeoutSeconds?: number } = {}): SourceConnector {
  const timeoutSeconds = options.timeoutSeconds ?? 45;

  return {
    connectorId: 'node-curl-public-http@1.0.0',

    retrieve(source: SourceDescriptor): RetrievalOutcome {
      const retrievedAt = new Date().toISOString();
      const base = { sourceId: source.sourceId, url: source.url, retrievedAt };

      if (source.requiresCredential) {
        return {
          ...base,
          state: 'REQUIRES_AUTH',
          httpStatus: null,
          reason: 'This source is declared as requiring a credential. This connector retrieves public URLs only and does not hold, send or acquire credentials.',
          contentSha256: null,
          contentBytes: null,
          content: null,
        };
      }

      try {
        // -sS: quiet but keep errors. -w: append the real status code so it can
        // be separated from the body deterministically.
        const raw = execFileSync('curl', [
          '-sS', '-L',
          '--max-time', String(timeoutSeconds),
          '--max-filesize', String(MAX_BYTES),
          '-w', '\\n__GENESIS_HTTP_STATUS__:%{http_code}',
          source.url,
        ], { encoding: 'utf8', maxBuffer: MAX_BYTES, stdio: ['ignore', 'pipe', 'pipe'] });

        const marker = raw.lastIndexOf('\n__GENESIS_HTTP_STATUS__:');
        const body = marker === -1 ? raw : raw.slice(0, marker);
        const statusText = marker === -1 ? '' : raw.slice(marker + '\n__GENESIS_HTTP_STATUS__:'.length).trim();
        const httpStatus = /^\d{3}$/.test(statusText) ? Number(statusText) : null;

        const state = classifyHttpOutcome(httpStatus, '');
        if (state !== 'RETRIEVED') {
          return {
            ...base,
            state,
            httpStatus,
            reason: `Host answered HTTP ${httpStatus ?? 'unknown'}. No content was accepted from a non-200 response.`,
            contentSha256: null,
            contentBytes: null,
            content: null,
          };
        }

        return {
          ...base,
          state: 'RETRIEVED',
          httpStatus,
          reason: '',
          contentSha256: createHash('sha256').update(body, 'utf8').digest('hex'),
          contentBytes: Buffer.byteLength(body, 'utf8'),
          content: body,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message.split('\n').slice(0, 3).join(' ') : String(error);
        const stderr = (error as { stderr?: string }).stderr ?? '';
        const detail = `${message} ${stderr}`.slice(0, 300);
        return {
          ...base,
          state: classifyHttpOutcome(null, detail),
          httpStatus: null,
          reason: `Transport failure: ${detail.trim()}`,
          contentSha256: null,
          contentBytes: null,
          content: null,
        };
      }
    },
  };
}
