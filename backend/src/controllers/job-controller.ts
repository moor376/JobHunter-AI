import type { RequestHandler } from "express";
import {
  evaluateCandidateJobMatch,
  getRankedJobsForCandidate,
} from "../services/ai-matching-service.js";
import {
  createJob,
  getJobById,
  ingestJobsFromSource,
  listJobs,
  type CreateJobInput,
} from "../services/job-service.js";
import { asyncHandler } from "../utils/async-handler.js";
import { getParam } from "../utils/params.js";

export const getRankedJobs: RequestHandler = asyncHandler(
  async (request, response) => {
    const candidateId =
      typeof request.query.candidateId === "string"
        ? request.query.candidateId
        : "c1000000-0000-0000-0000-000000000001";
    const tier = typeof request.query.tier === "string" ? (request.query.tier as any) : undefined;
    const limit = typeof request.query.limit === "string" ? parseInt(request.query.limit, 10) : undefined;

    const ranked = await getRankedJobsForCandidate(candidateId, { tierFilter: tier, limit });
    response.status(200).json({
      data: ranked,
      total: ranked.length,
    });
  },
);

export const getJobs: RequestHandler = asyncHandler(
  async (request, response) => {
    const {
      search,
      status,
      location,
      employmentType,
      jobSourceId,
      companyId,
      category,
    } = request.query;

    const jobs = await listJobs({
      search: typeof search === "string" ? search : undefined,
      status: typeof status === "string" ? (status as any) : undefined,
      location: typeof location === "string" ? location : undefined,
      employmentType: typeof employmentType === "string" ? (employmentType as any) : undefined,
      jobSourceId: typeof jobSourceId === "string" ? jobSourceId : undefined,
      companyId: typeof companyId === "string" ? companyId : undefined,
      category: typeof category === "string" ? category : undefined,
    });

    response.status(200).json({
      data: jobs,
      total: jobs.length,
    });
  },
);

export const getJob: RequestHandler = asyncHandler(
  async (request, response) => {
    const job = await getJobById(getParam(request.params.id));
    response.status(200).json({
      data: job,
    });
  },
);

export const postJob: RequestHandler = asyncHandler(
  async (request, response) => {
    const job = await createJob(request.body as CreateJobInput);
    response.status(201).json({
      data: job,
    });
  },
);

export const postIngest: RequestHandler = asyncHandler(
  async (request, response) => {
    const { sourceId } = request.body;
    const result = await ingestJobsFromSource(sourceId);
    const msg =
      result.status === "SOURCE_NOT_CONFIGURED"
        ? `Source '${result.sourceName}' is not configured: ${result.missingConfig}`
        : `Ingestion from ${result.sourceName} complete: ${result.ingestedCount} new jobs added, ${result.duplicatesSkipped} duplicates skipped.`;

    response.status(200).json({
      data: result,
      message: msg,
    });
  },
);

export const postMatchJob: RequestHandler = asyncHandler(
  async (request, response) => {
    const { candidateId, resumeId } = request.body;
    const result = await evaluateCandidateJobMatch(
      candidateId,
      getParam(request.params.id),
      resumeId,
    );
    response.status(200).json({
      data: result,
      message: "Job/CV compatibility evaluation completed successfully.",
    });
  },
);
