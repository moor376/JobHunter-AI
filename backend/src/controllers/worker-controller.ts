import type { RequestHandler } from "express";
import { jobPollingWorker } from "../services/worker/job-polling-worker.js";
import { asyncHandler } from "../utils/async-handler.js";

export const getWorkerStatus: RequestHandler = asyncHandler(
  async (_request, response) => {
    const status = jobPollingWorker.getStatus();
    response.status(200).json({
      data: status,
    });
  },
);

export const postWorkerRun: RequestHandler = asyncHandler(
  async (_request, response) => {
    const stats = await jobPollingWorker.runOnce("MANUAL");
    response.status(200).json({
      data: stats,
      message: `Job worker polling cycle completed. Ingested ${stats.newJobsCreated} new jobs, evaluated ${stats.matchesEvaluated} matches, created ${stats.applicationsCreated} applications, approved ${stats.applicationsApprovedCount} drafts, and sent ${stats.applicationsSentCount} emails.`,
    });
  },
);

export const postWorkerEnable: RequestHandler = asyncHandler(
  async (_request, response) => {
    const status = jobPollingWorker.enable();
    response.status(200).json({
      data: status,
      message: "Autonomous Job Hunter scheduler has been enabled.",
    });
  },
);

export const postWorkerDisable: RequestHandler = asyncHandler(
  async (_request, response) => {
    const status = jobPollingWorker.disable();
    response.status(200).json({
      data: status,
      message: "Autonomous Job Hunter scheduler has been disabled.",
    });
  },
);

export const postWorkerConfigure: RequestHandler = asyncHandler(
  async (request, response) => {
    const status = jobPollingWorker.configure(request.body);
    response.status(200).json({
      data: status,
      message: "Autonomous Job Hunter configuration updated successfully.",
    });
  },
);
