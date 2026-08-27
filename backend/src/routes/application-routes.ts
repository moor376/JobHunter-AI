import { Router } from "express";
import { z } from "zod";
import {
  getApplication,
  getApplications,
  getPreparedApplication,
  getPreparedApplications,
  patchApplicationStatus,
  postApplication,
  postApproveApplication,
  postApprovePrepared,
  postGenerateDraft,
  postPrepareAll,
  postRejectPrepared,
  postReplyApplication,
  postSendApplication,
  postVerifyAllFreshness,
  postVerifyFreshness,
} from "../controllers/application-controller.js";
import { validateBody } from "../middleware/validate-request.js";

const createApplicationBodySchema = z
  .object({
    candidateId: z.string().uuid(),
    jobId: z.string().uuid(),
    resumeId: z.string().uuid().optional(),
    channel: z.enum(["EMAIL", "EXTERNAL_PORTAL", "MANUAL"]).optional(),
  })
  .strict();

const updateStatusBodySchema = z
  .object({
    status: z.enum([
      "DRAFT",
      "PENDING_APPROVAL",
      "APPROVED",
      "SENDING",
      "SENT",
      "FAILED",
      "WITHDRAWN",
      "REPLIED",
    ]),
  })
  .strict();

const generateDraftBodySchema = z
  .object({
    recipientEmail: z.string().trim().email().optional(),
    recipientName: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

const approveBodySchema = z
  .object({
    notes: z.string().trim().max(1000).optional(),
  })
  .strict();

const replyBodySchema = z
  .object({
    providerMessageId: z.string().trim().optional(),
    safeMetadata: z.record(z.unknown()).optional(),
  })
  .strict();

const applicationRouter = Router();

// Prepared Applications Queue (Human Gate & Freshness Gate)
applicationRouter.get("/prepared", getPreparedApplications);
applicationRouter.post("/prepared/verify-all-freshness", postVerifyAllFreshness);
applicationRouter.get("/prepared/:id", getPreparedApplication);
applicationRouter.post("/prepared/:id/approve", postApprovePrepared);
applicationRouter.post("/prepared/:id/reject", postRejectPrepared);
applicationRouter.post("/prepared/:id/verify-freshness", postVerifyFreshness);
applicationRouter.post("/prepare-all", postPrepareAll);

// Standard Application Lifecycle
applicationRouter.get("/", getApplications);
applicationRouter.post("/", validateBody(createApplicationBodySchema), postApplication);
applicationRouter.get("/:id", getApplication);
applicationRouter.patch("/:id/status", validateBody(updateStatusBodySchema), patchApplicationStatus);
applicationRouter.post("/:id/generate-draft", validateBody(generateDraftBodySchema), postGenerateDraft);
applicationRouter.post("/:id/approve", validateBody(approveBodySchema), postApproveApplication);
applicationRouter.post("/:id/send", postSendApplication);
applicationRouter.post("/:id/reply", validateBody(replyBodySchema), postReplyApplication);

export { applicationRouter };
