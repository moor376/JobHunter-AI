import type { NextFunction, Request, RequestHandler, Response } from "express";
import { loadEnvironment } from "../config/env.js";

export const corsMiddleware: RequestHandler = (
  request: Request,
  response: Response,
  next: NextFunction,
) => {
  const env = loadEnvironment();
  const allowedOrigins = (env.CORS_ORIGIN || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  const requestOrigin = request.headers.origin;

  if (requestOrigin && (allowedOrigins.includes(requestOrigin) || allowedOrigins.includes("*"))) {
    response.setHeader("Access-Control-Allow-Origin", requestOrigin);
  } else if (!requestOrigin) {
    response.setHeader("Access-Control-Allow-Origin", "*");
  }

  response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  response.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Request-ID, X-Requested-With",
  );
  response.setHeader("Access-Control-Allow-Credentials", "true");

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  next();
};
