import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { env } from "./env";
import { passport } from "./auth";
import { setupWebSocket } from "./socket";
import { storage } from "./storage";
import { partnerApi } from "./partnerApi";
import { roadServicesRouter } from "./roadServices/router";
import { roadServicesPartnerApi } from "./roadServices/partnerApi";
import { pool } from "./db";

const app = express();
const PgSession = connectPgSimple(session);

// Trust proxy for proper rate limiting behind reverse proxy
app.set('trust proxy', 1);

// Liveness/readiness probe: cheap, unauthenticated, ahead of rate limiting and session
// middleware so orchestrators (k8s, Render, etc.) can poll it without side effects.
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", uptime: process.uptime() });
});

app.use(helmet({
  contentSecurityPolicy: env.NODE_ENV === "production" ? {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'", "https://js.stripe.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://api.mapbox.com"],
      fontSrc: ["'self'", "data:"],
      imgSrc: ["'self'", "data:", "blob:", "https://api.mapbox.com", "https://*.tiles.mapbox.com", "https://events.mapbox.com"],
      workerSrc: ["'self'", "blob:"],
      connectSrc: [
        "'self'",
        "wss:",
        "https://api.stripe.com",
        "https://api.mapbox.com",
        "https://events.mapbox.com",
        "https://*.tiles.mapbox.com",
      ],
      frameSrc: ["https://js.stripe.com", "https://hooks.stripe.com"],
      upgradeInsecureRequests: [],
    },
  } : false,
  crossOriginEmbedderPolicy: false,
}));

const allowedOrigins = env.NODE_ENV === "production" 
  ? (process.env.ALLOWED_ORIGINS?.split(",") || []) 
  : ["http://localhost:5000", "http://127.0.0.1:5000"];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || env.NODE_ENV !== "production") {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));

app.use(express.json({
  limit: "10mb",
  verify: (req, _res, buf) => {
    // Preserve the raw body so the Stripe webhook route can verify its signature;
    // Stripe's constructEvent requires the exact bytes, not the re-serialized JSON.
    (req as express.Request).rawBody = buf;
  },
}));
app.use(express.urlencoded({ extended: false, limit: "10mb" }));

const pgSessionStore = new PgSession({
  conString: env.DATABASE_URL,
  tableName: "session",
  createTableIfMissing: true,
  pruneSessionInterval: 86400, // seconds; prune expired sessions once a day
});
pgSessionStore.on("error", (err) => {
  console.error("Session store error:", err.message);
});

const sessionMiddleware = session({
  store: pgSessionStore,
  secret: env.SESSION_SECRET || "point2point-secret-key",
  resave: false,
  saveUninitialized: false,
  cookie: {
    // "auto" (not a static NODE_ENV check) sets the Secure flag per-request from req.secure,
    // which respects `trust proxy` above. A static `NODE_ENV === "production"` check marks the
    // cookie Secure unconditionally in production, which browsers/clients silently refuse to
    // store or send back over any connection that isn't HTTPS at the app itself - breaking
    // login completely behind a plain-HTTP health check, a TCP-passthrough load balancer, or
    // any direct-HTTP access to the production build (confirmed: login previously returned 200
    // but set no usable cookie at all when running `npm start` over plain HTTP).
    secure: "auto",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  },
});

app.use(sessionMiddleware);
app.set('sessionMiddleware', sessionMiddleware);

app.use(passport.initialize());
app.use(passport.session());

// Keyed by authenticated user (falling back to IP for anonymous requests) so legitimate
// concurrent users behind a shared corporate/carrier-grade NAT don't share one IP-wide
// budget; this must run after passport.session() so req.user is populated.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user as { id?: string } | undefined)?.id || ipKeyGenerator(req.ip || "unknown"),
});

app.use("/api", apiLimiter);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

app.use("/partner/v1", partnerApi);
app.use("/api/road-services", roadServicesRouter);
app.use("/road-services/partner/v1", roadServicesPartnerApi);

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    if (status >= 500) {
      console.error("Server error:", {
        method: req.method,
        path: req.path,
        error: err.message,
        stack: env.NODE_ENV === "development" ? err.stack : undefined,
      });
    }

    res.status(status).json({ 
      message,
      ...(env.NODE_ENV === "development" && { stack: err.stack }),
    });
  });

  // Setup WebSocket server for real-time messaging and tracking
  setupWebSocket(app, server, storage);
  log("WebSocket server initialized at /ws");

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`${signal} received: draining connections and shutting down`);

    // Force-exit if graceful drain hangs (e.g. a stuck WebSocket connection).
    const forceExitTimer = setTimeout(() => {
      console.error("Graceful shutdown timed out; forcing exit");
      process.exit(1);
    }, 10_000);
    forceExitTimer.unref();

    server.close(async (err) => {
      if (err) console.error("Error while closing HTTP server:", err);
      try {
        await pool.end();
      } catch (poolErr) {
        console.error("Error closing DB pool:", poolErr);
      }
      clearTimeout(forceExitTimer);
      process.exit(err ? 1 : 0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
})();
