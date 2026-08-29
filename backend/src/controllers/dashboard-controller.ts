import type { RequestHandler } from "express";
import { getDashboardSummary } from "../services/dashboard-service.js";
import { asyncHandler } from "../utils/async-handler.js";

export const getDashboard: RequestHandler = asyncHandler(
  async (_request, response) => {
    const summary = await getDashboardSummary();
    response.status(200).json({
      data: summary,
      message: "Dashboard summary retrieved successfully.",
    });
  },
);
