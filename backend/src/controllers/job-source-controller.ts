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
