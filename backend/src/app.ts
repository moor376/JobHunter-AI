import path from "node:path";
import fs from "node:fs";
import express, { type Express } from "express";

import { corsMiddleware } from "./middleware/cors.js";
import {
  errorHandler,
  notFoundHandler,
} from "./middleware/error-handler.js";
import { rateLimiter } from "./middleware/rate-limiter.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { apiRouter } from "./routes/api-routes.js";

function getStaticDir(): string | null {
  const possiblePaths = [
    path.resolve(process.cwd(), "public"),
    path.resolve(process.cwd(), "dist/public"),
    path.resolve(process.cwd(), "../frontend/out"),
    path.resolve(process.cwd(), "frontend/out"),
    path.resolve(process.cwd(), "../public"),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p) && fs.existsSync(path.join(p, "index.html"))) {
      return p;
    }
  }

  return null;
}

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(corsMiddleware);
  app.use(requestIdMiddleware);
  app.use(rateLimiter({ maxRequests: 200, windowMs: 60 * 1000 }));
  app.use(express.json({ limit: "5mb", strict: true }));

  // API router handles all /api/* routes
  app.use("/api", apiRouter);

  // Serve static frontend assets if available
  const staticDir = getStaticDir();
  if (staticDir) {
    app.use(express.static(staticDir));

    // Handle frontend routes for non-API GET requests (Express 5 compatible)
    app.use((req, res, next) => {
      if (req.method === "GET" && !req.path.startsWith("/api")) {
        return res.sendFile(path.join(staticDir, "index.html"));
      }
      next();
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
