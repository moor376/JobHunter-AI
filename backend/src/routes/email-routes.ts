import { Router } from "express";
import { z } from "zod";
import {
  getEmailAccounts,
  getOAuthUrl,
  getProviderStatus,
  postOAuthCallback,
  postReviewEmail,
} from "../controllers/email-controller.js";
import { validateBody } from "../middleware/validate-request.js";

const oauthCallbackBodySchema = z
  .object({
    code: z.string().trim().min(1),
    state: z.string().trim().min(1),
    candidateId: z.string().uuid(),
  })
  .strict();

const reviewEmailBodySchema = z
  .object({
    decision: z.enum(["APPROVED", "REJECTED"]),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict();

const emailRouter = Router();

emailRouter.get("/status", getProviderStatus);
emailRouter.get("/accounts", getEmailAccounts);
emailRouter.get("/oauth-url", getOAuthUrl);
emailRouter.post("/callback", validateBody(oauthCallbackBodySchema), postOAuthCallback);
emailRouter.post("/reviews/:id", validateBody(reviewEmailBodySchema), postReviewEmail);

export { emailRouter };
