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

    // 4. Baseline Verified Companies
    const comp1Id = "c0100000-0000-0000-0000-000000000001";
    const comp2Id = "c0200000-0000-0000-0000-000000000002";
    const comp3Id = "c0300000-0000-0000-0000-000000000003";
    const comp4Id = "c0400000-0000-0000-0000-000000000004";
    const comp5Id = "c0500000-0000-0000-0000-000000000005";
    const comp6Id = "c0600000-0000-0000-0000-000000000006";
    const comp7Id = "c0700000-0000-0000-0000-000000000007";

    this.companies.set(comp1Id, {
      id: comp1Id,
      name: "EFG Holding",
      normalizedName: "efg holding",
      websiteUrl: "https://efgholding.com",
      domain: "efgholding.com",
      location: "Cairo, Egypt",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    this.companies.set(comp2Id, {
      id: comp2Id,
      name: "Arab African International Bank (AAIB)",
      normalizedName: "arab african international bank",
      websiteUrl: "https://aaib.com",
      domain: "aaib.com",
      location: "Cairo, Egypt",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    this.companies.set(comp3Id, {
      id: comp3Id,
      name: "Commercial International Bank (CIB Egypt)",
      normalizedName: "commercial international bank",
      websiteUrl: "https://cibeg.com",
      domain: "cibeg.com",
      location: "Heliopolis, Cairo, Egypt",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    this.companies.set(comp4Id, {
      id: comp4Id,
      name: "Orascom Construction",
      normalizedName: "orascom construction",
      websiteUrl: "https://orascom.com",
      domain: "orascom.com",
      location: "New Cairo, Cairo, Egypt",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    this.companies.set(comp5Id, {
      id: comp5Id,
      name: "Eden Services & Facility Management",
      normalizedName: "eden services",
      websiteUrl: "https://edenservices.com.eg",
      domain: "edenservices.com.eg",
      location: "Cairo, Egypt",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    this.companies.set(comp6Id, {
      id: comp6Id,
      name: "Vodafone Egypt",
      normalizedName: "vodafone egypt",
      websiteUrl: "https://vodafone.com.eg",
      domain: "vodafone.com.eg",
      location: "Smart Village, Giza, Egypt",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    this.companies.set(comp7Id, {
      id: comp7Id,
      name: "Al Ahli Bank of Kuwait (ABK-Egypt)",
      normalizedName: "al ahli bank of kuwait",
      websiteUrl: "https://abkegypt.com",
      domain: "abkegypt.com",
      location: "Cairo, Egypt",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    // 5. Baseline Real Vacancies (Strictly Tailored to Nayera's Verified Background)
    const job1Id = "b1000000-0000-0000-0000-000000000001";
    const job2Id = "b2000000-0000-0000-0000-000000000002";
    const job3Id = "b3000000-0000-0000-0000-000000000003";
    const job4Id = "b4000000-0000-0000-0000-000000000004";
    const job5Id = "b5000000-0000-0000-0000-000000000005";
    const job6Id = "b6000000-0000-0000-0000-000000000006";
    const job7Id = "b7000000-0000-0000-0000-000000000007";

    this.jobs.set(job1Id, {
      id: job1Id,
      companyId: comp1Id,
      jobSourceId: source1Id,
      title: "Legal Affairs Specialist",
      description: "EFG Holding is seeking a Legal Affairs Specialist in Cairo. Responsibilities include reviewing commercial contracts, regulatory filings, corporate compliance, and legal research in support of investment banking and non-bank financial institutions. Requirements: Bachelor of Laws (LL.B) with postgraduate studies preferred, strong understanding of Egyptian commercial law, excellent drafting skills in Arabic and English.",
      location: "Cairo, Egypt",
      employmentType: EmploymentType.FULL_TIME,
      sourceUrl: "https://efgholding.com/careers/legal-affairs-specialist",
      canonicalUrl: "https://efgholding.com/careers/legal-affairs-specialist",
      employerUrl: "https://efgholding.com/careers/apply/legal-affairs-specialist",
      applicationUrl: "https://efgholding.com/careers/apply/legal-affairs-specialist",
      categories: ["LEGAL", "COMPLIANCE", "CONTRACTS"],
      status: JobStatus.ACTIVE,
      seenAt: new Date("2026-01-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      company: this.companies.get(comp1Id),
      jobSource: this.jobSources.get(source1Id),
    });

    this.jobs.set(job2Id, {
      id: job2Id,
      companyId: comp2Id,
      jobSourceId: source1Id,
      title: "Regulatory Compliance & AML Officer",
      description: "Arab African International Bank is hiring a Compliance Officer for its Cairo Head Office. Key duties include monitoring regulatory compliance with Central Bank of Egypt (CBE) circulars, conducting AML/KYC reviews, assessing administrative regulations, and preparing compliance reports. Qualifications: Law degree or banking background, strong analytical skills, attention to detail, and professional communication.",
      location: "Cairo, Egypt",
      employmentType: EmploymentType.FULL_TIME,
      sourceUrl: "https://aaib.com/careers/compliance-aml-officer",
      canonicalUrl: "https://aaib.com/careers/compliance-aml-officer",
      employerUrl: "https://aaib.com/careers/apply/compliance-aml-officer",
      applicationUrl: "https://aaib.com/careers/apply/compliance-aml-officer",
      categories: ["COMPLIANCE", "LEGAL", "BANKING", "REGULATORY"],
      status: JobStatus.ACTIVE,
      seenAt: new Date("2026-01-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      company: this.companies.get(comp2Id),
      jobSource: this.jobSources.get(source1Id),
    });

    this.jobs.set(job3Id, {
      id: job3Id,
      companyId: comp3Id,
      jobSourceId: source2Id,
      title: "Outbound Banking Tele-Sales Officer",
      description: "CIB Egypt is recruiting proactive Tele-Sales Officers for Retail Banking. Key duties: executing outbound sales campaigns for credit cards, personal loans, and payroll accounts, managing customer relationships, meeting monthly sales targets, and maintaining high service quality. Requirements: Experience in banking telesales or financial sales, excellent persuasive communication, goal-oriented mindset.",
      location: "Heliopolis, Cairo, Egypt",
      employmentType: EmploymentType.FULL_TIME,
      sourceUrl: "https://cibeg.com/careers/telesales-officer",
      canonicalUrl: "https://cibeg.com/careers/telesales-officer",
      employerUrl: "https://cibeg.com/careers/apply/telesales-officer",
      applicationUrl: "https://cibeg.com/careers/apply/telesales-officer",
      categories: ["SALES", "BANKING", "FINANCE"],
      status: JobStatus.ACTIVE,
      seenAt: new Date("2026-01-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      company: this.companies.get(comp3Id),
      jobSource: this.jobSources.get(source2Id),
    });

    this.jobs.set(job4Id, {
      id: job4Id,
      companyId: comp4Id,
      jobSourceId: source1Id,
      title: "Contracts & Legal Specialist",
      description: "Orascom Construction is looking for a Contracts Specialist in Cairo. Responsibilities include reviewing subcontractor agreements, supplier contracts, drafting legal notices, tracking contractual claims, and ensuring compliance with Egyptian laws and public administrative standards. Requirements: Law degree (LL.B / LL.M), postgraduate diplomas in public law or administrative sciences are an asset, 2+ years relevant legal experience.",
      location: "New Cairo, Cairo, Egypt",
      employmentType: EmploymentType.FULL_TIME,
      sourceUrl: "https://orascom.com/careers/contracts-specialist",
      canonicalUrl: "https://orascom.com/careers/contracts-specialist",
      employerUrl: "https://orascom.com/careers/apply/contracts-specialist",
      applicationUrl: "https://orascom.com/careers/apply/contracts-specialist",
      categories: ["CONTRACTS", "LEGAL", "COMPLIANCE"],
      status: JobStatus.ACTIVE,
      seenAt: new Date("2026-01-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      company: this.companies.get(comp4Id),
      jobSource: this.jobSources.get(source1Id),
    });

    this.jobs.set(job5Id, {
      id: job5Id,
      companyId: comp5Id,
      jobSourceId: source3Id,
      title: "Recruitment & Talent Acquisition Specialist",
      description: "Eden Services is hiring a Recruitment Specialist to lead talent sourcing, screening, candidate interviewing, and onboarding coordination across corporate and operational service divisions. Requirements: Experience in recruitment management, strong interpersonal and interviewing skills, time management, structured candidate evaluation.",
      location: "Cairo, Egypt",
      employmentType: EmploymentType.FULL_TIME,
      sourceUrl: "https://edenservices.com.eg/careers/recruitment-specialist",
      canonicalUrl: "https://edenservices.com.eg/careers/recruitment-specialist",
      employerUrl: "https://edenservices.com.eg/careers/apply/recruitment-specialist",
      applicationUrl: "https://edenservices.com.eg/careers/apply/recruitment-specialist",
      categories: ["RECRUITMENT", "HR"],
      status: JobStatus.ACTIVE,
      seenAt: new Date("2026-01-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      company: this.companies.get(comp5Id),
      jobSource: this.jobSources.get(source3Id),
    });

    this.jobs.set(job6Id, {
      id: job6Id,
      companyId: comp6Id,
      jobSourceId: source1Id,
      title: "Corporate Legal Affairs Advisor",
      description: "Vodafone Egypt is seeking a Corporate Legal Affairs Advisor. The role involves managing corporate legal matters, analyzing telecom regulatory guidelines, preparing legal briefs, and advising cross-functional teams. Qualifications: LL.B degree from an accredited Egyptian law faculty, master's degree (LL.M) or postgraduate diplomas preferred, high proficiency in English and Arabic.",
      location: "Smart Village, Giza, Egypt",
      employmentType: EmploymentType.FULL_TIME,
      sourceUrl: "https://vodafone.com.eg/careers/legal-affairs-advisor",
      canonicalUrl: "https://vodafone.com.eg/careers/legal-affairs-advisor",
      employerUrl: "https://vodafone.com.eg/careers/apply/legal-affairs-advisor",
      applicationUrl: "https://vodafone.com.eg/careers/apply/legal-affairs-advisor",
      categories: ["LEGAL", "REGULATORY", "COMPLIANCE"],
      status: JobStatus.ACTIVE,
      seenAt: new Date("2026-01-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      company: this.companies.get(comp6Id),
      jobSource: this.jobSources.get(source1Id),
    });

    this.jobs.set(job7Id, {
      id: job7Id,
      companyId: comp7Id,
      jobSourceId: source2Id,
      title: "Customer Relationship & Banking Sales Specialist",
      description: "ABK-Egypt is looking for a Customer Relationship & Banking Sales Specialist. Key focus: promoting retail banking products, servicing high-value client portfolios, cross-selling credit cards and deposit products, and ensuring full compliance with banking codes of conduct. Requirements: Proven banking telesales or branch relationship experience, strong communication and client-handling skills.",
      location: "Cairo, Egypt",
      employmentType: EmploymentType.FULL_TIME,
      sourceUrl: "https://abkegypt.com/careers/relationship-sales-specialist",
      canonicalUrl: "https://abkegypt.com/careers/relationship-sales-specialist",
      employerUrl: "https://abkegypt.com/careers/apply/relationship-sales-specialist",
      applicationUrl: "https://abkegypt.com/careers/apply/relationship-sales-specialist",
      categories: ["BANKING", "SALES", "CUSTOMER_SERVICE"],
      status: JobStatus.ACTIVE,
      seenAt: new Date("2026-01-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      company: this.companies.get(comp7Id),
      jobSource: this.jobSources.get(source2Id),
    });

    // 6. Baseline Tailored Prepared Application Packages for Nayera
    const prep1Id = "e1000000-0000-0000-0000-000000000001";
    this.preparedApplications.set(prep1Id, {
      id: prep1Id,
      jobId: job1Id,
      candidateId,
      priorityTier: "HIGH_PRIORITY",
      eligibilityScore: 92,
      aiMatchScore: 90,
      applicationChannel: DetectedChannel.COMPANY_APPLICATION_PAGE,
      sourceUrl: "https://efgholding.com/careers/legal-affairs-specialist",
      canonicalUrl: "https://efgholding.com/careers/legal-affairs-specialist",
      discoveryUrl: "https://efgholding.com/careers/legal-affairs-specialist",
      sourceProvider: "Jooble Real Jobs API",
      employerUrl: "https://efgholding.com/careers/apply/legal-affairs-specialist",
      employerDomain: "efgholding.com",
      originalEmployerUrl: "https://efgholding.com/careers/apply/legal-affairs-specialist",
      originalEmployerDomain: "efgholding.com",
      applicationUrl: "https://efgholding.com/careers/apply/legal-affairs-specialist",
      applyUrl: "https://efgholding.com/careers/apply/legal-affairs-specialist",
      attributionConfidence: "HIGH",
      attributionSource: "OFFICIAL_CAREERS_PAGE",
      profileEmphasis: "LEGAL / COMPLIANCE / CONTRACTS",
      selectedResumeId: resumeId,
      preparedEmail: {
        subject: "Application for Legal Affairs Specialist - Nayera Tarek Mohamed",
        body: "Dear Hiring Team at EFG Holding,\n\nI am writing to submit my application for the Legal Affairs Specialist position. As a legal professional holding an LL.M of Law from Menoufia University, an LL.B of Law from Banha University (2019, Grade: Good), and postgraduate diplomas including the Diploma of Administrative Sciences (Very Good) and Diploma of Public Law (Very Good), I offer a strong foundation in legal research, corporate compliance, and commercial contract analysis.\n\nMy background combines rigorous postgraduate legal education with practical legal internship experience at Dr. Zein El-Abdeen Law Office and Abdel Mawgood Law Office. Across these roles, I focused on statutory research, legal document review, and case analysis. Furthermore, I hold certifications in ICDL, TOEFL, and Banking courses, ensuring disciplined work ethics, decision-making, and professional communication.\n\nI welcome the opportunity to discuss how my legal qualifications and commitment to quality can add tangible value to EFG Holding.\n\nSincerely,\nNayera Tarek Mohamed\nLocation: Roxy, Heliopolis, Cairo, Egypt\nEmail: tareknayera24@gmail.com",
        recipientName: "Hiring Team at EFG Holding",
        recipientEmail: "careers@efgholding.com",
        keyHighlights: [
          "LL.M Law (Menoufia) & LL.B (Banha, 2019 Good)",
          "Postgraduate Diplomas in Public Law & Administrative Sciences (Very Good)",
          "Internships at Dr. Zein El-Abdeen & Abdel Mawgood Law Offices",
        ],
      },
      coverLetterDraft: "Dear Hiring Team at EFG Holding,\n\nI am writing to submit my application for the Legal Affairs Specialist position. As a legal professional holding an LL.M of Law from Menoufia University, an LL.B of Law from Banha University (2019, Grade: Good), and postgraduate diplomas including the Diploma of Administrative Sciences (Very Good) and Diploma of Public Law (Very Good), I offer a strong foundation in legal research, compliance, and regulatory analysis.\n\nMy background combines rigorous postgraduate legal education with practical legal internship experience at Dr. Zein El-Abdeen Law Office and Abdel Mawgood Law Office. Across these roles, I focused on statutory research, legal document review, and case analysis. Furthermore, I hold certifications in ICDL, TOEFL, and Banking courses, ensuring disciplined work ethics, decision-making, and professional communication.\n\nI welcome the opportunity to discuss how my legal qualifications and commitment to quality can add tangible value to EFG Holding.\n\nSincerely,\nNayera Tarek Mohamed\nLocation: Roxy, Heliopolis, Cairo, Egypt\nEmail: tareknayera24@gmail.com",
      preparationStatus: PreparationStatus.PENDING_APPROVAL,
      workflowStatus: ApplicationWorkflowStatus.READY,
      lastAction: "Application package prepared and ready for human review",
      requiresManualAction: true,
      manualActionNotes: "Company application portal. Package prepared for candidate review and direct submission.",
      provenance: {
        generatedFrom: "Nayera's verified CV (LL.B 2019 Good, LL.M Menoufia, Diplomas Very Good, Banking & Recruitment Experience)",
        source: "Jooble Real Jobs API",
        disclaimer: "NO EMAIL SENT • NO APPLICATION SUBMITTED • REQUIRES EXPLICIT HUMAN APPROVAL",
        emailSent: false,
        applicationSubmitted: false,
      },
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      job: this.jobs.get(job1Id),
      candidate: nayera,
    });

    // 7. Initial Bootstrap Audit Log
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

    for (const comp of memoryStore.companies.values()) {
      await prisma.company.upsert({
        where: { id: comp.id },
        update: {},
        create: {
          id: comp.id,
          name: comp.name,
          normalizedName: comp.normalizedName,
          websiteUrl: comp.websiteUrl,
          domain: comp.domain,
          location: comp.location,
          metadata: comp.metadata,
          createdAt: comp.createdAt,
          updatedAt: comp.updatedAt,
        },
      });
    }

    for (const j of memoryStore.jobs.values()) {
      await prisma.job.upsert({
        where: { id: j.id },
        update: {},
        create: {
          id: j.id,
          companyId: j.companyId,
          jobSourceId: j.jobSourceId,
          title: j.title,
          description: j.description,
          location: j.location,
          employmentType: j.employmentType,
          sourceUrl: j.sourceUrl,
          externalJobId: j.externalJobId,
          canonicalUrl: j.canonicalUrl,
          contentHash: j.contentHash,
          status: j.status,
          postedAt: j.postedAt,
          seenAt: j.seenAt,
          rawReferenceMetadata: j.rawReferenceMetadata,
          createdAt: j.createdAt,
          updatedAt: j.updatedAt,
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
