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
RUN python3 -m venv /opt/genesis-science \
    && /opt/genesis-science/bin/python -m pip install --disable-pip-version-check --no-cache-dir \
       -r packages/backend/requirements-rdkit.txt \
       -r packages/backend/requirements-openmm.txt \
       -r packages/backend/requirements-vina.txt \
       -r packages/backend/requirements-meeko.txt
ENV GENESIS_PYTHON=/opt/genesis-science/bin/python

COPY packages/backend/src packages/backend/src

ENV GENESIS_WORKER_GROUP=structural
RUN mkdir -p /tmp/genesis-worker && chown -R node:node /tmp/genesis-worker /app
ENV TMPDIR=/tmp/genesis-worker

USER node
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8090)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "packages/backend/src/compute/workerEntrypoint.mjs"]
