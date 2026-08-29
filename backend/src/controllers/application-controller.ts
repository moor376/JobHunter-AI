import type { RequestHandler } from "express";
import {
  createApplication,
  getApplicationById,
  listApplications,
  recordApplicationReply,
  updateApplicationStatus,
  type CreateApplicationInput,
} from "../services/application-service.js";
import {
  generateApplicationEmail,
  reviewGeneratedEmail,
  sendApplicationEmail,
} from "../services/email-service.js";
import {
  approvePreparedApplication,
  getPreparedApplicationById,
  listPreparedApplications,
  prepareAllEligibleApplications,
  rejectPreparedApplication,
} from "../services/application-preparation-service.js";
import {
  verifyAllPreparedFreshness,
  verifyApplicationFreshness,
} from "../services/job-freshness-service.js";
import { asyncHandler } from "../utils/async-handler.js";
import { getParam } from "../utils/params.js";

export const getApplications: RequestHandler = asyncHandler(
  async (request, response) => {
    const { candidateId, status, jobId } = request.query;
    const applications = await listApplications({
      candidateId: typeof candidateId === "string" ? candidateId : undefined,
      status: typeof status === "string" ? (status as any) : undefined,
      jobId: typeof jobId === "string" ? jobId : undefined,
    });

    response.status(200).json({
      data: applications,
      total: applications.length,
    });
  },
);

export const getApplication: RequestHandler = asyncHandler(
  async (request, response) => {
    const application = await getApplicationById(getParam(request.params.id));
    response.status(200).json({
      data: application,
    });
  },
);

export const postApplication: RequestHandler = asyncHandler(
  async (request, response) => {
    const application = await createApplication(request.body as CreateApplicationInput);
    response.status(201).json({
      data: application,
      message: "Application successfully created and draft email initiated.",
    });
  },
);

export const patchApplicationStatus: RequestHandler = asyncHandler(
  async (request, response) => {
    const { status } = request.body;
    const application = await updateApplicationStatus(getParam(request.params.id), status);
    response.status(200).json({
      data: application,
      message: `Application status updated to ${status}.`,
    });
  },
);

export const postGenerateDraft: RequestHandler = asyncHandler(
  async (request, response) => {
    const { recipientEmail, recipientName } = request.body || {};
    const email = await generateApplicationEmail({
      applicationId: getParam(request.params.id),
      recipientEmail,
      recipientName,
    });
    response.status(200).json({
      data: email,
      message: "Personalized application email draft successfully generated.",
    });
  },
);

export const postApproveApplication: RequestHandler = asyncHandler(
  async (request, response) => {
    const { notes } = request.body || {};
    const app = await getApplicationById(getParam(request.params.id));
    if (!app.selectedGeneratedEmailId) {
      response.status(400).json({ error: { message: "No draft email to approve." } });
      return;
    }

    const reviewed = await reviewGeneratedEmail(
      app.selectedGeneratedEmailId,
      "APPROVED",
      notes,
    );
    const updatedApp = await getApplicationById(getParam(request.params.id));

    response.status(200).json({
      data: {
        application: updatedApp,
        email: reviewed,
      },
      message: "Application and generated draft email have been APPROVED for sending.",
    });
  },
);

export const postSendApplication: RequestHandler = asyncHandler(
  async (request, response) => {
    const result = await sendApplicationEmail(getParam(request.params.id));
    response.status(200).json({
      data: result,
      message: result.message,
    });
  },
);

export const postReplyApplication: RequestHandler = asyncHandler(
  async (request, response) => {
    const { providerMessageId, safeMetadata } = request.body || {};
    const app = await recordApplicationReply(getParam(request.params.id), {
      providerMessageId,
      safeMetadata,
    });
    response.status(200).json({
      data: app,
      message: "Application reply recorded and status updated to REPLIED.",
    });
  },
);

export const getPreparedApplications: RequestHandler = asyncHandler(
  async (request, response) => {
    const { candidateId, priorityTier, status, limit } = request.query;
    const items = await listPreparedApplications({
      candidateId: typeof candidateId === "string" ? candidateId : undefined,
      priorityTier: typeof priorityTier === "string" ? priorityTier : undefined,
      status: typeof status === "string" ? (status as any) : undefined,
      limit: typeof limit === "string" ? parseInt(limit, 10) : undefined,
    });
    response.status(200).json({
      data: items,
      total: items.length,
    });
  },
);

export const getPreparedApplication: RequestHandler = asyncHandler(
  async (request, response) => {
    const item = await getPreparedApplicationById(getParam(request.params.id));
    response.status(200).json({ data: item });
  },
);

export const postApprovePrepared: RequestHandler = asyncHandler(
  async (request, response) => {
    const { forceApprove, skipFreshnessCheck, notes } = request.body || {};
    const item = await approvePreparedApplication(getParam(request.params.id), {
      forceApprove: typeof forceApprove === "boolean" ? forceApprove : undefined,
      skipFreshnessCheck: typeof skipFreshnessCheck === "boolean" ? skipFreshnessCheck : undefined,
      notes: typeof notes === "string" ? notes : undefined,
    });
    response.status(200).json({
      data: item,
      message: "Application preparation package has been APPROVED. (No automatic email sent).",
    });
  },
);

export const postRejectPrepared: RequestHandler = asyncHandler(
  async (request, response) => {
    const { reason } = request.body || {};
    const item = await rejectPreparedApplication(
      getParam(request.params.id),
      typeof reason === "string" ? reason : undefined,
    );
    response.status(200).json({
      data: item,
      message: "Application preparation package has been REJECTED.",
    });
  },
);

export const postPrepareAll: RequestHandler = asyncHandler(
  async (request, response) => {
    const { candidateId } = request.body || {};
    const summary = await prepareAllEligibleApplications(
      typeof candidateId === "string" ? candidateId : undefined,
    );
    response.status(200).json({
      data: summary,
      message: `Successfully prepared ${summary.totalPrepared} application packages for candidate.`,
    });
  },
);

export const postVerifyFreshness: RequestHandler = asyncHandler(
  async (request, response) => {
    const item = await verifyApplicationFreshness(getParam(request.params.id));
    response.status(200).json({
      data: item,
      message: `Job freshness verified: ${item.freshnessStatus} (HTTP ${item.freshnessHttpStatus || "N/A"})`,
    });
  },
);

export const postVerifyAllFreshness: RequestHandler = asyncHandler(
  async (request, response) => {
    const summary = await verifyAllPreparedFreshness();
    response.status(200).json({
      data: summary,
      message: `Freshness verified for ${summary.totalChecked} jobs: ${summary.activeCount} ACTIVE, ${summary.closedCount} CLOSED, ${summary.notFoundCount} NOT_FOUND, ${summary.blockedCount} BLOCKED, ${summary.timeoutCount} TIMEOUT`,
    });
  },
);
