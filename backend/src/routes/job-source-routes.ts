import { Router } from "express";
import { z } from "zod";
import {
  getJobSource,
  getJobSources,
  patchJobSource,
  postJobSource,
  toggleJobSource,
} from "../controllers/job-source-controller.js";
import { validateBody } from "../middleware/validate-request.js";

const createJobSourceBodySchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    type: z.enum(["OFFICIAL_API", "JOB_BOARD", "RSS_FEED", "CAREERS_PAGE", "MANUAL"]),
    accessMethod: z.enum(["API", "FEED", "PUBLIC_PAGE", "MANUAL"]),
    externalSourceId: z.string().trim().min(1).max(100).optional(),
    baseUrl: z.string().trim().url().optional(),
    rateLimitPerMinute: z.number().int().min(1).max(1000).optional(),
    policyMetadata: z.record(z.unknown()).optional(),
  })
  .strict();

const updateJobSourceBodySchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    type: z.enum(["OFFICIAL_API", "JOB_BOARD", "RSS_FEED", "CAREERS_PAGE", "MANUAL"]).optional(),
    accessMethod: z.enum(["API", "FEED", "PUBLIC_PAGE", "MANUAL"]).optional(),
    externalSourceId: z.string().trim().min(1).max(100).optional(),
    baseUrl: z.string().trim().url().optional(),
    rateLimitPerMinute: z.number().int().min(1).max(1000).optional(),
    healthStatus: z.enum(["UNKNOWN", "HEALTHY", "DEGRADED", "DISABLED"]).optional(),
    isActive: z.boolean().optional(),
    policyMetadata: z.record(z.unknown()).optional(),
  })
  .strict();

const jobSourceRouter = Router();

jobSourceRouter.get("/", getJobSources);
jobSourceRouter.post("/", validateBody(createJobSourceBodySchema), postJobSource);
jobSourceRouter.get("/:id", getJobSource);
jobSourceRouter.patch("/:id", validateBody(updateJobSourceBodySchema), patchJobSource);
jobSourceRouter.post("/:id/toggle", toggleJobSource);

export { jobSourceRouter };
