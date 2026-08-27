import { Router } from "express";
import { z } from "zod";
import {
  getJob,
  getJobs,
  getRankedJobs,
  postIngest,
  postJob,
  postMatchJob,
} from "../controllers/job-controller.js";
import { validateBody } from "../middleware/validate-request.js";

const createJobBodySchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(50_000),
    companyName: z.string().trim().min(1).max(150),
    companyWebsiteUrl: z.string().trim().url().optional(),
    location: z.string().trim().min(1).max(200).optional(),
    employmentType: z
      .enum([
        "FULL_TIME",
        "PART_TIME",
        "CONTRACT",
        "TEMPORARY",
        "INTERNSHIP",
        "FREELANCE",
        "OTHER",
      ])
      .optional(),
    jobSourceId: z.string().uuid(),
    sourceUrl: z.string().trim().url().optional(),
    externalJobId: z.string().trim().min(1).max(100).optional(),
    canonicalUrl: z.string().trim().url().optional(),
    postedAt: z.coerce.date().optional(),
    rawReferenceMetadata: z.record(z.unknown()).optional(),
  })
  .strict();

const ingestBodySchema = z
  .object({
    sourceId: z.string().uuid(),
  })
  .strict();

const matchJobBodySchema = z
  .object({
    candidateId: z.string().uuid(),
    resumeId: z.string().uuid().optional(),
  })
  .strict();

const jobRouter = Router();

jobRouter.get("/", getJobs);
jobRouter.get("/ranked", getRankedJobs);
jobRouter.post("/", validateBody(createJobBodySchema), postJob);
jobRouter.post("/ingest", validateBody(ingestBodySchema), postIngest);
jobRouter.get("/:id", getJob);
jobRouter.post("/:id/match", validateBody(matchJobBodySchema), postMatchJob);

export { jobRouter };
