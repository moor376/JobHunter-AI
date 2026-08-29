import { createHash, randomUUID } from "node:crypto";
import { prisma } from "../config/prisma.js";
import {
  ApplicationStatus,
  ConsentStatus,
  EmailAccountStatus,
  EmailEventType,
  EmailProvider,
  EmailReviewStatus,
  type EmailAccountRecord,
  type EmailEventRecord,
  type GeneratedEmailRecord,
  isDbConnected,
  isValidUuid,
  memoryStore,
} from "../store/db-store.js";
import { AppError } from "../utils/app-error.js";
import { getAIProvider, type EmailDraftResult } from "./ai/ai-provider.js";
import { createAuditLog } from "./audit-service.js";
import { getCandidateById, getResumeById, listResumes } from "./candidate-service.js";
import { getEmailProvider, getEmailProviderStatus } from "./email/email-dispatcher.js";
import { tokenStore } from "./email/token-store.js";
import { getJobById } from "./job-service.js";

export interface GenerateEmailDraftInput {
  applicationId: string;
  recipientEmail?: string;
  recipientName?: string;
}

export async function generateApplicationEmail(
  input: GenerateEmailDraftInput,
): Promise<GeneratedEmailRecord> {
  const application = await (async () => {
    if (isValidUuid(input.applicationId) && (await isDbConnected())) {
      const app = await prisma.application.findUnique({ where: { id: input.applicationId } });
      if (app) return app;
    }
    const app = memoryStore.applications.get(input.applicationId);
    if (!app) throw new AppError(`Application ${input.applicationId} not found.`, 404, "APPLICATION_NOT_FOUND");
    return app;
  })();

  const candidate = await getCandidateById(application.candidateId);
  const job = await getJobById(application.jobId);

  let targetResumeId = application.resumeId;
  if (!targetResumeId) {
    const resumes = await listResumes(candidate.id);
    if (resumes.length > 0) {
      targetResumeId = resumes[0].id;
    }
  }

  const resume = targetResumeId ? await getResumeById(targetResumeId) : null;

  const candidateFacts = {
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    email: candidate.email,
    phone: candidate.phone,
    skills: resume?.parsedData?.skills || [
      "Banking Sales",
      "Telesales",
      "Customer Relationship Management",
    ],
    workExperience: resume?.parsedData?.workExperience || [],
    education: resume?.parsedData?.education || [],
  };

  const jobDetails = {
    title: job.title,
    description: job.description,
    location: job.location,
    companyName: job.company?.name || "Hiring Team",
  };

  const companySlug = job.company?.domain || (job.company?.normalizedName?.replace(/[^a-z0-9]/g, "") || "company");
  const defaultRecipientEmail =
    input.recipientEmail ||
    (companySlug.includes(".") ? `careers@${companySlug}` : `careers@${companySlug}.com`);
  const defaultRecipientName = input.recipientName || `${job.company?.name || "Hiring"} Team`;

  const ai = getAIProvider();
  const draftResult: EmailDraftResult = await ai.generateEmailDraft(candidateFacts, jobDetails, {
    email: defaultRecipientEmail,
    name: defaultRecipientName,
  });

  const contentHash = createHash("sha256")
    .update(`${draftResult.subject}|${draftResult.body}`)
    .digest("hex");

  const emailId = randomUUID();
  const now = new Date();
  const generatedEmail: GeneratedEmailRecord = {
    id: emailId,
    applicationId: application.id,
    attachmentResumeId: targetResumeId || null,
    subject: draftResult.subject,
    body: draftResult.body,
    recipientEmail: draftResult.recipientEmail,
    recipientName: draftResult.recipientName || null,
    promptVersion: draftResult.promptVersion,
    reviewStatus: EmailReviewStatus.PENDING_REVIEW,
    contentHash,
    generationProvenance: {
      modelProvider: draftResult.modelProvider,
      keyHighlights: draftResult.keyHighlights,
      citationReferences: draftResult.citationReferences,
    },
    createdAt: now,
    updatedAt: now,
  };

  if (isValidUuid(application.id) && (await isDbConnected())) {
    try {
      await prisma.generatedEmail.create({
        data: {
          id: generatedEmail.id,
          applicationId: generatedEmail.applicationId,
          attachmentResumeId: isValidUuid(generatedEmail.attachmentResumeId) ? generatedEmail.attachmentResumeId : null,
          subject: generatedEmail.subject,
          body: generatedEmail.body,
          recipientEmail: generatedEmail.recipientEmail,
          recipientName: generatedEmail.recipientName,
          promptVersion: generatedEmail.promptVersion,
          reviewStatus: generatedEmail.reviewStatus,
          contentHash: generatedEmail.contentHash,
          generationProvenance: generatedEmail.generationProvenance as any,
          createdAt: now,
          updatedAt: now,
        },
      });

      await prisma.application.update({
        where: { id: application.id },
        data: {
          selectedGeneratedEmailId: emailId,
          status: ApplicationStatus.PENDING_APPROVAL,
          updatedAt: now,
        },
      });
    } catch {
      // Safe fallback
    }
  }

  memoryStore.generatedEmails.set(emailId, generatedEmail);

  // Link to application in memory
  const memApp = memoryStore.applications.get(application.id);
  if (memApp) {
    memApp.selectedGeneratedEmailId = emailId;
    memApp.status = ApplicationStatus.PENDING_APPROVAL;
    memApp.updatedAt = now;
    memoryStore.applications.set(application.id, memApp);
  }

  // Record Draft Created Event
  await recordEmailEvent({
    applicationId: application.id,
    generatedEmailId: emailId,
    type: EmailEventType.DRAFT_CREATED,
    safeMetadata: { subject: generatedEmail.subject, recipient: generatedEmail.recipientEmail },
  });

  await createAuditLog({
    candidateId: candidate.id,
    action: "EMAIL_DRAFT_GENERATED",
    resourceType: "GeneratedEmail",
    resourceId: emailId,
    eventType: "EMAIL_CREATED",
    safeMetadata: { applicationId: application.id, subject: generatedEmail.subject },
  });

  return generatedEmail;
}

export async function reviewGeneratedEmail(
  emailId: string,
  decision: "APPROVED" | "REJECTED",
  reviewerNotes?: string,
): Promise<GeneratedEmailRecord> {
  const now = new Date();

  if (isValidUuid(emailId) && (await isDbConnected())) {
    const email = await prisma.generatedEmail.findUnique({ where: { id: emailId } });
    if (email) {
      if (decision === "APPROVED") {
        const updated = await prisma.generatedEmail.update({
          where: { id: emailId },
          data: {
            reviewStatus: EmailReviewStatus.APPROVED,
            approvedAt: now,
            reviewedAt: now,
            updatedAt: now,
          },
        });

        if (isValidUuid(email.applicationId)) {
          await prisma.application.update({
            where: { id: email.applicationId },
            data: {
              status: ApplicationStatus.APPROVED,
              approvedAt: now,
              updatedAt: now,
            },
          });
        }

        await recordEmailEvent({
          applicationId: email.applicationId,
          generatedEmailId: email.id,
          type: EmailEventType.APPROVED,
          safeMetadata: { notes: reviewerNotes || "Approved by reviewer" },
        });

        memoryStore.generatedEmails.set(emailId, updated as GeneratedEmailRecord);
        const memApp = memoryStore.applications.get(email.applicationId);
        if (memApp) {
          memApp.status = ApplicationStatus.APPROVED;
          memApp.approvedAt = now;
          memApp.updatedAt = now;
          memoryStore.applications.set(email.applicationId, memApp);
        }

        await createAuditLog({
          action: "EMAIL_REVIEW_DECIDED",
          resourceType: "GeneratedEmail",
          resourceId: emailId,
          eventType: `EMAIL_${decision}`,
          safeMetadata: { decision, notes: reviewerNotes },
        });

        return updated as GeneratedEmailRecord;
      } else {
        const updated = await prisma.generatedEmail.update({
          where: { id: emailId },
          data: {
            reviewStatus: EmailReviewStatus.REJECTED,
            reviewedAt: now,
            updatedAt: now,
          },
        });

        if (isValidUuid(email.applicationId)) {
          await prisma.application.update({
            where: { id: email.applicationId },
            data: {
              status: ApplicationStatus.DRAFT,
              updatedAt: now,
            },
          });
        }

        memoryStore.generatedEmails.set(emailId, updated as GeneratedEmailRecord);
        const memApp = memoryStore.applications.get(email.applicationId);
        if (memApp) {
          memApp.status = ApplicationStatus.DRAFT;
          memApp.updatedAt = now;
          memoryStore.applications.set(email.applicationId, memApp);
        }

        await createAuditLog({
          action: "EMAIL_REVIEW_DECIDED",
          resourceType: "GeneratedEmail",
          resourceId: emailId,
          eventType: `EMAIL_${decision}`,
          safeMetadata: { decision, notes: reviewerNotes },
        });

        return updated as GeneratedEmailRecord;
      }
    }
  }

  const email = memoryStore.generatedEmails.get(emailId);
  if (!email) {
    throw new AppError(`Generated email ${emailId} not found.`, 404, "EMAIL_NOT_FOUND");
  }

  const application = memoryStore.applications.get(email.applicationId);

  if (decision === "APPROVED") {
    email.reviewStatus = EmailReviewStatus.APPROVED;
    email.approvedAt = now;
    email.reviewedAt = now;

    if (application) {
      application.status = ApplicationStatus.APPROVED;
      application.approvedAt = now;
      application.updatedAt = now;
      memoryStore.applications.set(application.id, application);
    }

    await recordEmailEvent({
      applicationId: email.applicationId,
      generatedEmailId: email.id,
      type: EmailEventType.APPROVED,
      safeMetadata: { notes: reviewerNotes || "Approved by reviewer" },
    });
  } else {
    email.reviewStatus = EmailReviewStatus.REJECTED;
    email.reviewedAt = now;

    if (application) {
      application.status = ApplicationStatus.DRAFT;
      application.updatedAt = now;
      memoryStore.applications.set(application.id, application);
    }
  }

  email.updatedAt = now;
  memoryStore.generatedEmails.set(emailId, email);

  await createAuditLog({
    action: "EMAIL_REVIEW_DECIDED",
    resourceType: "GeneratedEmail",
    resourceId: emailId,
    eventType: `EMAIL_${decision}`,
    safeMetadata: { decision, notes: reviewerNotes },
  });

  return email;
}

export async function sendApplicationEmail(applicationId: string): Promise<{
  event: EmailEventRecord;
  message: string;
  sentAt: Date;
  status: ApplicationStatus;
}> {
  const application = await (async () => {
    if (isValidUuid(applicationId) && (await isDbConnected())) {
      const app = await prisma.application.findUnique({ where: { id: applicationId } });
      if (app) return app;
    }
    const app = memoryStore.applications.get(applicationId);
    if (!app) throw new AppError(`Application ${applicationId} not found.`, 404, "APPLICATION_NOT_FOUND");
    return app;
  })();

  const candidate = await getCandidateById(application.candidateId);

  // Security Gate 1: Candidate Consent Must be GRANTED
  if (candidate.consentStatus !== ConsentStatus.GRANTED) {
    throw new AppError(
      "Cannot send application: Candidate has not granted explicit consent.",
      403,
      "CONSENT_REQUIRED",
    );
  }

  // Security Gate 2: Must have an approved generated email
  if (!application.selectedGeneratedEmailId) {
    throw new AppError("No generated email attached to application.", 400, "EMAIL_MISSING");
  }

  const email = await (async () => {
    if (isValidUuid(application.selectedGeneratedEmailId) && (await isDbConnected())) {
      const em = await prisma.generatedEmail.findUnique({ where: { id: application.selectedGeneratedEmailId! } });
      if (em) return em;
    }
    return memoryStore.generatedEmails.get(application.selectedGeneratedEmailId!);
  })();

  if (!email || email.reviewStatus !== EmailReviewStatus.APPROVED) {
    throw new AppError(
      "Cannot send application: Email must be reviewed and explicitly APPROVED first.",
      400,
      "EMAIL_NOT_APPROVED",
    );
  }

  // Security Gate 3: Duplicate Send Prevention
  if (application.status === ApplicationStatus.SENT) {
    throw new AppError(
      "Application has already been sent. Duplicate delivery is prevented.",
      409,
      "APPLICATION_ALREADY_SENT",
    );
  }

  const now = new Date();
  if (isValidUuid(applicationId) && (await isDbConnected())) {
    await prisma.application.update({
      where: { id: applicationId },
      data: { status: ApplicationStatus.SENDING, updatedAt: now },
    });
  }
  application.status = ApplicationStatus.SENDING;
  memoryStore.applications.set(application.id, application as any);

  // Log Send Attempt
  await recordEmailEvent({
    applicationId: application.id,
    generatedEmailId: email.id,
    type: EmailEventType.SEND_ATTEMPTED,
    safeMetadata: { recipient: email.recipientEmail, subject: email.subject },
  });

  try {
    const provider = getEmailProvider();
    const tokenRef = `secret://oauth/gmail/${candidate.id}`;
    let tokens = await tokenStore.getTokens(tokenRef);

    // If tokens exist and are expired, attempt refresh
    if (tokens?.refreshToken && tokens.expiresAt.getTime() < Date.now() + 60_000) {
      try {
        const refreshed = await provider.refreshAccessToken(tokens.refreshToken);
        await tokenStore.saveTokens(tokenRef, refreshed);
        tokens = refreshed;
      } catch {
        // Continue with existing token or let provider handle
      }
    }

    const deliveryResult = await provider.sendEmail(
      {
        to: email.recipientEmail,
        subject: email.subject,
        body: email.body,
        candidateId: candidate.id,
      },
      tokens || undefined,
    );

    if (isValidUuid(applicationId) && (await isDbConnected())) {
      await prisma.application.update({
        where: { id: applicationId },
        data: { status: ApplicationStatus.SENT, sentAt: now, updatedAt: now },
      });
    }

    application.status = ApplicationStatus.SENT;
    application.sentAt = now;
    application.updatedAt = now;
    memoryStore.applications.set(application.id, application as any);

    const sentEvent = await recordEmailEvent({
      applicationId: application.id,
      generatedEmailId: email.id,
      type: EmailEventType.SENT,
      providerMessageId: deliveryResult.providerMessageId,
      providerThreadId: deliveryResult.providerThreadId,
      safeMetadata: {
        recipient: email.recipientEmail,
        deliveredThrough: deliveryResult.deliveredThrough,
        timestamp: now.toISOString(),
      },
    });

    await createAuditLog({
      candidateId: candidate.id,
      action: "EMAIL_SENT_SUCCESSFULLY",
      resourceType: "Application",
      resourceId: application.id,
      eventType: "APPLICATION_SENT",
      safeMetadata: {
        recipient: email.recipientEmail,
        providerMessageId: deliveryResult.providerMessageId,
        sentAt: now.toISOString(),
      },
    });

    return {
      status: ApplicationStatus.SENT,
      sentAt: now,
      message: `Application email successfully delivered to ${email.recipientEmail}.`,
      event: sentEvent,
    };
  } catch (err: unknown) {
    if (isValidUuid(applicationId) && (await isDbConnected())) {
      await prisma.application.update({
        where: { id: applicationId },
        data: { status: ApplicationStatus.FAILED, updatedAt: now },
      });
    }
    application.status = ApplicationStatus.FAILED;
    application.updatedAt = now;
    memoryStore.applications.set(application.id, application as any);

    const errorMessage = err instanceof Error ? err.message : "Failed to dispatch email.";
    await recordEmailEvent({
      applicationId: application.id,
      generatedEmailId: email.id,
      type: EmailEventType.FAILED,
      errorCode: "EMAIL_DELIVERY_FAILED",
      safeMetadata: { recipient: email.recipientEmail, error: errorMessage },
    });

    if (err instanceof AppError) throw err;
    throw new AppError(`Delivery failed: ${errorMessage}`, 500, "EMAIL_DELIVERY_ERROR");
  }
}

export async function recordEmailEvent(input: {
  applicationId: string;
  emailAccountId?: string;
  errorCode?: string;
  generatedEmailId?: string;
  providerMessageId?: string;
  providerThreadId?: string;
  safeMetadata?: any;
  type: EmailEventType;
}): Promise<EmailEventRecord> {
  const id = randomUUID();
  const now = new Date();
  const event: EmailEventRecord = {
    id,
    applicationId: input.applicationId,
    emailAccountId: input.emailAccountId || null,
    generatedEmailId: input.generatedEmailId || null,
    type: input.type,
    providerMessageId: input.providerMessageId || null,
    providerThreadId: input.providerThreadId || null,
    errorCode: input.errorCode || null,
    safeMetadata: input.safeMetadata || null,
    occurredAt: now,
    createdAt: now,
  };

  if (await isDbConnected()) {
    try {
      await prisma.emailEvent.create({
        data: {
          id: event.id,
          applicationId: event.applicationId,
          emailAccountId: event.emailAccountId,
          generatedEmailId: event.generatedEmailId,
          type: event.type,
          providerMessageId: event.providerMessageId,
          providerThreadId: event.providerThreadId,
          errorCode: event.errorCode,
          safeMetadata: event.safeMetadata as any,
          occurredAt: event.occurredAt,
          createdAt: event.createdAt,
        },
      });
    } catch {
      // Safe fallback
    }
  }

  memoryStore.emailEvents.set(id, event);
  return event;
}

export async function listEmailAccounts(candidateId?: string): Promise<EmailAccountRecord[]> {
  if (await isDbConnected()) {
    return (await prisma.emailAccount.findMany({
      where: candidateId ? { candidateId } : undefined,
    })) as EmailAccountRecord[];
  }
  const accounts = Array.from(memoryStore.emailAccounts.values());
  if (candidateId) {
    return accounts.filter((a) => a.candidateId === candidateId);
  }
  return accounts;
}

export function getGoogleOAuthUrl(candidateId?: string, redirectUri?: string) {
  const provider = getEmailProvider();
  const effectiveCandidateId =
    candidateId || Array.from(memoryStore.candidates.values())[0]?.id || randomUUID();
  return provider.getAuthorizationUrl(effectiveCandidateId, redirectUri);
}

export async function handleGoogleOAuthCallback(
  code: string,
  state: string,
  candidateId: string,
): Promise<EmailAccountRecord> {
  const candidate = await getCandidateById(candidateId);
  const provider = getEmailProvider();

  // Exchange code for tokens
  const tokenPayload = await provider.exchangeAuthorizationCode(code, state, candidate.id);

  // Store tokens in encrypted vault
  const tokenSecretReference = `secret://oauth/gmail/${candidate.id}`;
  await tokenStore.saveTokens(tokenSecretReference, tokenPayload);

  let existingAccount: any = null;
  if (await isDbConnected()) {
    existingAccount = await prisma.emailAccount.findFirst({
      where: { candidateId: candidate.id, provider: EmailProvider.GMAIL },
    });
  } else {
    existingAccount = Array.from(memoryStore.emailAccounts.values()).find(
      (a) => a.candidateId === candidate.id && a.provider === EmailProvider.GMAIL,
    );
  }

  const now = new Date();
  const accountId = existingAccount ? existingAccount.id : randomUUID();

  const account: EmailAccountRecord = {
    id: accountId,
    candidateId: candidate.id,
    provider: EmailProvider.GMAIL,
    emailAddress: candidate.email,
    tokenSecretReference,
    scopes: [tokenPayload.scope],
    tokenExpiresAt: tokenPayload.expiresAt,
    status: EmailAccountStatus.ACTIVE,
    consentGrantedAt: candidate.consentGrantedAt || now,
    lastUsedAt: now,
    createdAt: existingAccount ? existingAccount.createdAt : now,
    updatedAt: now,
  };

  if (await isDbConnected()) {
    await prisma.emailAccount.upsert({
      where: { id: accountId },
      update: {
        tokenSecretReference,
        scopes: account.scopes,
        tokenExpiresAt: account.tokenExpiresAt,
        status: account.status,
        lastUsedAt: now,
        updatedAt: now,
      },
      create: {
        id: account.id,
        candidateId: account.candidateId,
        provider: account.provider,
        emailAddress: account.emailAddress,
        tokenSecretReference: account.tokenSecretReference,
        scopes: account.scopes,
        tokenExpiresAt: account.tokenExpiresAt,
        status: account.status,
        consentGrantedAt: account.consentGrantedAt,
        lastUsedAt: account.lastUsedAt,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      },
    });
  }

  memoryStore.emailAccounts.set(accountId, account);

  await createAuditLog({
    candidateId: candidate.id,
    action: "GMAIL_OAUTH_CONNECTED",
    resourceType: "EmailAccount",
    resourceId: accountId,
    eventType: "ACCOUNT_LINKED",
    safeMetadata: {
      emailAddress: account.emailAddress,
      provider: "GMAIL",
      mode: getEmailProviderStatus().mode,
    },
  });

  return account;
}

export { getEmailProviderStatus };

