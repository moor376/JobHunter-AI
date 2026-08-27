import {
  ConsentStatus,
  ResumeParseStatus,
  ResumeSource,
  JobSourceType,
  JobSourceAccessMethod,
  JobSourceHealthStatus,
  JobStatus,
  EmploymentType,
  ApplicationStatus,
  ApplicationChannel,
  EmailReviewStatus,
  EmailProvider,
  EmailAccountStatus,
  EmailEventType,
  AIAnalysisType,
  AIAnalysisStatus,
  ReviewDecision,
  AuditActorType,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "../config/prisma.js";
import { logError } from "../utils/logger.js";

export {
  ConsentStatus,
  ResumeParseStatus,
  ResumeSource,
  JobSourceType,
  JobSourceAccessMethod,
  JobSourceHealthStatus,
  JobStatus,
  EmploymentType,
  ApplicationStatus,
  ApplicationChannel,
  EmailReviewStatus,
  EmailProvider,
  EmailAccountStatus,
  EmailEventType,
  AIAnalysisType,
  AIAnalysisStatus,
  ReviewDecision,
  AuditActorType,
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(id: string | null | undefined): boolean {
  if (!id || typeof id !== "string") return false;
  return UUID_REGEX.test(id);
}

export interface CandidateRecord {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  location?: string | null;
  profileSummary?: string | null;
  targetRoles: string[];
  consentStatus: ConsentStatus;
  consentGrantedAt?: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResumeRecord {
  id: string;
  candidateId: string;
  version: number;
  privateStorageKey: string;
  checksum: string;
  originalFilename?: string | null;
  source: ResumeSource;
  parseStatus: ResumeParseStatus;
  parsedData?: any | null;
  sourceMetadata?: any | null;
  parsedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompanyRecord {
  id: string;
  name: string;
  normalizedName: string;
  websiteUrl?: string | null;
  domain?: string | null;
  location?: string | null;
  metadata?: any | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobSourceRecord {
  id: string;
  name: string;
  type: JobSourceType;
  accessMethod: JobSourceAccessMethod;
  externalSourceId?: string | null;
  baseUrl?: string | null;
  rateLimitPerMinute?: number | null;
  healthStatus: JobSourceHealthStatus;
  isActive: boolean;
  policyMetadata?: any | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobRecord {
  id: string;
  companyId: string;
  jobSourceId: string;
  title: string;
  description: string;
  location?: string | null;
  employmentType?: EmploymentType | null;
  sourceUrl?: string | null;
  externalJobId?: string | null;
  canonicalUrl?: string | null;
  discoveryUrl?: string | null;
  discoveryProviders?: string[];
  sourceProvider?: string | null;
  employerUrl?: string | null;
  employerDomain?: string | null;
  originalEmployerUrl?: string | null;
  originalEmployerDomain?: string | null;
  atsProvider?: string | null;
  atsUrl?: string | null;
  atsConfidence?: AttributionConfidence | null;
  applicationUrl?: string | null;
  attributionConfidence?: AttributionConfidence | null;
  attributionSource?: string | null;
  contentHash?: string | null;
  categories?: string[];
  status: JobStatus;
  postedAt?: Date | null;
  seenAt: Date;
  rawReferenceMetadata?: any | null;
  createdAt: Date;
  updatedAt: Date;
  company?: CompanyRecord;
  jobSource?: JobSourceRecord;
}

export interface GeneratedEmailRecord {
  id: string;
  applicationId: string;
  attachmentResumeId?: string | null;
  aiAnalysisId?: string | null;
  subject: string;
  body: string;
  recipientEmail: string;
  recipientName?: string | null;
  promptVersion?: string | null;
  reviewStatus: EmailReviewStatus;
  contentHash: string;
  generationProvenance?: any | null;
  reviewedAt?: Date | null;
  approvedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApplicationRecord {
  id: string;
  candidateId: string;
  jobId: string;
  resumeId?: string | null;
  resumeVersion?: number | null;
  status: ApplicationStatus;
  channel: ApplicationChannel;
  duplicateKey: string;
  selectedGeneratedEmailId?: string | null;
  approvedAt?: Date | null;
  sentAt?: Date | null;
  statusChangedAt: Date;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  candidate?: CandidateRecord;
  job?: JobRecord;
  resume?: ResumeRecord | null;
  selectedGeneratedEmail?: GeneratedEmailRecord | null;
  generatedEmails?: GeneratedEmailRecord[];
}

export interface EmailAccountRecord {
  id: string;
  candidateId: string;
  provider: EmailProvider;
  emailAddress: string;
  tokenSecretReference?: string | null;
  scopes: string[];
  tokenExpiresAt?: Date | null;
  status: EmailAccountStatus;
  consentGrantedAt?: Date | null;
  lastUsedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmailEventRecord {
  id: string;
  applicationId: string;
  emailAccountId?: string | null;
  generatedEmailId?: string | null;
  type: EmailEventType;
  providerMessageId?: string | null;
  providerThreadId?: string | null;
  errorCode?: string | null;
  safeMetadata?: any | null;
  occurredAt: Date;
  createdAt: Date;
}

export interface AIAnalysisRecord {
  id: string;
  candidateId?: string | null;
  resumeId?: string | null;
  jobId?: string | null;
  analysisType: AIAnalysisType;
  status: AIAnalysisStatus;
  reviewDecision: ReviewDecision;
  modelProvider?: string | null;
  modelName?: string | null;
  promptVersion?: string | null;
  inputRecordVersions?: any | null;
  structuredResult?: any | null;
  explanation?: any | null;
  matchScore?: number | null;
  reviewedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditLogRecord {
  id: string;
  candidateId?: string | null;
  actorType: AuditActorType;
  actorId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  eventType: string;
  correlationId: string;
  safeMetadata?: any | null;
  beforeSummary?: any | null;
  afterSummary?: any | null;
  occurredAt: Date;
  createdAt: Date;
}

export enum ApplicationWorkflowStatus {
  DISCOVERED = "DISCOVERED",
  ELIGIBLE = "ELIGIBLE",
  MATCHED = "MATCHED",
  PREPARING = "PREPARING",
  PREPARED = "PREPARED",
  APPLICATION_CHANNEL_VERIFIED = "APPLICATION_CHANNEL_VERIFIED",
  QUEUED_FOR_AUTOMATION = "QUEUED_FOR_AUTOMATION",
  READY = "READY",
  SUBMITTING = "SUBMITTING",
  SUBMITTED = "SUBMITTED",
  EMAIL_SENT = "EMAIL_SENT",
  MANUAL_ACTION_REQUIRED = "MANUAL_ACTION_REQUIRED",
  BLOCKED = "BLOCKED",
  FAILED = "FAILED",
  SKIPPED_DUPLICATE = "SKIPPED_DUPLICATE",
  REJECTED = "REJECTED",
}

export enum PreparationStatus {
  PREPARED = "PREPARED",
  PENDING_APPROVAL = "PENDING_APPROVAL",
  APPROVED = "APPROVED",
  MANUAL_ACTION_REQUIRED = "MANUAL_ACTION_REQUIRED",
  REJECTED = "REJECTED",
  SENT = "SENT",
  FAILED = "FAILED",
}

export enum DetectedChannel {
  COMPANY_APPLICATION_PAGE = "COMPANY_APPLICATION_PAGE",
  ATS_APPLICATION_PAGE = "ATS_APPLICATION_PAGE",
  EMAIL = "EMAIL",
  JOB_BOARD = "JOB_BOARD",
  EXTERNAL_APPLICATION = "EXTERNAL_APPLICATION",
  UNKNOWN = "UNKNOWN",
}

export enum FreshnessStatus {
  ACTIVE = "ACTIVE",
  CLOSED = "CLOSED",
  NOT_FOUND = "NOT_FOUND",
  BLOCKED = "BLOCKED",
  TIMEOUT = "TIMEOUT",
  UNKNOWN = "UNKNOWN",
  PENDING_CHECK = "PENDING_CHECK",
}

export type AttributionConfidence = "HIGH" | "MEDIUM" | "LOW" | "NONE";

export interface PreparedApplicationRecord {
  id: string;
  applicationId?: string | null;
  jobId: string;
  candidateId: string;
  priorityTier: string;
  eligibilityScore: number;
  aiMatchScore: number;
  applicationChannel: DetectedChannel;
  sourceUrl: string | null;
  canonicalUrl: string | null;
  discoveryUrl?: string | null;
  discoveryProviders?: string[];
  sourceProvider?: string | null;
  employerUrl?: string | null;
  employerDomain?: string | null;
  originalEmployerUrl?: string | null;
  originalEmployerDomain?: string | null;
  atsProvider?: string | null;
  atsUrl?: string | null;
  atsConfidence?: AttributionConfidence | null;
  applicationUrl?: string | null;
  applyUrl?: string | null;
  attributionConfidence?: AttributionConfidence | null;
  attributionSource?: string | null;
  profileEmphasis: string;
  selectedResumeId: string | null;
  generatedEmailId?: string | null;
  preparedEmail?: {
    subject: string;
    body: string;
    recipientName: string;
    recipientEmail: string;
    keyHighlights: string[];
  } | null;
  coverLetterDraft: string | null;
  preparationStatus: PreparationStatus;
  workflowStatus?: ApplicationWorkflowStatus;
  lastAction?: string | null;
  requiresManualAction: boolean;
  manualActionNotes?: string | null;
  manualActionReason?: string | null;
  submissionEvidence?: any | null;
  freshnessStatus?: FreshnessStatus | null;
  freshnessCheckedAt?: Date | null;
  freshnessHttpStatus?: number | null;
  freshnessFinalUrl?: string | null;
  freshnessReason?: string | null;
  freshnessProvider?: string | null;
  freshnessEvidence?: string | null;
  requiresManualFreshnessCheck?: boolean;
  provenance: {
    generatedFrom: string;
    source: string;
    disclaimer: string;
    emailSent: boolean;
    applicationSubmitted: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
  job?: JobRecord;
  candidate?: CandidateRecord;
}

// In-Memory Store & Authoritative Candidate Profile Seed
class MemoryStore {
  public candidates = new Map<string, CandidateRecord>();
  public resumes = new Map<string, ResumeRecord>();
  public companies = new Map<string, CompanyRecord>();
  public jobSources = new Map<string, JobSourceRecord>();
  public jobs = new Map<string, JobRecord>();
  public applications = new Map<string, ApplicationRecord>();
  public preparedApplications = new Map<string, PreparedApplicationRecord>();
  public generatedEmails = new Map<string, GeneratedEmailRecord>();
  public emailAccounts = new Map<string, EmailAccountRecord>();
  public emailEvents = new Map<string, EmailEventRecord>();
  public aiAnalyses = new Map<string, AIAnalysisRecord>();
  public auditLogs = new Map<string, AuditLogRecord>();

  constructor() {
    this.seed();
  }

  public seed() {
    // 1. Authoritative Candidate Profile: Nayera Tarek Mohamed
    const candidateId = "c1000000-0000-0000-0000-000000000001";
    const nayera: CandidateRecord = {
      id: candidateId,
      email: "tareknayera24@gmail.com",
      firstName: "Nayera",
      lastName: "Tarek Mohamed",
      location: "Roxy, Heliopolis, Cairo, Egypt",
      profileSummary:
        "Legal & Banking Sales Professional holding an LL.M of Law (Menoufia University), Diplomas in Public Law and Administrative Sciences (Very Good), and LL.B of Law (Banha University, 2019, Grade: Good). Professional experience in banking tele-sales across Attijariwafa Bank (May 2022 - Sep 2022), Al Ahli Bank of Kuwait (Oct 2022 - May 2024), ADIB Bank (Jun 2024 - Sep 2025), recruitment management at Eden Cleaning Company (Oct 2025 - Jun 2026), and legal internships at Dr. Zein El-Abdeen and Abdel Mawgood Law Offices.",
      targetRoles: [
        "Legal Affairs Specialist",
        "Legal Counsel",
        "Compliance Officer",
        "Contracts Specialist",
        "Banking Tele-sales Specialist",
        "Relationship Officer",
        "Sales Officer",
        "Recruitment Specialist",
        "HR Specialist",
      ],
      consentStatus: ConsentStatus.GRANTED,
      consentGrantedAt: new Date("2026-01-01T00:00:00.000Z"),
      isActive: true,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    this.candidates.set(candidateId, nayera);

    // 2. Authoritative Resume for Nayera Grounded Strictly in her CV
    const resumeId = "ba000000-0000-0000-0000-000000000001";
    const resume: ResumeRecord = {
      id: resumeId,
      candidateId,
      version: 1,
      privateStorageKey: "resumes/nayera-tarek-mohamed-cv-v1.pdf",
      checksum: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      originalFilename: "Nayera_Tarek_Mohamed_CV.pdf",
      source: ResumeSource.USER_UPLOAD,
      parseStatus: ResumeParseStatus.COMPLETED,
      parsedAt: new Date("2026-01-01T01:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:30:00.000Z"),
      updatedAt: new Date("2026-01-01T01:00:00.000Z"),
      parsedData: {
        firstName: "Nayera",
        lastName: "Tarek Mohamed",
        email: "tareknayera24@gmail.com",
        location: "Roxy, Heliopolis, Cairo, Egypt",
        profileSummary:
          "Legal & Banking Sales Professional holding an LL.M of Law (Menoufia University), Diplomas in Public Law and Administrative Sciences (Very Good), and LL.B of Law (Banha University, 2019, Grade: Good). Professional experience in banking tele-sales across Attijariwafa Bank (May 2022 - Sep 2022), Al Ahli Bank of Kuwait (Oct 2022 - May 2024), ADIB Bank (Jun 2024 - Sep 2025), recruitment management at Eden Cleaning Company (Oct 2025 - Jun 2026), and legal internships at Dr. Zein El-Abdeen and Abdel Mawgood Law Offices.",
        education: [
          {
            institution: "Banha University",
            degree: "LL.B of Law",
            fieldOfStudy: "Law",
            graduationYear: "2019",
            grade: "Good",
          },
          {
            institution: "Menoufia University",
            degree: "Diploma of Administrative Sciences",
            fieldOfStudy: "Administrative Sciences",
            grade: "Very Good",
          },
          {
            institution: "Menoufia University",
            degree: "Diploma of Public Law",
            fieldOfStudy: "Public Law",
            grade: "Very Good",
          },
          {
            institution: "Menoufia University",
            degree: "LL.M of Law",
            fieldOfStudy: "Law",
          },
        ],
        workExperience: [
          {
            company: "Attijariwafa Bank",
            role: "Tele-Sales Officer",
            startDate: "2022-05",
            endDate: "2022-09",
            isCurrent: false,
            highlights: [
              "Outbound sales for banking products.",
              "Client communication and target achievement.",
            ],
          },
          {
            company: "Al Ahli Bank of Kuwait",
            role: "Tele-Sales Officer",
            startDate: "2022-10",
            endDate: "2024-05",
            isCurrent: false,
            highlights: [
              "Tele-sales of retail loans and credit cards.",
              "Customer relationship management and sales performance.",
            ],
          },
          {
            company: "ADIB Bank",
            role: "Tele-Sales Officer",
            startDate: "2024-06",
            endDate: "2025-09",
            isCurrent: false,
            highlights: [
              "Outbound banking sales and customer handling.",
              "Achieving monthly sales targets.",
            ],
          },
          {
            company: "Eden Cleaning Company",
            role: "Recruitment Manager",
            startDate: "2025-10",
            endDate: "2026-06",
            isCurrent: false,
            highlights: [
              "Recruitment management and candidate screening.",
              "Talent acquisition and team coordination.",
            ],
          },
        ],
        legalExperience: [
          {
            organization: "Dr. Zein El-Abdeen Law Office",
            role: "Legal Intern",
            description: "Legal research and legal document review.",
          },
          {
            organization: "Abdel Mawgood Law Office",
            role: "Legal Intern",
            description: "Legal analysis and research support.",
          },
        ],
        skills: [
          "Strong communication and client-handling",
          "Legal research",
          "Problem-solving",
          "Decision-making",
          "Sales target achievement",
          "Teamwork",
          "Collaboration",
          "Professionalism",
          "Quality/performance commitment",
          "Time management",
          "Punctuality",
        ],
        courses: ["ICDL", "TOEFL", "Banking courses"],
        certifications: ["ICDL", "TOEFL", "Banking courses"],
        languages: ["Arabic (Native)", "English"],
      },
    };
    this.resumes.set(resumeId, resume);

    // 3. Real Job Sources Configuration
    const source1Id = "a1000000-0000-0000-0000-000000000001";
    const source2Id = "a2000000-0000-0000-0000-000000000002";
    const source3Id = "a3000000-0000-0000-0000-000000000003";

    this.jobSources.set(source1Id, {
      id: source1Id,
      name: "Jooble Real Jobs API",
      type: JobSourceType.OFFICIAL_API,
      accessMethod: JobSourceAccessMethod.API,
      externalSourceId: "jooble-api",
      baseUrl: "https://jooble.org/api",
      rateLimitPerMinute: 60,
      healthStatus: JobSourceHealthStatus.HEALTHY,
      isActive: true,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    this.jobSources.set(source2Id, {
      id: source2Id,
      name: "Adzuna Real Jobs API",
      type: JobSourceType.OFFICIAL_API,
      accessMethod: JobSourceAccessMethod.API,
      externalSourceId: "adzuna-api",
      baseUrl: "https://api.adzuna.com",
      rateLimitPerMinute: 30,
      healthStatus: JobSourceHealthStatus.HEALTHY,
      isActive: true,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    this.jobSources.set(source3Id, {
      id: source3Id,
      name: "Legitimate Careers RSS Feed",
      type: JobSourceType.RSS_FEED,
      accessMethod: JobSourceAccessMethod.FEED,
      externalSourceId: "rss-jobs-feed",
      baseUrl: "https://wuzzuf.net/feeds/all.xml",
      rateLimitPerMinute: 30,
      healthStatus: JobSourceHealthStatus.HEALTHY,
      isActive: true,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    // 4. Initial Bootstrap Audit Log
    const auditId = "aa000000-0000-0000-0000-000000000001";
    this.auditLogs.set(auditId, {
      id: auditId,
      candidateId,
      actorType: AuditActorType.SYSTEM,
      actorId: "system-bootstrap",
      action: "INITIAL_CANDIDATE_BOOTSTRAP",
      resourceType: "Candidate",
      resourceId: candidateId,
      eventType: "CANDIDATE_INITIALIZED",
      correlationId: "corr-init-001",
      safeMetadata: { candidateName: "Nayera Tarek Mohamed" },
      occurredAt: new Date("2026-01-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
  }
}

export const memoryStore = new MemoryStore();

let lastDbCheckTime = 0;
let cachedDbConnected: boolean | null = null;

export async function isDbConnected(): Promise<boolean> {
  const now = Date.now();
  if (cachedDbConnected !== null && now - lastDbCheckTime < 5000) {
    return cachedDbConnected;
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    cachedDbConnected = true;
    lastDbCheckTime = now;
    return true;
  } catch {
    cachedDbConnected = false;
    lastDbCheckTime = now;
    return false;
  }
}

export function resetDbConnectedCache(): void {
  cachedDbConnected = null;
  lastDbCheckTime = 0;
}

export function setDbConnected(status: boolean): void {
  cachedDbConnected = status;
  lastDbCheckTime = Date.now();
}

export async function seedDatabaseIfEmpty(): Promise<void> {
  try {
    const candidateCount = await prisma.candidate.count();
    if (candidateCount > 0) return;

    for (const c of memoryStore.candidates.values()) {
      await prisma.candidate.upsert({
        where: { id: c.id },
        update: {},
        create: {
          id: c.id,
          email: c.email,
          firstName: c.firstName,
          lastName: c.lastName,
          phone: c.phone,
          location: c.location,
          profileSummary: c.profileSummary,
          targetRoles: c.targetRoles,
          consentStatus: c.consentStatus,
          consentGrantedAt: c.consentGrantedAt,
          isActive: c.isActive,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        },
      });
    }

    for (const r of memoryStore.resumes.values()) {
      await prisma.resume.upsert({
        where: { id: r.id },
        update: {},
        create: {
          id: r.id,
          candidateId: r.candidateId,
          version: r.version,
          privateStorageKey: r.privateStorageKey,
          checksum: r.checksum,
          originalFilename: r.originalFilename,
          source: r.source,
          parseStatus: r.parseStatus,
          parsedData: r.parsedData,
          sourceMetadata: r.sourceMetadata,
          parsedAt: r.parsedAt,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        },
      });
    }

    for (const s of memoryStore.jobSources.values()) {
      await prisma.jobSource.upsert({
        where: { id: s.id },
        update: {},
        create: {
          id: s.id,
          name: s.name,
          type: s.type,
          accessMethod: s.accessMethod,
          externalSourceId: s.externalSourceId,
          baseUrl: s.baseUrl,
          rateLimitPerMinute: s.rateLimitPerMinute,
          healthStatus: s.healthStatus,
          isActive: s.isActive,
          policyMetadata: s.policyMetadata,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
        },
      });
    }

    for (const log of memoryStore.auditLogs.values()) {
      await prisma.auditLog.upsert({
        where: { id: log.id },
        update: {},
        create: {
          id: log.id,
          candidateId: log.candidateId,
          actorType: log.actorType,
          actorId: log.actorId,
          action: log.action,
          resourceType: log.resourceType,
          resourceId: log.resourceId,
          eventType: log.eventType,
          correlationId: log.correlationId,
          safeMetadata: log.safeMetadata,
          beforeSummary: log.beforeSummary,
          afterSummary: log.afterSummary,
          occurredAt: log.occurredAt,
          createdAt: log.createdAt,
        },
      });
    }
  } catch (error) {
    logError({
      level: "warn",
      event: "seed_database_failed",
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  }
}
