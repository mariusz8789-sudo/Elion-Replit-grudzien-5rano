/**
 * Child-process entry for ResearchRun jobs. It runs the SAME functions the in-process path runs
 * (executeResearchExperiment / advanceResearchRun) against the same database file, so the engine blocks this
 * process, not the server. The parent can kill the whole process group at any moment; SQLite rolls back an
 * unfinished transaction, and a frozen-but-unexecuted experiment is simply resumed by the next job.
 * stdin: one JSON request. stdout: the line CHILD_RESULT_MARKER + JSON.
 */
import { openDatabase } from './store.mjs';
import { executeResearchExperiment } from './researchRunExecution.mjs';
import { advanceResearchRun } from './researchRunAdvance.mjs';
import { CHILD_RESULT_MARKER } from './compute/isolatedProcess.mjs';
import { openKnowledgeLedgerPersistence } from './knowledgeApi.mjs';


async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

const request = JSON.parse(await readStdin());
const db = openDatabase(request.dbPath);
// Evidence proposals go to the parent's ledger: with a SQLite ledger that is the same append-only table in this
// database file, so the server sees them on its next read. Without one, this process would propose into a
// throwaway in-memory ledger and the evidence would be lost.
if (request.ledger?.store === 'SQLITE') openKnowledgeLedgerPersistence(request.ledger.path, { db });
try {
  const full = request.kind === 'advance'
    ? await advanceResearchRun(db, request.projectId, request.runId, { maxSteps: request.maxSteps, userId: request.userId ?? null })
    : executeResearchExperiment(db, request.projectId, request.runId, { hypothesisId: request.hypothesisId ?? null, userId: request.userId ?? null });
  const result = { ...full };
  delete result.researchRun; // the parent reads the run itself; the view is large and not part of the answer
  process.stdout.write(`\n${CHILD_RESULT_MARKER}${JSON.stringify(result)}\n`);
} finally {
  db.close();
}
