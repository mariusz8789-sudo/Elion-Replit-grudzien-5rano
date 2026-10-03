import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, realpathSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createArtifactStoragePort } from './workerInfrastructureContract.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._/-]{2,499}$/;

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function resolveWithin(rootDir, key) {
  if (typeof key !== 'string' || !KEY.test(key) || key.includes('..')) throw new Error('key: invalid');
  const candidate = path.resolve(rootDir, ...key.split('/'));
  const relative = path.relative(rootDir, candidate);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('ARTIFACT_PATH_ESCAPE');
  }
  return candidate;
}

async function readVerified(filePath, expectedSha256) {
  const bytes = await readFile(filePath);
  if (digest(bytes) !== expectedSha256) throw new Error('ARTIFACT_INTEGRITY_MISMATCH');
  return bytes;
}

/**
 * Content-addressed filesystem backend for one trusted Genesis node. Bytes stay outside SQLite,
 * writes are atomic in the destination directory and every read is verified. This backend is
 * deliberately not advertised as shared or multi-replica object storage.
 */
export function createLocalContentAddressedArtifactBackend({ rootDir } = {}) {
  if (typeof rootDir !== 'string' || rootDir.length === 0 || !path.isAbsolute(rootDir)) {
    throw new Error('rootDir: absolute path required');
  }
  mkdirSync(rootDir, { recursive: true });
  const trustedRoot = realpathSync(rootDir);

  async function putObject({ bytes, sha256 }) {
    const body = bytes instanceof Uint8Array ? Buffer.from(bytes) : Buffer.from(bytes ?? []);
    if (!SHA256.test(sha256 ?? '') || digest(body) !== sha256) throw new Error('ARTIFACT_HASH_MISMATCH');
    const key = `sha256/${sha256.slice(0, 2)}/${sha256}`;
    const finalPath = resolveWithin(trustedRoot, key);
    const parent = path.dirname(finalPath);
    await mkdir(parent, { recursive: true });
    const realParent = realpathSync(parent);
    const parentRelative = path.relative(trustedRoot, realParent);
    if (parentRelative === '..' || parentRelative.startsWith(`..${path.sep}`) || path.isAbsolute(parentRelative)) {
      throw new Error('ARTIFACT_PATH_ESCAPE');
    }

    try {
      await readVerified(finalPath, sha256);
      return { key, deduped: true };
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }

    const temporaryPath = `${finalPath}.tmp-${process.pid}-${randomUUID()}`;
    try {
      await writeFile(temporaryPath, body, { flag: 'wx', mode: 0o600 });
      await readVerified(temporaryPath, sha256);
      try {
        await rename(temporaryPath, finalPath);
      } catch (error) {
        if (error?.code !== 'EEXIST' && error?.code !== 'EPERM') throw error;
        await readVerified(finalPath, sha256);
        return { key, deduped: true };
      }
      await readVerified(finalPath, sha256);
      return { key, deduped: false };
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }

  async function getObject({ key, sha256 }) {
    if (!SHA256.test(sha256 ?? '')) throw new Error('sha256: invalid');
    return readVerified(resolveWithin(trustedRoot, key), sha256);
  }

  return Object.freeze({
    storageProvider: 'local-content-addressed-single-node',
    rootDir: trustedRoot,
    putObject,
    getObject,
  });
}

export function createLocalContentAddressedArtifactStorage({ rootDir, now } = {}) {
  const backend = createLocalContentAddressedArtifactBackend({ rootDir });
  const port = createArtifactStoragePort({
    storageProvider: backend.storageProvider,
    putObject: backend.putObject,
    now,
  });
  return Object.freeze({
    storageProvider: backend.storageProvider,
    rootDir: backend.rootDir,
    put: port.put,
    get: backend.getObject,
    admission: Object.freeze({
      scope: 'SINGLE_NODE_ONLY',
      multiReplicaSafe: false,
      productionObjectStorage: false,
      blocker: 'BLOCKED_EXTERNAL_OBJECT_STORAGE',
    }),
  });
}