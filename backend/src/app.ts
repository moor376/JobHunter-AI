import express, { type Express } from "express";

import { corsMiddleware } from "./middleware/cors.js";
import {
  errorHandler,
  notFoundHandler,
} from "./middleware/error-handler.js";
import { rateLimiter } from "./middleware/rate-limiter.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { apiRouter } from "./routes/api-routes.js";

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(corsMiddleware);
  app.use(requestIdMiddleware);
  app.use(rateLimiter({ maxRequests: 200, windowMs: 60 * 1000 }));
  app.use(express.json({ limit: "5mb", strict: true }));
  app.use("/api", apiRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
