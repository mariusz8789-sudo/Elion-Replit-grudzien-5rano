/**
 * The constants the remote ResearchRun worker protocol is made of. Kept in a module with no imports so the worker
 * process (which has no database) and the server share one definition without the worker loading server code.
 */
export const WORKER_API_PREFIX = '/api/worker/v1';
export const REMOTE_OUTCOME_KIND = 'genesis-remote-engine-outcome/v1';
/** The same experiment, but run by a separate worker process that speaks only HTTP (remoteWorkerApi.mjs). */
export const RESEARCH_REMOTE_CAPABILITY = 'research-run-experiment-remote';
/** Several experiments in a row (advance) driven by a remote worker under ONE lease: freeze, engine, apply, next. */
export const RESEARCH_ADVANCE_REMOTE_CAPABILITY = 'research-run-advance-remote';
/** A remote worker may die; the lease expiry hands the job to another one. A retry resumes the SAME frozen experiment. */
export const REMOTE_MAX_ATTEMPTS = 3;
