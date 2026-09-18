import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Repository paths that are correct whether vitest runs from the repo root or from
 * packages/frontend (the workspace run CI uses). Tests must never assume one cwd.
 */
const cwd = process.cwd();
export const REPO_ROOT = existsSync(path.join(cwd, 'packages', 'frontend')) ? cwd : path.resolve(cwd, '..', '..');
export const FRONTEND_ROOT = path.join(REPO_ROOT, 'packages', 'frontend');
export const FRONTEND_SRC = path.join(FRONTEND_ROOT, 'src');
