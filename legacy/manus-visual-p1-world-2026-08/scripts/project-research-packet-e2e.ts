/**
 * GENESIS PROJECT RESEARCH PACKET — REAL BACKEND E2E
 *
 * Exercises the live HTTP backend and SQLite persistence:
 * register → project → immutable knowledge versions → source-bound packet
 * → viewer read RBAC → outsider isolation. The uploaded text remains explicitly
 * USER_PROVIDED_UNREVIEWED; this script neither selects a solver nor produces a
 * scientific result.
 */

const backendBaseUrl = (process.env.GENESIS_E2E_BACKEND_BASE_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, '');

async function request<T>(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {},
): Promise<{ status: number; body: T }> {
  const response = await fetch(`${backendBaseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { status: response.status, body: await response.json() as T };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

interface AuthResult { token: string; user: { id: string; email: string } }
interface ProjectResult { project: { id: string } }
interface MaterialResult { material: { id: string; version: number; versionId: string; contentSha256: string; epistemicStatus: string; provenance: { solverEffect?: string } } }
interface PacketResult {
  packet: {
    status: string;
    packetFingerprint: string;
    solverEffect: string;
    sources: Array<{
      referenceId: string;
      materialId: string;
      materialVersionId: string;
      materialVersion: number;
      contentSha256: string;
      epistemicStatus: string;
      solverEffect: string;
      excerpt: string;
      originalBase64?: string;
    }>;
  };
}

async function main(): Promise<void> {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1_000_000)}`;
  const owner = await request<AuthResult>('/api/auth/register', {
    method: 'POST',
    body: { email: `packet-owner-${suffix}@genesis.local`, password: 'packet-password-123', displayName: 'Packet Owner' },
  });
  assert(owner.status === 201, `Owner registration failed: ${JSON.stringify(owner)}`);
  const viewer = await request<AuthResult>('/api/auth/register', {
    method: 'POST',
    body: { email: `packet-viewer-${suffix}@genesis.local`, password: 'packet-password-123', displayName: 'Packet Viewer' },
  });
  assert(viewer.status === 201, `Viewer registration failed: ${JSON.stringify(viewer)}`);
  const outsider = await request<AuthResult>('/api/auth/register', {
    method: 'POST',
    body: { email: `packet-outsider-${suffix}@genesis.local`, password: 'packet-password-123', displayName: 'Packet Outsider' },
  });
  assert(outsider.status === 201, `Outsider registration failed: ${JSON.stringify(outsider)}`);

  const project = await request<ProjectResult>('/api/projects', {
    method: 'POST', token: owner.body.token,
    body: { name: 'Project Research Packet E2E', description: 'Source-bound, no solver effect.' },
  });
  assert(project.status === 201, `Project creation failed: ${JSON.stringify(project)}`);
  const projectId = project.body.project.id;

  const materialPayload = (content: string) => ({
    fileName: 'pdb-structural-note.md',
    mimeType: 'text/markdown',
    title: 'PDB structural comparison note',
    topics: ['HIV', 'MPER', 'PDB', 'structural comparison'],
    sourceUrl: 'https://www.rcsb.org/structure/5GHW',
    contentBase64: Buffer.from(content, 'utf8').toString('base64'),
  });

  const firstMaterial = await request<MaterialResult>(`/api/projects/${projectId}/knowledge-materials`, {
    method: 'POST', token: owner.body.token,
    body: materialPayload('User-provided project note: public PDB structure 5GHW is referenced for a bounded structural-comparison protocol. This note is unreviewed and has no solver effect.'),
  });
  assert(firstMaterial.status === 201, `Material upload failed: ${JSON.stringify(firstMaterial)}`);
  assert(firstMaterial.body.material.epistemicStatus === 'USER_PROVIDED_UNREVIEWED', 'Upload must stay USER_PROVIDED_UNREVIEWED.');
  assert(firstMaterial.body.material.provenance.solverEffect === 'NONE', 'Upload must not affect solver selection.');

  const firstPacket = await request<PacketResult>(`/api/projects/${projectId}/research-packet?q=PDB%20structural%20comparison`, { token: owner.body.token });
  assert(firstPacket.status === 200, `Packet request failed: ${JSON.stringify(firstPacket)}`);
  assert(firstPacket.body.packet.status === 'RETRIEVED' && firstPacket.body.packet.sources.length === 1, 'Expected exactly one source-bound packet reference.');
  const firstSource = firstPacket.body.packet.sources[0];
  assert(firstPacket.body.packet.solverEffect === 'NONE' && firstSource.solverEffect === 'NONE', 'Packet must not affect solver capability.');
  assert(firstSource.contentSha256 === firstMaterial.body.material.contentSha256, 'Packet must preserve upload SHA-256.');
  assert(firstSource.originalBase64 === undefined, 'Packet must not export original binary content.');

  const versionTwo = await request<MaterialResult>(`/api/projects/${projectId}/knowledge-materials`, {
    method: 'POST', token: owner.body.token,
    body: materialPayload('User-provided project note v2: public PDB structure 5GHW remains a source reference. This material remains unreviewed and must never become a solver instruction.'),
  });
  assert(versionTwo.status === 201 && versionTwo.body.material.version === 2, 'Expected immutable second material version.');
  const secondPacket = await request<PacketResult>(`/api/projects/${projectId}/research-packet?q=PDB%20structural%20comparison`, { token: owner.body.token });
  assert(secondPacket.status === 200, `Second packet request failed: ${JSON.stringify(secondPacket)}`);
  assert(secondPacket.body.packet.packetFingerprint !== firstPacket.body.packet.packetFingerprint, 'Changed material version must change packet fingerprint.');
  assert(secondPacket.body.packet.sources[0].contentSha256 === versionTwo.body.material.contentSha256, 'Packet must bind current material version SHA-256.');
  const historicalReplay = await request<{ replay: { status: string; replayedPacketFingerprint: string; packet: PacketResult['packet'] } }>(`/api/projects/${projectId}/research-packet`, {
    method: 'POST', token: owner.body.token, body: { packet: firstPacket.body.packet },
  });
  assert(historicalReplay.status === 200, `Historical replay failed: ${JSON.stringify(historicalReplay)}`);
  assert(historicalReplay.body.replay.status === 'MATCH', 'Historical source-version replay must match the original packet.');
  assert(historicalReplay.body.replay.replayedPacketFingerprint === firstPacket.body.packet.packetFingerprint, 'Historical replay fingerprint must bind version 1.');
  assert(historicalReplay.body.replay.packet.sources[0].materialVersion === 1, 'Historical replay must resolve material version 1, not current version 2.');

  const membership = await request(`/api/projects/${projectId}/members`, {
    method: 'POST', token: owner.body.token, body: { email: viewer.body.user.email, role: 'viewer' },
  });
  assert(membership.status === 200, `Viewer membership failed: ${JSON.stringify(membership)}`);
  const viewerPacket = await request<PacketResult>(`/api/projects/${projectId}/research-packet?q=PDB`, { token: viewer.body.token });
  const outsiderPacket = await request<unknown>(`/api/projects/${projectId}/research-packet?q=PDB`, { token: outsider.body.token });
  assert(viewerPacket.status === 200 && viewerPacket.body.packet.sources.length === 1, 'Viewer must read source-bound packet.');
  assert(outsiderPacket.status === 404, 'Outsider must not discover project packet.');

  process.stdout.write(`${JSON.stringify({
    status: 'PASS',
    projectId,
    sourceReference: secondPacket.body.packet.sources[0].referenceId,
    firstPacketFingerprint: firstPacket.body.packet.packetFingerprint,
    secondPacketFingerprint: secondPacket.body.packet.packetFingerprint,
    historicalReplayStatus: historicalReplay.body.replay.status,
    historicalReplayFingerprint: historicalReplay.body.replay.replayedPacketFingerprint,
    sourceContentSha256: secondPacket.body.packet.sources[0].contentSha256,
    sourceVersion: secondPacket.body.packet.sources[0].materialVersion,
    solverEffect: secondPacket.body.packet.solverEffect,
    viewerStatus: viewerPacket.status,
    outsiderStatus: outsiderPacket.status,
  }, null, 2)}\n`);
}

main().catch((error: unknown) => {
  console.error('[E2E] FAIL — Project Research Packet:', error);
  process.exit(1);
});
