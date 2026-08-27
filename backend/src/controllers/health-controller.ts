import type { RequestHandler } from "express";
import { isDbConnected } from "../store/db-store.js";
import { validateStartupConfiguration } from "../config/env.js";

export const getHealth: RequestHandler = async (_request, response) => {
  const dbConnected = await isDbConnected();
  const isProduction = process.env.NODE_ENV === "production";
  const configReport = validateStartupConfiguration();

  const dbStatus = dbConnected
    ? "connected"
    : isProduction
    ? "disconnected"
    : "in-memory-fallback";

  const overallStatus = isProduction && !dbConnected ? "degraded" : "ok";

  response.status(200).json({
    data: {
      database: dbStatus,
      service: "jobhunter-ai-backend",
      status: overallStatus,
      timestamp: new Date().toISOString(),
      configuration: configReport,
    },
  });
};
