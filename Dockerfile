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
# DIAGNOSTIC, TEMPORARY (D-017 follow-up): the identical `npm run build` passes
# in the verify CI job (same ubuntu-latest runner, actions/setup-node) but
# fails inside this node:22-slim container on a real, reproducible TS2307 for
# node:crypto/node:child_process in packages/csrn + rdkitTransport.node.ts.
# Two local reproductions of this exact COPY sequence (with and without
# packages/csrn/package.json present before npm ci) both built cleanly, so the
# difference is something about THIS container specifically. This step prints
# only versions and directory listings -- no secrets, nothing sensitive -- to
# find that difference from a real failing run instead of guessing again.
RUN node --version && npm --version \
    && echo "--- root node_modules/typescript ---" && cat node_modules/typescript/package.json 2>/dev/null | grep '"version"' \
    && echo "--- root node_modules/@types/node ---" && cat node_modules/@types/node/package.json 2>/dev/null | grep '"version"' || echo "MISSING: node_modules/@types/node" \
    && echo "--- packages/frontend/node_modules ---" && ls packages/frontend/node_modules 2>&1 \
    && echo "--- packages/csrn/node_modules ---" && ls packages/csrn/node_modules 2>&1 \
    && echo "--- packages/frontend/tsconfig.json ---" && cat packages/frontend/tsconfig.json
RUN npm run build

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
VOLUME ["/data"]

# Proces bez roota
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "packages/backend/src/start.mjs"]
