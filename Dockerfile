# Genesis OS — obraz produkcyjny (frontend PWA + backend AI w jednym).
# Multi-stage: build w pełnym node, runtime na slim bez devDependencies.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/frontend/package.json packages/frontend/
COPY packages/backend/package.json packages/backend/
COPY packages/csrn/package.json packages/csrn/
RUN npm ci
COPY . .
RUN npm run build
RUN npx esbuild packages/core/src/solvers/speculative/index.ts --bundle --format=esm --platform=node --target=node22 --legal-comments=none --outfile=packages/backend/src/compute/speculative-core.mjs

FROM node:22-slim AS runtime
# Tożsamość wydania (P0.3). Bez tego /api/health nie potrafi powiedzieć, KTÓRY
# kod stoi na produkcji — a `.git` celowo nie jest kopiowany do obrazu.
# Budowa:  docker build --build-arg GENESIS_COMMIT=$(git rev-parse HEAD) \
#                       --build-arg GENESIS_BUILT_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ) .
ARG GENESIS_COMMIT=unknown
ARG GENESIS_BUILT_AT=
ENV GENESIS_COMMIT=${GENESIS_COMMIT}
ENV GENESIS_BUILT_AT=${GENESIS_BUILT_AT}
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/backend/package.json packages/backend/
RUN npm ci --omit=dev --workspace=packages/backend && npm cache clean --force

# The staging product promises at least one real Virtual Lab engine. A bare
# node:slim runtime has no Python/RDKit, so every molecular experiment would be
# BLOCKED even though CI and the host validation are green. Install only the
# small, pinned, reference-tested RDKit runtime here; the heavier optional
# engines remain honest BLOCKED_LIBRARY states until a dedicated compute image
# is selected. A venv avoids modifying Debian's externally-managed Python.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates gosu \
    && rm -rf /var/lib/apt/lists/*
COPY packages/backend/requirements-rdkit.txt packages/backend/requirements-rdkit.txt
RUN python3 -m venv /opt/genesis-science \
    && /opt/genesis-science/bin/python -m pip install --disable-pip-version-check --no-cache-dir -r packages/backend/requirements-rdkit.txt
ENV GENESIS_RDKIT_PYTHON=/opt/genesis-science/bin/python

COPY packages/backend/src packages/backend/src
COPY knowledge knowledge
COPY --from=build /app/packages/frontend/dist packages/frontend/dist

# Trwały magazyn POZA drzewem aplikacji (P0.2). Bez tego GENESIS_DB_PATH
# domyślnie wskazuje /app/packages/backend/data/genesis.db — czyli warstwę
# zapisywalną obrazu, wymienianą przy KAŻDYM redeployu. Konta, projekty i Serie
# Prób ginęły wtedy cicho, bez błędu, przy poprawnie działającej aplikacji.
# Katalog musi należeć do użytkownika `node`, bo proces nie jest rootem.
ENV GENESIS_DB_PATH=/data/genesis.db
RUN mkdir -p /data && chown -R node:node /data
# Railway mounts its volume at the path set in the service config; this VOLUME keeps the durability
# contract (P0.2) explicit for every other container runtime and for the dbDurability test.
VOLUME ["/data"]

# Railway mounts volumes as root. The entrypoint repairs only the dedicated
# /data mount ownership and immediately drops privileges; the Node server never
# handles requests as root. This also works unchanged outside Railway.
COPY scripts/container-entrypoint.sh /usr/local/bin/genesis-entrypoint
RUN chmod 0755 /usr/local/bin/genesis-entrypoint
ENTRYPOINT ["/usr/local/bin/genesis-entrypoint"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "packages/backend/src/start.mjs"]
