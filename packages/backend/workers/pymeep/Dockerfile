# Genesis Railway scientific worker — "pymeep" group (PyMeep, Maxwell FDTD).
#
# Real PyMeep is distributed through conda-forge, not PyPI (the PyPI package
# named "meep" is an unrelated release tool and is never installed). This image
# reproduces the exact runtime verified for this worker:
#   - micromamba is fetched from the conda-forge channel itself (the same host
#     as every package in the lock) and checked against a pinned SHA-256;
#   - the environment is created ONLY from conda-linux-64.lock (115 conda-forge
#     packages pinned by URL + md5), so no solver runs at build time.
# An environment created from that lock passed meep_worker.py's Fresnel
# reference case with the identical result as the original solve.
#
# This worker serves /health, /engines and the reference case. It has no
# capability-execution contract: the Virtual Lab's maxwell-fdtd capability is
# deliberately unbound (campaign/virtualLabClosedLoop.mjs).
#
# Standalone image, built from the repository root:
#   docker build -f packages/backend/workers/pymeep/Dockerfile -t genesis-worker-pymeep .

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

ARG MICROMAMBA_URL=https://conda.anaconda.org/conda-forge/linux-64/micromamba-2.0.5-0.tar.bz2
ARG MICROMAMBA_SHA256=bfc2e3a414d651af7508c49998a12b5cf3c7029d56c5ef37c9a3248cd7faef78
COPY packages/backend/workers/pymeep/conda-linux-64.lock /tmp/conda-linux-64.lock
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl bzip2 \
    && curl -fsSL -o /tmp/micromamba.tar.bz2 "$MICROMAMBA_URL" \
    && echo "$MICROMAMBA_SHA256  /tmp/micromamba.tar.bz2" | sha256sum -c - \
    && tar -xjf /tmp/micromamba.tar.bz2 -C /tmp bin/micromamba \
    && MAMBA_ROOT_PREFIX=/tmp/mamba /tmp/bin/micromamba create -y -p /opt/genesis-meep --file /tmp/conda-linux-64.lock \
    && /opt/genesis-meep/bin/python -c "import meep" \
    && rm -rf /tmp/micromamba.tar.bz2 /tmp/bin /tmp/mamba /tmp/conda-linux-64.lock \
    && apt-get purge -y --auto-remove curl bzip2 \
    && rm -rf /var/lib/apt/lists/*
ENV GENESIS_MEEP_PYTHON=/opt/genesis-meep/bin/python

COPY package.json package-lock.json ./
COPY packages/backend/package.json packages/backend/
RUN npm ci --omit=dev --workspace=packages/backend && npm cache clean --force

COPY packages/backend/src packages/backend/src

ENV GENESIS_WORKER_GROUP=pymeep
RUN mkdir -p /tmp/genesis-worker && chown -R node:node /tmp/genesis-worker /app
ENV TMPDIR=/tmp/genesis-worker

USER node
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8090)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "packages/backend/src/compute/workerEntrypoint.mjs"]
