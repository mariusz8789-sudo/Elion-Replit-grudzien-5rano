# Genesis Railway scientific worker — "chem-light" group (PySCF + Biopython).
#
# Standalone image. Does NOT replace or modify the root Dockerfile / main web
# service — this is an additive, separate build target for a dedicated
# Railway service. Build context is the REPOSITORY ROOT (needs package.json,
# package-lock.json and packages/backend), e.g.:
#   docker build -f packages/backend/workers/chem-light/Dockerfile -t genesis-worker-chem-light .
#
# Codex integration: see docs/RAILWAY_SCIENTIFIC_WORKERS.md for the exact
# patch to apply in shared files (this worker owns no route in api.mjs).

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY packages/backend/package.json packages/backend/
RUN npm ci --omit=dev --workspace=packages/backend && npm cache clean --force

COPY packages/backend/requirements-pyscf.txt packages/backend/requirements-pyscf.txt
COPY packages/backend/requirements-biopython.txt packages/backend/requirements-biopython.txt
COPY packages/backend/workers/chem-light/constraints.txt packages/backend/workers/chem-light/constraints.txt
# --only-binary: this slim image has no compiler, so a source build must fail
# here, loudly, rather than half-install. The constraints file locks every
# transitive version to the set verified by scripts/verify-scientific-worker-runtime.mjs.
RUN python3 -m venv /opt/genesis-science \
    && /opt/genesis-science/bin/python -m pip install --disable-pip-version-check --no-cache-dir --only-binary=:all: \
       -c packages/backend/workers/chem-light/constraints.txt \
       -r packages/backend/requirements-pyscf.txt \
       -r packages/backend/requirements-biopython.txt \
    && /opt/genesis-science/bin/python -c "import pyscf, Bio"
ENV GENESIS_PYTHON=/opt/genesis-science/bin/python

COPY packages/backend/src packages/backend/src

ENV GENESIS_WORKER_GROUP=chem-light
RUN mkdir -p /tmp/genesis-worker && chown -R node:node /tmp/genesis-worker /app
ENV TMPDIR=/tmp/genesis-worker

USER node
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8090)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "packages/backend/src/compute/workerEntrypoint.mjs"]
