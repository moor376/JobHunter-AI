import type { RequestHandler } from "express";
import {
  getEmailProviderStatus,
  getGoogleOAuthUrl,
  handleGoogleOAuthCallback,
  listEmailAccounts,
  reviewGeneratedEmail,
} from "../services/email-service.js";
import { asyncHandler } from "../utils/async-handler.js";
import { getParam } from "../utils/params.js";

export const getEmailAccounts: RequestHandler = asyncHandler(
  async (request, response) => {
    const { candidateId } = request.query;
    const accounts = await listEmailAccounts(
      typeof candidateId === "string" ? candidateId : undefined,
    );
    response.status(200).json({
      data: accounts,
    });
  },
);

export const getOAuthUrl: RequestHandler = asyncHandler(
  async (request, response) => {
    const { candidateId, redirectUri } = request.query;
    const oauth = getGoogleOAuthUrl(
      typeof candidateId === "string" ? candidateId : undefined,
      typeof redirectUri === "string" ? redirectUri : undefined,
    );
    response.status(200).json({
      data: oauth,
    });
  },
);

export const getProviderStatus: RequestHandler = asyncHandler(
  async (_request, response) => {
    const status = getEmailProviderStatus();
    response.status(200).json({
      data: status,
    });
  },
);

export const postOAuthCallback: RequestHandler = asyncHandler(
  async (request, response) => {
    const { code, state, candidateId } = request.body;
    const account = await handleGoogleOAuthCallback(code, state, candidateId);
    response.status(201).json({
      data: account,
      message: "Gmail OAuth account successfully linked.",
    });
  },
);

export const postReviewEmail: RequestHandler = asyncHandler(
  async (request, response) => {
    const { decision, notes } = request.body;
    const email = await reviewGeneratedEmail(getParam(request.params.id), decision, notes);
    response.status(200).json({
      data: email,
      message: `Generated email review status updated to ${decision}.`,
    });
  },
);
