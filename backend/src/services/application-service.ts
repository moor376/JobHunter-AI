import { randomUUID } from "node:crypto";
import { prisma } from "../config/prisma.js";
import {
  ApplicationChannel,
  ApplicationStatus,
  EmailEventType,
  type ApplicationRecord,
  isDbConnected,
  isValidUuid,
  memoryStore,
} from "../store/db-store.js";
import { AppError } from "../utils/app-error.js";
import { createAuditLog } from "./audit-service.js";
import { getCandidateById, getResumeById, listResumes } from "./candidate-service.js";
import { generateApplicationEmail, recordEmailEvent } from "./email-service.js";
import { getJobById } from "./job-service.js";

export interface CreateApplicationInput {
  candidateId: string;
  channel?: ApplicationChannel;
  jobId: string;
  resumeId?: string;
}

export interface ApplicationFilterParams {
  candidateId?: string;
  jobId?: string;
  status?: ApplicationStatus;
}

export async function listApplications(
  filters: ApplicationFilterParams = {},
): Promise<ApplicationRecord[]> {
  if (await isDbConnected()) {
    const where: any = {};
    if (filters.candidateId) where.candidateId = filters.candidateId;
    if (filters.jobId) where.jobId = filters.jobId;
    if (filters.status) where.status = filters.status;
    const apps = await prisma.application.findMany({
      where,
      include: {
        candidate: true,
        job: { include: { company: true, jobSource: true } },
        resume: true,
        selectedGeneratedEmail: true,
        generatedEmails: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return apps as ApplicationRecord[];
  }

  let apps = Array.from(memoryStore.applications.values());

  if (filters.candidateId) {
    apps = apps.filter((a) => a.candidateId === filters.candidateId);
  }

  if (filters.status) {
    apps = apps.filter((a) => a.status === filters.status);
  }

  if (filters.jobId) {
    apps = apps.filter((a) => a.jobId === filters.jobId);
  }

  return apps
    .map((app) => ({
      ...app,
      candidate: memoryStore.candidates.get(app.candidateId),
      job: memoryStore.jobs.get(app.jobId)
        ? {
            ...memoryStore.jobs.get(app.jobId)!,
            company: memoryStore.companies.get(memoryStore.jobs.get(app.jobId)!.companyId),
          }
        : undefined,
      resume: app.resumeId ? memoryStore.resumes.get(app.resumeId) : null,
      selectedGeneratedEmail: app.selectedGeneratedEmailId
        ? memoryStore.generatedEmails.get(app.selectedGeneratedEmailId)
        : null,
      generatedEmails: Array.from(memoryStore.generatedEmails.values()).filter(
        (g) => g.applicationId === app.id,
      ),
    }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getApplicationById(id: string): Promise<ApplicationRecord> {
  if (isValidUuid(id) && (await isDbConnected())) {
    const app = await prisma.application.findUnique({
      where: { id },
      include: {
        candidate: true,
        job: { include: { company: true, jobSource: true } },
        resume: true,
        selectedGeneratedEmail: true,
        generatedEmails: true,
      },
    });
    if (app) return app as ApplicationRecord;
  }

  const app = memoryStore.applications.get(id);
  if (!app) {
    throw new AppError(`Application with ID ${id} not found.`, 404, "APPLICATION_NOT_FOUND");
  }

  return {
    ...app,
    candidate: memoryStore.candidates.get(app.candidateId),
    job: memoryStore.jobs.get(app.jobId)
      ? {
          ...memoryStore.jobs.get(app.jobId)!,
          company: memoryStore.companies.get(memoryStore.jobs.get(app.jobId)!.companyId),
        }
      : undefined,
    resume: app.resumeId ? memoryStore.resumes.get(app.resumeId) : null,
    selectedGeneratedEmail: app.selectedGeneratedEmailId
      ? memoryStore.generatedEmails.get(app.selectedGeneratedEmailId)
      : null,
    generatedEmails: Array.from(memoryStore.generatedEmails.values()).filter(
      (g) => g.applicationId === app.id,
    ),
  };
}

export async function createApplication(
  input: CreateApplicationInput,
): Promise<ApplicationRecord> {
  const candidate = await getCandidateById(input.candidateId);
  const job = await getJobById(input.jobId);
  const channel = input.channel || ApplicationChannel.EMAIL;

  const duplicateKey = `${candidate.id}:${job.id}:${channel}`;

  if (await isDbConnected()) {
    const existing = await prisma.application.findUnique({
      where: { duplicateKey },
    });
    if (existing) {
      throw new AppError(
        "An application for this candidate and job opportunity already exists.",
        409,
        "DUPLICATE_APPLICATION",
      );
    }

    let resumeId = input.resumeId;
    let resumeVersion = 1;
    if (!resumeId) {
      const resumes = await listResumes(candidate.id);
      if (resumes.length > 0) {
        resumeId = resumes[0].id;
        resumeVersion = resumes[0].version;
      }
    } else {
      const resume = await getResumeById(resumeId);
      resumeVersion = resume.version;
    }

    const id = randomUUID();
    const now = new Date();
    const application = await prisma.application.create({
      data: {
        id,
        candidateId: candidate.id,
        jobId: job.id,
        resumeId: resumeId || null,
        resumeVersion,
        status: ApplicationStatus.DRAFT,
        channel,
        duplicateKey,
        selectedGeneratedEmailId: null,
        statusChangedAt: now,
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
    });

    memoryStore.applications.set(id, {
      ...application,
      candidate,
      job,
      resume: resumeId ? await getResumeById(resumeId) : null,
      selectedGeneratedEmail: null,
      generatedEmails: [],
    } as ApplicationRecord);

    await createAuditLog({
      candidateId: candidate.id,
      action: "APPLICATION_CREATED",
      resourceType: "Application",
      resourceId: id,
      eventType: "APPLICATION_INITIATED",
      safeMetadata: { jobId: job.id, jobTitle: job.title, channel },
    });

    try {
      await generateApplicationEmail({
        applicationId: id,
        recipientEmail: job.company?.domain ? `careers@${job.company.domain}` : undefined,
        recipientName: `${job.company?.name || "Hiring"} Team`,
      });
    } catch {
      // Draft generation can be re-attempted manually
    }

    return await getApplicationById(id);
  }

  // Duplicate Check: Prevent duplicate application for the same candidate + job + channel
  const existing = Array.from(memoryStore.applications.values()).find(
    (a) => a.duplicateKey === duplicateKey,
  );
  if (existing) {
    throw new AppError(
      "An application for this candidate and job opportunity already exists.",
      409,
      "DUPLICATE_APPLICATION",
    );
  }

  let resumeId = input.resumeId;
  let resumeVersion = 1;
  if (!resumeId) {
    const resumes = Array.from(memoryStore.resumes.values())
      .filter((r) => r.candidateId === candidate.id)
      .sort((a, b) => b.version - a.version);
    if (resumes.length > 0) {
      resumeId = resumes[0].id;
      resumeVersion = resumes[0].version;
    }
  } else {
    const resume = await getResumeById(resumeId);
    resumeVersion = resume.version;
  }

  const id = randomUUID();
  const now = new Date();
  const application: ApplicationRecord = {
    id,
    candidateId: candidate.id,
    jobId: job.id,
    resumeId: resumeId || null,
    resumeVersion,
    status: ApplicationStatus.DRAFT,
    channel,
    duplicateKey,
    selectedGeneratedEmailId: null,
    statusChangedAt: now,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  memoryStore.applications.set(id, application);

  await createAuditLog({
    candidateId: candidate.id,
    action: "APPLICATION_CREATED",
    resourceType: "Application",
    resourceId: id,
    eventType: "APPLICATION_INITIATED",
    safeMetadata: { jobId: job.id, jobTitle: job.title, channel },
  });

  // Automatically generate draft application email
  try {
    await generateApplicationEmail({
      applicationId: id,
      recipientEmail: job.company?.domain ? `careers@${job.company.domain}` : undefined,
      recipientName: `${job.company?.name || "Hiring"} Team`,
    });
  } catch (err) {
    // Draft generation can be re-attempted manually
  }

  return getApplicationById(id);
}

export async function updateApplicationStatus(
  id: string,
  newStatus: ApplicationStatus,
): Promise<ApplicationRecord> {
  const application = await getApplicationById(id);
  const beforeSummary = { status: application.status };
  const now = new Date();

  if (isValidUuid(id) && (await isDbConnected())) {
    const updated = await prisma.application.update({
      where: { id },
      data: {
        status: newStatus,
        statusChangedAt: now,
        updatedAt: now,
        version: { increment: 1 },
        approvedAt: newStatus === ApplicationStatus.APPROVED && !application.approvedAt ? now : undefined,
        sentAt: newStatus === ApplicationStatus.SENT && !application.sentAt ? now : undefined,
      },
    });

    memoryStore.applications.set(id, { ...application, ...updated } as ApplicationRecord);

    await createAuditLog({
      candidateId: application.candidateId,
      action: "APPLICATION_STATUS_UPDATED",
      resourceType: "Application",
      resourceId: id,
      eventType: `STATUS_CHANGED_TO_${newStatus}`,
      beforeSummary,
      afterSummary: { status: newStatus },
    });

    return await getApplicationById(id);
  }

  application.status = newStatus;
  application.statusChangedAt = now;
  application.updatedAt = now;
  application.version += 1;

  if (newStatus === ApplicationStatus.APPROVED && !application.approvedAt) {
    application.approvedAt = now;
  } else if (newStatus === ApplicationStatus.SENT && !application.sentAt) {
    application.sentAt = now;
  }

  memoryStore.applications.set(id, application);

  await createAuditLog({
    candidateId: application.candidateId,
    action: "APPLICATION_STATUS_UPDATED",
    resourceType: "Application",
    resourceId: id,
    eventType: `STATUS_CHANGED_TO_${newStatus}`,
    beforeSummary,
    afterSummary: { status: newStatus },
  });

  return getApplicationById(id);
}

export async function recordApplicationReply(
  id: string,
  replyDetails: { providerMessageId?: string; safeMetadata?: any },
): Promise<ApplicationRecord> {
  const app = await getApplicationById(id);

  await updateApplicationStatus(id, ApplicationStatus.REPLIED);

  await recordEmailEvent({
    applicationId: id,
    type: EmailEventType.REPLIED,
    providerMessageId: replyDetails.providerMessageId || undefined,
    safeMetadata: replyDetails.safeMetadata || { replyReceived: true },
  });

  await createAuditLog({
    candidateId: app.candidateId,
    action: "REPLY_RECEIVED",
    resourceType: "Application",
    resourceId: id,
    eventType: "APPLICATION_REPLY_LOGGED",
    safeMetadata: replyDetails.safeMetadata,
  });

  return getApplicationById(id);
}

