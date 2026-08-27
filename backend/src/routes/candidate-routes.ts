import { Router } from "express";
import { z } from "zod";
import {
  getCandidate,
  getCandidates,
  getResume,
  getResumes,
  postCandidate,
  postConsent,
  postParseResume,
  postResume,
  putCandidate,
} from "../controllers/candidate-controller.js";
import { validateBody } from "../middleware/validate-request.js";

const optionalText = (maximumLength: number) =>
  z.string().trim().min(1).max(maximumLength).optional();

const createCandidateBodySchema = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),
    phone: optionalText(50),
    location: optionalText(200),
    profileSummary: optionalText(5_000),
    targetRoles: z
      .array(z.string().trim().min(1).max(150))
      .max(20)
      .default([]),
    consentStatus: z.enum(["PENDING", "GRANTED", "REVOKED"]).default("PENDING"),
    consentGrantedAt: z.coerce.date().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.consentStatus === "GRANTED" && !value.consentGrantedAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "consentGrantedAt is required when consentStatus is GRANTED.",
        path: ["consentGrantedAt"],
      });
    }
  });

const updateCandidateBodySchema = z
  .object({
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    email: z.string().trim().email().max(254).optional(),
    phone: optionalText(50),
    location: optionalText(200),
    profileSummary: optionalText(5_000),
    targetRoles: z.array(z.string().trim().min(1).max(150)).max(20).optional(),
    isActive: z.boolean().optional(),
    consentStatus: z.enum(["PENDING", "GRANTED", "REVOKED"]).optional(),
    consentGrantedAt: z.coerce.date().optional(),
  })
  .strict();

const consentBodySchema = z
  .object({
    consentStatus: z.enum(["PENDING", "GRANTED", "REVOKED"]),
    consentGrantedAt: z.coerce.date().optional(),
  })
  .strict();

const createResumeBodySchema = z
  .object({
    originalFilename: z.string().trim().min(1).max(255).optional(),
    rawContent: z.string().min(1).max(1_000_000).optional(),
    fileBase64: z.string().min(1).max(10_000_000).optional(),
    mimeType: z.string().trim().min(1).max(150).optional(),
    source: z.enum(["USER_UPLOAD", "IMPORT", "MANUAL_ENTRY"]).optional(),
  })
  .strict();

const candidateRouter = Router();

candidateRouter.get("/", getCandidates);
candidateRouter.post("/", validateBody(createCandidateBodySchema), postCandidate);
candidateRouter.get("/:id", getCandidate);
candidateRouter.put("/:id", validateBody(updateCandidateBodySchema), putCandidate);
candidateRouter.post("/:id/consent", validateBody(consentBodySchema), postConsent);

// Resumes
candidateRouter.get("/:id/resumes", getResumes);
candidateRouter.post("/:id/resumes", validateBody(createResumeBodySchema), postResume);
candidateRouter.get("/:id/resumes/:resumeId", getResume);
candidateRouter.post("/:id/resumes/:resumeId/parse", postParseResume);

export { candidateRouter };
