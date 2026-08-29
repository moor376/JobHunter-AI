import type { RequestHandler } from "express";
import {
  createJobSource,
  getJobSourceById,
  listJobSources,
  type CreateJobSourceInput,
} from "../services/job-source-service.js";
import { asyncHandler } from "../utils/async-handler.js";
import { getParam } from "../utils/params.js";

export const getJobSources: RequestHandler = asyncHandler(
  async (_request, response) => {
    const sources = await listJobSources();
    response.status(200).json({
      data: sources,
    });
  },
);

export const getJobSource: RequestHandler = asyncHandler(
  async (request, response) => {
    const source = await getJobSourceById(getParam(request.params.id));
    response.status(200).json({
      data: source,
    });
  },
);

export const postJobSource: RequestHandler = asyncHandler(
  async (request, response) => {
    const source = await createJobSource(request.body as CreateJobSourceInput);
    response.status(201).json({
      data: source,
    });
  },
);

export const patchJobSource: RequestHandler = asyncHandler(
  async (request, response) => {
    const { updateJobSource } = await import("../services/job-source-service.js");
    const source = await updateJobSource(getParam(request.params.id), request.body);
    response.status(200).json({
      data: source,
    });
  },
);

export const toggleJobSource: RequestHandler = asyncHandler(
  async (request, response) => {
    const { toggleJobSourceActive, getJobSourceById } = await import("../services/job-source-service.js");
    const id = getParam(request.params.id);
    const existing = await getJobSourceById(id);
    const newActiveState = typeof request.body?.isActive === "boolean" ? request.body.isActive : !existing.isActive;
    const source = await toggleJobSourceActive(id, newActiveState);
    response.status(200).json({
      data: source,
      message: `Job source '${source.name}' is now ${source.isActive ? "ACTIVE" : "DISABLED"}`,
    });
  },
);
