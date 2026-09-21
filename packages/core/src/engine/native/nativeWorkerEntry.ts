/* Proprietary / All Rights Reserved - Genesis OS */
/** Thin worker_threads entry: NATIVE_KERNELS behind the fixed message protocol (see workerProtocol.ts). */
import { parentPort } from 'node:worker_threads';
import { NATIVE_KERNELS } from './nativeKernels.js';
import { attachWorkerProtocol } from './workerProtocol.js';
export type { WorkerRequest, WorkerResult } from './workerProtocol.js';
if (!parentPort) throw new Error('WORKER_NO_PARENT_PORT');
attachWorkerProtocol(parentPort, NATIVE_KERNELS);
