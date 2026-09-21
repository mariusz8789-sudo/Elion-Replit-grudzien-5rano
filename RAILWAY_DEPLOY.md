# Railway deployment

1. In Railway, create a new project from GitHub and select `mariusz8789-sudo/Elion-Replit-grudzien-5rano` with branch `main` (the product shell + all worlds; `railway-production-ready` is an older branch whose root route is a particle canvas). Railway will use the repository `Dockerfile` automatically; the fallback Node commands are `npm run build` and `npm start`.
2. Add the required variables in **Variables**: `ANTHROPIC_API_KEY` for AI requests. Optional runtime variables are `GENESIS_AI_MODEL`, `GENESIS_RESEARCH_API_KEY`, `GENESIS_INSTITUTIONAL_API_KEY`, `GENESIS_DB_PATH`, `GENESIS_ARTIFACT_DIR`, and `GENESIS_STATIC_DIR`. Leave `PORT` unset so Railway injects it; the server listens on `process.env.PORT` and defaults to `8080` locally.
3. Deploy and verify `https://<your-domain>/api/health`. A healthy response reports `ok: true`; enable Railway volume storage and set `GENESIS_DB_PATH` to a mounted path if SQLite data must survive redeploys.

The production image builds the frontend, serves it through the backend, exposes port `8080`, and includes a health check at `/api/health`.
