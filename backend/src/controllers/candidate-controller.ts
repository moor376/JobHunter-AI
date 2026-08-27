import type { RequestHandler } from "express";
import {
  createCandidate,
  createResume,
  getCandidateById,
  getResumeById,
  listCandidates,
  listResumes,
  parseResume,
  updateCandidate,
  type CreateCandidateInput,
  type UpdateCandidateInput,
} from "../services/candidate-service.js";
import { asyncHandler } from "../utils/async-handler.js";
import { getParam } from "../utils/params.js";

export const getCandidates: RequestHandler = asyncHandler(
  async (_request, response) => {
    const candidates = await listCandidates();
    response.status(200).json({
      data: candidates,
    });
  },
);

export const getCandidate: RequestHandler = asyncHandler(
  async (request, response) => {
    const candidate = await getCandidateById(getParam(request.params.id));
    response.status(200).json({
      data: candidate,
    });
  },
);

export const postCandidate: RequestHandler = asyncHandler(
  async (request, response) => {
    const candidate = await createCandidate(request.body as CreateCandidateInput);
    response.status(201).json({
      data: candidate,
    });
  },
);

export const putCandidate: RequestHandler = asyncHandler(
  async (request, response) => {
    const candidate = await updateCandidate(
      getParam(request.params.id),
      request.body as UpdateCandidateInput,
    );
    response.status(200).json({
      data: candidate,
    });
  },
);

export const postConsent: RequestHandler = asyncHandler(
  async (request, response) => {
    const { consentStatus, consentGrantedAt } = request.body;
    const candidate = await updateCandidate(getParam(request.params.id), {
      consentStatus,
      consentGrantedAt: consentGrantedAt ? new Date(consentGrantedAt) : new Date(),
    });
    response.status(200).json({
      data: candidate,
      message: `Candidate consent updated to ${consentStatus}.`,
    });
  },
);

export const getResumes: RequestHandler = asyncHandler(
  async (request, response) => {
    const resumes = await listResumes(getParam(request.params.id));
    response.status(200).json({
      data: resumes,
    });
  },
);

export const postResume: RequestHandler = asyncHandler(
  async (request, response) => {
    const { originalFilename, rawContent, fileBase64, mimeType, source } = request.body;
    const resume = await createResume(getParam(request.params.id), {
      originalFilename,
      rawContent,
      fileBase64,
      mimeType,
      source,
    });
    response.status(201).json({
      data: resume,
    });
  },
);

export const getResume: RequestHandler = asyncHandler(
  async (request, response) => {
    const resume = await getResumeById(getParam(request.params.resumeId));
    response.status(200).json({
      data: resume,
    });
  },
);

export const postParseResume: RequestHandler = asyncHandler(
  async (request, response) => {
    const { customRawText } = request.body || {};
    const resume = await parseResume(getParam(request.params.resumeId), customRawText);
    response.status(200).json({
      data: resume,
      message: "Resume successfully parsed into structured candidate profile.",
    });
  },
);
