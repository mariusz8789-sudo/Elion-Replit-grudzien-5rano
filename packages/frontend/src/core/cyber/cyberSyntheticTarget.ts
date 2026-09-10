/**
 * Genesis Cyber Reasoning Engine — Deterministic Synthetic Target
 *
 * A toy vulnerable web application with REAL routing/auth logic.
 * Vulnerabilities exist in the CODE, not in metadata flags.
 * The reasoning engine must discover them through execution.
 *
 * NO weaponized exploits. Synthetic fixture only.
 */

export interface ToyRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: Record<string, string>;
  readonly body: string | null;
}

export interface ToyResponse {
  readonly status: number;
  readonly body: string;
  readonly headers: Record<string, string>;
}

export interface ToyTargetState {
  readonly targetId: string;
  readonly name: string;
  readonly remediationsApplied: ReadonlySet<string>;
  readonly requestLog: readonly ToyRequest[];
}

/**
 * Deterministic toy web application.
 *
 * Vulnerability 1 (TRUE): /admin has no auth check (auth bypass).
 * Vulnerability 2 (FALSE): /api/users looks like IDOR but actually checks ownership.
 * Vulnerability 3 (TRUE): /search is vulnerable to injection (returns data for any query).
 *
 * The reasoning engine must discover these through execution,
 * NOT by reading metadata.
 */
export class ToyVulnerableApp {
  private readonly validSessions = new Set<string>(['session-valid-001']);
  private readonly users = new Map<string, { id: string; owner: string }>([
    ['user-1', { id: 'user-1', owner: 'alice' }],
    ['user-2', { id: 'user-2', owner: 'bob' }],
  ]);
  private remediations = new Set<string>();
  private requestLog: ToyRequest[] = [];

  readonly targetId = 'toy-target-001';
  readonly name = 'Synthetic Vulnerable Web Application';

  handleRequest(request: ToyRequest): ToyResponse {
    this.requestLog.push(request);

    switch (request.path) {
      case '/admin':
        return this.handleAdmin(request);
      case '/api/users':
        return this.handleUsers(request);
      case '/search':
        return this.handleSearch(request);
      case '/health':
        return { status: 200, body: '{"status":"ok"}', headers: {} };
      default:
        return { status: 404, body: 'Not found', headers: {} };
    }
  }

  /**
   * VULNERABILITY: Auth bypass on /admin.
   * Before remediation: NO auth check. Returns 200 for anyone.
   * After remediation 'admin-auth-fix': checks session.
   */
  private handleAdmin(request: ToyRequest): ToyResponse {
    if (this.remediations.has('admin-auth-fix')) {
      const sessionId = request.headers['x-session-id'];
      if (!sessionId || !this.validSessions.has(sessionId)) {
        return { status: 403, body: 'Forbidden', headers: {} };
      }
    }
    // BUG: no auth check before remediation
    return { status: 200, body: '{"admin":true,"data":"sensitive"}', headers: {} };
  }

  /**
   * NOT A VULNERABILITY: /api/users checks ownership.
   * Looks like IDOR but actually validates the requester owns the record.
   */
  private handleUsers(request: ToyRequest): ToyResponse {
    const sessionId = request.headers['x-session-id'];
    if (!sessionId || !this.validSessions.has(sessionId)) {
      return { status: 401, body: 'Unauthorized', headers: {} };
    }

    const requestedUserId = request.headers['x-requested-user'];
    const sessionOwner = sessionId === 'session-valid-001' ? 'alice' : 'unknown';

    if (requestedUserId) {
      const user = this.users.get(requestedUserId);
      if (!user) {
        return { status: 404, body: 'User not found', headers: {} };
      }
      if (user.owner !== sessionOwner) {
        return { status: 403, body: 'Access denied: not your record', headers: {} };
      }
      return { status: 200, body: JSON.stringify(user), headers: {} };
    }

    return { status: 200, body: JSON.stringify({ id: 'user-1', owner: sessionOwner }), headers: {} };
  }

  /**
   * VULNERABILITY: /search returns data for any query without validation.
   * Before remediation: returns all matching records regardless of query.
   * After remediation 'search-input-validation': rejects suspicious queries.
   */
  private handleSearch(request: ToyRequest): ToyResponse {
    if (this.remediations.has('search-input-validation')) {
      const query = request.headers['x-query'] ?? '';
      if (query.includes("'") || query.includes(';') || query.includes('--')) {
        return { status: 400, body: 'Invalid query', headers: {} };
      }
    }
    // BUG: returns data for any query, including injection attempts
    return {
      status: 200,
      body: JSON.stringify({ results: [{ id: 1, data: 'record-1' }, { id: 2, data: 'record-2' }] }),
      headers: {},
    };
  }

  applyRemediation(remediationId: string): void {
    this.remediations.add(remediationId);
  }

  getState(): ToyTargetState {
    return {
      targetId: this.targetId,
      name: this.name,
      remediationsApplied: new Set(this.remediations),
      requestLog: [...this.requestLog],
    };
  }

  reset(): void {
    this.remediations = new Set();
    this.requestLog = [];
  }

  getEndpoints(): readonly string[] {
    return ['/admin', '/api/users', '/search', '/health'];
  }
}
