# Genesis Railway scientific worker — "admet" group (ADMET-AI: absorption/
# distribution/metabolism/excretion + toxicity endpoints). Isolated in its own
# worker/image because admet-ai pulls in PyTorch — verified at ~1.2GB installed
# in this repository's sandbox — which would otherwise dominate a shared
# worker's image size and memory footprint. Railway has CPU-only containers,
# so this installs the CPU-only torch wheel FIRST (from PyTorch's own CPU
# index) so admet-ai's own install resolves against it instead of pulling a
# multi-GB CUDA build that could never be used here anyway.
#
# Standalone image. Additive only; does not modify the root Dockerfile.
#   docker build -f packages/backend/workers/admet/Dockerfile -t genesis-worker-admet .

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY packages/backend/requirements-admet.txt packages/backend/requirements-admet.txt
COPY packages/backend/workers/admet/constraints.txt packages/backend/workers/admet/constraints.txt
# torch is pinned to the version verified with admet-ai 2.0.1 / chemprop 2.3.1
# (an unpinned install took whatever the CPU index published that day). The
# final check fails the build if a CUDA torch ever replaces the CPU build.
RUN python3 -m venv /opt/genesis-science \
    && /opt/genesis-science/bin/python -m pip install --disable-pip-version-check --no-cache-dir --only-binary=:all: \
       torch==2.14.0 --index-url https://download.pytorch.org/whl/cpu \
    && /opt/genesis-science/bin/python -m pip install --disable-pip-version-check --no-cache-dir --only-binary=:all: \
       -c packages/backend/workers/admet/constraints.txt \
       -r packages/backend/requirements-admet.txt \
    && /opt/genesis-science/bin/python -c "import sys, torch, admet_ai, chemprop; sys.exit(0 if torch.version.cuda is None else 'CUDA torch installed in the CPU-only admet image')"
ENV GENESIS_PYTHON=/opt/genesis-science/bin/python

COPY package.json package-lock.json ./
COPY packages/backend/package.json packages/backend/
RUN npm ci --omit=dev --workspace=packages/backend && npm cache clean --force

COPY packages/backend/src packages/backend/src

ENV GENESIS_WORKER_GROUP=admet
RUN mkdir -p /tmp/genesis-worker && chown -R node:node /tmp/genesis-worker /app
ENV TMPDIR=/tmp/genesis-worker

USER node
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8090)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "packages/backend/src/compute/workerEntrypoint.mjs"]
