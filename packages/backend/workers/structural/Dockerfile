# Genesis Railway scientific worker — "structural" group (OpenMM + AutoDock
# Vina + Meeko). Meeko depends on RDKit for ligand/receptor preparation, so
# this worker also installs requirements-rdkit.txt (the same pin already used
# by the main service's Dockerfile), not because it needs RDKit's own
# capability, but because dock_worker.py imports meeko which imports rdkit.
#
# Standalone image. Additive only; does not modify the root Dockerfile.
#   docker build -f packages/backend/workers/structural/Dockerfile -t genesis-worker-structural .

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY packages/backend/package.json packages/backend/
RUN npm ci --omit=dev --workspace=packages/backend && npm cache clean --force

COPY packages/backend/requirements-rdkit.txt packages/backend/requirements-rdkit.txt
COPY packages/backend/requirements-openmm.txt packages/backend/requirements-openmm.txt
COPY packages/backend/requirements-vina.txt packages/backend/requirements-vina.txt
COPY packages/backend/requirements-meeko.txt packages/backend/requirements-meeko.txt
COPY packages/backend/workers/structural/constraints.txt packages/backend/workers/structural/constraints.txt
# The import check covers meeko's undeclared runtime imports (scipy, gemmi):
# without them docking silently degraded to BLOCKED_BY_RUNTIME at run time.
#
# pdbfixer is the ONE exception to --only-binary. It publishes no wheel on PyPI, so a
# binary-only resolve fails outright ("No matching distribution"); it is pure Python, so
# its sdist builds in this compiler-less image without touching a toolchain. Naming it in
# --no-binary keeps that single exception explicit — every other package must still arrive
# as a wheel, which is what stops a silent source build of an extension module.
RUN python3 -m venv /opt/genesis-science \
    && /opt/genesis-science/bin/python -m pip install --disable-pip-version-check --no-cache-dir --only-binary=:all: --no-binary=pdbfixer \
       -c packages/backend/workers/structural/constraints.txt \
       -r packages/backend/requirements-rdkit.txt \
       -r packages/backend/requirements-openmm.txt \
       -r packages/backend/requirements-vina.txt \
       -r packages/backend/requirements-meeko.txt \
    && /opt/genesis-science/bin/python -c "import rdkit, openmm, vina, meeko, scipy, gemmi, pdbfixer"
ENV GENESIS_PYTHON=/opt/genesis-science/bin/python

COPY packages/backend/src packages/backend/src

ENV GENESIS_WORKER_GROUP=structural
RUN mkdir -p /tmp/genesis-worker && chown -R node:node /tmp/genesis-worker /app
ENV TMPDIR=/tmp/genesis-worker

USER node
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8090)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "packages/backend/src/compute/workerEntrypoint.mjs"]
