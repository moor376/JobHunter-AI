import { createHash, randomUUID } from "node:crypto";
import { prisma } from "../config/prisma.js";
import {
  ConsentStatus,
  ResumeParseStatus,
  ResumeSource,
  type CandidateRecord,
  type ResumeRecord,
  isDbConnected,
  isValidUuid,
  memoryStore,
} from "../store/db-store.js";
import { AppError } from "../utils/app-error.js";
import { getAIProvider } from "./ai/ai-provider.js";
import { createAuditLog } from "./audit-service.js";
import { extractTextFromResumeFile } from "./resume-parser/resume-file-parser.js";

export type CreateCandidateInput = {
  consentGrantedAt?: Date;
  consentStatus?: ConsentStatus;
  email: string;
  firstName: string;
  lastName: string;
  location?: string;
  phone?: string;
  profileSummary?: string;
  targetRoles?: string[];
};

export type UpdateCandidateInput = Partial<CreateCandidateInput> & {
  isActive?: boolean;
};

export type CreateResumeInput = {
  fileBase64?: string;
  mimeType?: string;
  originalFilename?: string;
  rawContent?: string;
  source?: ResumeSource;
};

export async function listCandidates(): Promise<CandidateRecord[]> {
  if (await isDbConnected()) {
    return await prisma.candidate.findMany({
      orderBy: { createdAt: "desc" },
    });
  }
  return Array.from(memoryStore.candidates.values()).sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
}

export async function getCandidateById(id: string): Promise<CandidateRecord> {
  if (isValidUuid(id) && (await isDbConnected())) {
    const candidate = await prisma.candidate.findUnique({ where: { id } });
    if (candidate) return candidate;
  }
  const candidate = memoryStore.candidates.get(id);
  if (!candidate) {
    throw new AppError(`Candidate with ID ${id} not found.`, 404, "CANDIDATE_NOT_FOUND");
  }
  return candidate;
}

export async function createCandidate(input: CreateCandidateInput): Promise<CandidateRecord> {
  const normalizedEmail = input.email.toLowerCase();
  const id = randomUUID();
  const now = new Date();

  if (await isDbConnected()) {
    const existing = await prisma.candidate.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      throw new AppError(
        "A candidate with this email address already exists.",
        409,
        "DUPLICATE_CANDIDATE",
      );
    }

    const candidate = await prisma.candidate.create({
      data: {
        id,
        email: normalizedEmail,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone || null,
        location: input.location || null,
        profileSummary: input.profileSummary || null,
        targetRoles: input.targetRoles || [],
        consentStatus: input.consentStatus || ConsentStatus.PENDING,
        consentGrantedAt:
          input.consentGrantedAt ||
          (input.consentStatus === ConsentStatus.GRANTED ? now : null),
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    });

    memoryStore.candidates.set(id, candidate);

    await createAuditLog({
      candidateId: id,
      actorType: "USER" as any,
      actorId: "system",
      action: "CANDIDATE_CREATED",
      resourceType: "Candidate",
      resourceId: id,
      eventType: "CANDIDATE_REGISTERED",
      safeMetadata: { email: candidate.email },
    });

    return candidate;
  }

  const existing = Array.from(memoryStore.candidates.values()).find(
    (c) => c.email.toLowerCase() === normalizedEmail,
  );
  if (existing) {
    throw new AppError(
      "A candidate with this email address already exists.",
      409,
      "DUPLICATE_CANDIDATE",
    );
  }

  const candidate: CandidateRecord = {
    id,
    email: normalizedEmail,
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone || null,
    location: input.location || null,
    profileSummary: input.profileSummary || null,
    targetRoles: input.targetRoles || [],
    consentStatus: input.consentStatus || ConsentStatus.PENDING,
    consentGrantedAt:
      input.consentGrantedAt ||
      (input.consentStatus === ConsentStatus.GRANTED ? now : null),
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  memoryStore.candidates.set(id, candidate);

  await createAuditLog({
    candidateId: id,
    actorType: "USER" as any,
    actorId: "system",
    action: "CANDIDATE_CREATED",
    resourceType: "Candidate",
    resourceId: id,
    eventType: "CANDIDATE_REGISTERED",
    safeMetadata: { email: candidate.email },
  });

  return candidate;
}

export async function updateCandidate(
  id: string,
  input: UpdateCandidateInput,
): Promise<CandidateRecord> {
  const candidate = await getCandidateById(id);
  const beforeSummary = { ...candidate };
  const now = new Date();

  if (input.email && input.email.toLowerCase() !== candidate.email) {
    const checkEmail = input.email.toLowerCase();
    if (await isDbConnected()) {
      const existing = await prisma.candidate.findFirst({
        where: { email: checkEmail, NOT: { id } },
      });
      if (existing) {
        throw new AppError("Email is already taken by another candidate.", 409, "DUPLICATE_EMAIL");
      }
    } else {
      const existing = Array.from(memoryStore.candidates.values()).find(
        (c) => c.email.toLowerCase() === checkEmail && c.id !== id,
      );
      if (existing) {
        throw new AppError("Email is already taken by another candidate.", 409, "DUPLICATE_EMAIL");
      }
    }
  }

  let consentGrantedAt = candidate.consentGrantedAt;
  if (input.consentStatus === ConsentStatus.GRANTED && !candidate.consentGrantedAt) {
    consentGrantedAt = input.consentGrantedAt || now;
  }

  if (await isDbConnected()) {
    const updated = await prisma.candidate.update({
      where: { id },
      data: {
        email: input.email ? input.email.toLowerCase() : undefined,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        location: input.location,
        profileSummary: input.profileSummary,
        targetRoles: input.targetRoles,
        isActive: input.isActive,
        consentStatus: input.consentStatus,
        consentGrantedAt,
        updatedAt: now,
      },
    });

    memoryStore.candidates.set(id, updated);

    await createAuditLog({
      candidateId: id,
      actorType: "USER" as any,
      actorId: "system",
      action: "CANDIDATE_UPDATED",
      resourceType: "Candidate",
      resourceId: id,
      eventType: "CANDIDATE_PROFILE_MODIFIED",
      beforeSummary,
      afterSummary: updated,
    });

    return updated;
  }

  if (input.email) candidate.email = input.email.toLowerCase();
  if (input.firstName !== undefined) candidate.firstName = input.firstName;
  if (input.lastName !== undefined) candidate.lastName = input.lastName;
  if (input.phone !== undefined) candidate.phone = input.phone;
  if (input.location !== undefined) candidate.location = input.location;
  if (input.profileSummary !== undefined) candidate.profileSummary = input.profileSummary;
  if (input.targetRoles !== undefined) candidate.targetRoles = input.targetRoles;
  if (input.isActive !== undefined) candidate.isActive = input.isActive;
  if (input.consentStatus !== undefined) {
    candidate.consentStatus = input.consentStatus;
    candidate.consentGrantedAt = consentGrantedAt;
  }
  candidate.updatedAt = now;
  memoryStore.candidates.set(id, candidate);

  await createAuditLog({
    candidateId: id,
    actorType: "USER" as any,
    actorId: "system",
    action: "CANDIDATE_UPDATED",
    resourceType: "Candidate",
    resourceId: id,
    eventType: "CANDIDATE_PROFILE_MODIFIED",
    beforeSummary,
    afterSummary: candidate,
  });

  return candidate;
}

export async function listResumes(candidateId: string): Promise<ResumeRecord[]> {
  await getCandidateById(candidateId);
  if (await isDbConnected()) {
    return (await prisma.resume.findMany({
      where: { candidateId },
      orderBy: { version: "desc" },
    })) as ResumeRecord[];
  }
  return Array.from(memoryStore.resumes.values())
    .filter((r) => r.candidateId === candidateId)
    .sort((a, b) => b.version - a.version);
}

export async function getResumeById(resumeId: string): Promise<ResumeRecord> {
  if (isValidUuid(resumeId) && (await isDbConnected())) {
    const resume = await prisma.resume.findUnique({ where: { id: resumeId } });
    if (resume) return resume as ResumeRecord;
  }
  const resume = memoryStore.resumes.get(resumeId);
  if (!resume) {
    throw new AppError(`Resume with ID ${resumeId} not found.`, 404, "RESUME_NOT_FOUND");
  }
  return resume;
}

export async function createResume(
  candidateId: string,
  input: CreateResumeInput,
): Promise<ResumeRecord> {
  const candidate = await getCandidateById(candidateId);

  let rawText = "";
  let detectedMime = "text/plain";
  let finalFilename = input.originalFilename || "resume.txt";
  let rawLength = 0;
  let metadata: Record<string, unknown> = {};

  if (input.fileBase64) {
    const buffer = Buffer.from(input.fileBase64, "base64");
    const extracted = await extractTextFromResumeFile({
      buffer,
      filename: input.originalFilename,
      declaredMimeType: input.mimeType,
    });
    rawText = extracted.text;
    detectedMime = extracted.mimeType;
    finalFilename = extracted.sanitizedFilename;
    rawLength = extracted.rawLength;
    metadata = extracted.metadata || {};
  } else if (input.rawContent) {
    const buffer = Buffer.from(input.rawContent, "utf-8");
    const extracted = await extractTextFromResumeFile({
      buffer,
      filename: input.originalFilename || "resume.txt",
      declaredMimeType: input.mimeType || "text/plain",
    });
    rawText = extracted.text;
    detectedMime = extracted.mimeType;
    finalFilename = extracted.sanitizedFilename;
    rawLength = extracted.rawLength;
  } else {
    rawText = candidate.profileSummary || "Candidate Profile";
    rawLength = rawText.length;
  }

  const checksum = createHash("sha256").update(rawText).digest("hex");

  if (await isDbConnected()) {
    const existingWithChecksum = await prisma.resume.findFirst({
      where: { candidateId, checksum },
    });
    if (existingWithChecksum) {
      return existingWithChecksum as ResumeRecord;
    }
  } else {
    const existingWithChecksum = Array.from(memoryStore.resumes.values()).find(
      (r) => r.candidateId === candidateId && r.checksum === checksum,
    );
    if (existingWithChecksum) {
      return existingWithChecksum;
    }
  }

  const existingResumes = await listResumes(candidateId);
  const nextVersion =
    existingResumes.length > 0
      ? Math.max(...existingResumes.map((r) => r.version)) + 1
      : 1;

  const id = randomUUID();
  const now = new Date();
  const fileExt =
    detectedMime === "application/pdf"
      ? "pdf"
      : detectedMime.includes("word")
      ? "docx"
      : "txt";
  const resumeData: ResumeRecord = {
    id,
    candidateId,
    version: nextVersion,
    privateStorageKey: `resumes/${candidateId}/v${nextVersion}-${id.slice(0, 8)}.${fileExt}`,
    checksum,
    originalFilename: finalFilename,
    source: input.source || ResumeSource.USER_UPLOAD,
    parseStatus: ResumeParseStatus.PENDING,
    sourceMetadata: {
      contentLength: rawLength,
      mimeType: detectedMime,
      ...metadata,
    },
    createdAt: now,
    updatedAt: now,
  };

  if (await isDbConnected()) {
    await prisma.resume.create({
      data: {
        id: resumeData.id,
        candidateId: resumeData.candidateId,
        version: resumeData.version,
        privateStorageKey: resumeData.privateStorageKey,
        checksum: resumeData.checksum,
        originalFilename: resumeData.originalFilename,
        source: resumeData.source,
        parseStatus: resumeData.parseStatus,
        sourceMetadata: resumeData.sourceMetadata as any,
        createdAt: resumeData.createdAt,
        updatedAt: resumeData.updatedAt,
      },
    });
  }

  memoryStore.resumes.set(id, resumeData);

  // Automatically trigger AI parse on extracted text
  await parseResume(id, rawText);

  return await getResumeById(id);
}

export async function parseResume(
  resumeId: string,
  customRawText?: string,
): Promise<ResumeRecord> {
  const resume = await getResumeById(resumeId);
  const candidate = await getCandidateById(resume.candidateId);
  const now = new Date();

  if (await isDbConnected()) {
    await prisma.resume.update({
      where: { id: resumeId },
      data: { parseStatus: ResumeParseStatus.PROCESSING, updatedAt: now },
    });
  } else {
    resume.parseStatus = ResumeParseStatus.PROCESSING;
    resume.updatedAt = now;
  }

  try {
    const ai = getAIProvider();
    const rawText =
      customRawText ||
      `Candidate: ${candidate.firstName} ${candidate.lastName}
Email: ${candidate.email}
Phone: ${candidate.phone || ""}
Location: ${candidate.location || ""}
Summary: ${candidate.profileSummary || ""}
Target Roles: ${candidate.targetRoles.join(", ")}`;

    const parsed = await ai.parseCV(rawText);
    const parsedAt = new Date();

    if (await isDbConnected()) {
      const updated = await prisma.resume.update({
        where: { id: resumeId },
        data: {
          parsedData: parsed as any,
          parseStatus: ResumeParseStatus.COMPLETED,
          parsedAt,
          updatedAt: parsedAt,
        },
      });
      memoryStore.resumes.set(resumeId, updated as ResumeRecord);

      await createAuditLog({
        candidateId: candidate.id,
        actorType: "SYSTEM" as any,
        actorId: "ai-parser",
        action: "RESUME_PARSED",
        resourceType: "Resume",
        resourceId: resumeId,
        eventType: "CV_PARSE_COMPLETED",
        safeMetadata: { version: updated.version, skillsCount: parsed.skills.length },
      });

      return updated as ResumeRecord;
    }

    resume.parsedData = parsed;
    resume.parseStatus = ResumeParseStatus.COMPLETED;
    resume.parsedAt = parsedAt;
    resume.updatedAt = parsedAt;

    memoryStore.resumes.set(resumeId, resume);

    await createAuditLog({
      candidateId: candidate.id,
      actorType: "SYSTEM" as any,
      actorId: "ai-parser",
      action: "RESUME_PARSED",
      resourceType: "Resume",
      resourceId: resumeId,
      eventType: "CV_PARSE_COMPLETED",
      safeMetadata: { version: resume.version, skillsCount: parsed.skills.length },
    });

    return resume;
  } catch (err) {
    if (await isDbConnected()) {
      await prisma.resume.update({
        where: { id: resumeId },
        data: { parseStatus: ResumeParseStatus.FAILED, updatedAt: new Date() },
      });
    }
    resume.parseStatus = ResumeParseStatus.FAILED;
    resume.updatedAt = new Date();
    memoryStore.resumes.set(resumeId, resume);
    throw new AppError("Failed to parse resume content.", 500, "RESUME_PARSE_FAILED");
  }
}
