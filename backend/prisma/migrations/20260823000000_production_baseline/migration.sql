-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('PENDING', 'GRANTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ResumeParseStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ResumeSource" AS ENUM ('USER_UPLOAD', 'IMPORT', 'MANUAL_ENTRY');

-- CreateEnum
CREATE TYPE "JobSourceType" AS ENUM ('OFFICIAL_API', 'JOB_BOARD', 'RSS_FEED', 'CAREERS_PAGE', 'MANUAL');

-- CreateEnum
CREATE TYPE "JobSourceAccessMethod" AS ENUM ('API', 'FEED', 'PUBLIC_PAGE', 'MANUAL');

-- CreateEnum
CREATE TYPE "JobSourceHealthStatus" AS ENUM ('UNKNOWN', 'HEALTHY', 'DEGRADED', 'DISABLED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('ACTIVE', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY', 'INTERNSHIP', 'FREELANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENDING', 'SENT', 'FAILED', 'WITHDRAWN', 'REPLIED');

-- CreateEnum
CREATE TYPE "ApplicationChannel" AS ENUM ('EMAIL', 'EXTERNAL_PORTAL', 'MANUAL');

-- CreateEnum
CREATE TYPE "EmailReviewStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EmailProvider" AS ENUM ('GMAIL', 'OUTLOOK', 'OTHER');

-- CreateEnum
CREATE TYPE "EmailAccountStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED', 'DISABLED');

-- CreateEnum
CREATE TYPE "EmailEventType" AS ENUM ('DRAFT_CREATED', 'APPROVED', 'SEND_ATTEMPTED', 'SENT', 'FAILED', 'DELIVERED', 'BOUNCED', 'REPLIED');

-- CreateEnum
CREATE TYPE "AIAnalysisType" AS ENUM ('RESUME_PARSE', 'JOB_NORMALIZATION', 'JOB_MATCH', 'EMAIL_DRAFT');

-- CreateEnum
CREATE TYPE "AIAnalysisStatus" AS ENUM ('PENDING', 'VALIDATED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('SYSTEM', 'CANDIDATE', 'USER', 'PROVIDER');

-- CreateTable
CREATE TABLE "candidates" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "location" TEXT,
    "profileSummary" TEXT,
    "targetRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "consentStatus" "ConsentStatus" NOT NULL DEFAULT 'PENDING',
    "consentGrantedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resumes" (
    "id" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "privateStorageKey" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "originalFilename" TEXT,
    "source" "ResumeSource" NOT NULL DEFAULT 'USER_UPLOAD',
    "parseStatus" "ResumeParseStatus" NOT NULL DEFAULT 'PENDING',
    "parsedData" JSONB,
    "sourceMetadata" JSONB,
    "parsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resumes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "websiteUrl" TEXT,
    "domain" TEXT,
    "location" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_sources" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "JobSourceType" NOT NULL,
    "accessMethod" "JobSourceAccessMethod" NOT NULL,
    "externalSourceId" TEXT,
    "baseUrl" TEXT,
    "rateLimitPerMinute" INTEGER,
    "healthStatus" "JobSourceHealthStatus" NOT NULL DEFAULT 'UNKNOWN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "policyMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "jobSourceId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT,
    "employmentType" "EmploymentType",
    "sourceUrl" TEXT,
    "externalJobId" TEXT,
    "canonicalUrl" TEXT,
    "contentHash" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'ACTIVE',
    "postedAt" TIMESTAMP(3),
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawReferenceMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "resumeId" UUID,
    "resumeVersion" INTEGER,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "channel" "ApplicationChannel" NOT NULL DEFAULT 'EMAIL',
    "duplicateKey" TEXT NOT NULL,
    "selectedGeneratedEmailId" UUID,
    "approvedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_emails" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "attachmentResumeId" UUID,
    "aiAnalysisId" UUID,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "recipientName" TEXT,
    "promptVersion" TEXT,
    "reviewStatus" "EmailReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "contentHash" TEXT NOT NULL,
    "generationProvenance" JSONB,
    "reviewedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generated_emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_accounts" (
    "id" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "provider" "EmailProvider" NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "tokenSecretReference" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tokenExpiresAt" TIMESTAMP(3),
    "status" "EmailAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "consentGrantedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_events" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "emailAccountId" UUID,
    "generatedEmailId" UUID,
    "type" "EmailEventType" NOT NULL,
    "providerMessageId" TEXT,
    "providerThreadId" TEXT,
    "errorCode" TEXT,
    "safeMetadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_analyses" (
    "id" UUID NOT NULL,
    "candidateId" UUID,
    "resumeId" UUID,
    "jobId" UUID,
    "analysisType" "AIAnalysisType" NOT NULL,
    "status" "AIAnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "reviewDecision" "ReviewDecision" NOT NULL DEFAULT 'PENDING',
    "modelProvider" TEXT,
    "modelName" TEXT,
    "promptVersion" TEXT,
    "inputRecordVersions" JSONB,
    "structuredResult" JSONB,
    "explanation" JSONB,
    "matchScore" DOUBLE PRECISION,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "candidateId" UUID,
    "actorType" "AuditActorType" NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "eventType" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "safeMetadata" JSONB,
    "beforeSummary" JSONB,
    "afterSummary" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "candidates_email_key" ON "candidates"("email");

-- CreateIndex
CREATE INDEX "candidates_isActive_createdAt_idx" ON "candidates"("isActive", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "resumes_candidateId_version_key" ON "resumes"("candidateId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "resumes_candidateId_checksum_key" ON "resumes"("candidateId", "checksum");

-- CreateIndex
CREATE INDEX "resumes_candidateId_parseStatus_idx" ON "resumes"("candidateId", "parseStatus");

-- CreateIndex
CREATE INDEX "resumes_createdAt_idx" ON "resumes"("createdAt");

-- CreateIndex
CREATE INDEX "companies_location_idx" ON "companies"("location");

-- CreateIndex
CREATE UNIQUE INDEX "companies_normalizedName_domain_key" ON "companies"("normalizedName", "domain");

-- CreateIndex
CREATE UNIQUE INDEX "job_sources_name_key" ON "job_sources"("name");

-- CreateIndex
CREATE INDEX "job_sources_isActive_healthStatus_idx" ON "job_sources"("isActive", "healthStatus");

-- CreateIndex
CREATE UNIQUE INDEX "job_sources_type_externalSourceId_key" ON "job_sources"("type", "externalSourceId");

-- CreateIndex
CREATE INDEX "jobs_status_seenAt_idx" ON "jobs"("status", "seenAt");

-- CreateIndex
CREATE INDEX "jobs_jobSourceId_status_idx" ON "jobs"("jobSourceId", "status");

-- CreateIndex
CREATE INDEX "jobs_companyId_status_idx" ON "jobs"("companyId", "status");

-- CreateIndex
CREATE INDEX "jobs_location_idx" ON "jobs"("location");

-- CreateIndex
CREATE INDEX "jobs_postedAt_idx" ON "jobs"("postedAt");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_jobSourceId_externalJobId_key" ON "jobs"("jobSourceId", "externalJobId");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_jobSourceId_canonicalUrl_key" ON "jobs"("jobSourceId", "canonicalUrl");

-- CreateIndex
CREATE UNIQUE INDEX "applications_duplicateKey_key" ON "applications"("duplicateKey");

-- CreateIndex
CREATE UNIQUE INDEX "applications_selectedGeneratedEmailId_key" ON "applications"("selectedGeneratedEmailId");

-- CreateIndex
CREATE INDEX "applications_candidateId_status_idx" ON "applications"("candidateId", "status");

-- CreateIndex
CREATE INDEX "applications_status_sentAt_idx" ON "applications"("status", "sentAt");

-- CreateIndex
CREATE INDEX "applications_jobId_idx" ON "applications"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "applications_candidateId_jobId_channel_key" ON "applications"("candidateId", "jobId", "channel");

-- CreateIndex
CREATE INDEX "generated_emails_applicationId_reviewStatus_idx" ON "generated_emails"("applicationId", "reviewStatus");

-- CreateIndex
CREATE UNIQUE INDEX "generated_emails_applicationId_contentHash_key" ON "generated_emails"("applicationId", "contentHash");

-- CreateIndex
CREATE INDEX "email_accounts_status_idx" ON "email_accounts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "email_accounts_candidateId_provider_emailAddress_key" ON "email_accounts"("candidateId", "provider", "emailAddress");

-- CreateIndex
CREATE INDEX "email_events_applicationId_occurredAt_idx" ON "email_events"("applicationId", "occurredAt");

-- CreateIndex
CREATE INDEX "email_events_type_occurredAt_idx" ON "email_events"("type", "occurredAt");

-- CreateIndex
CREATE INDEX "email_events_providerThreadId_idx" ON "email_events"("providerThreadId");

-- CreateIndex
CREATE UNIQUE INDEX "email_events_emailAccountId_providerMessageId_key" ON "email_events"("emailAccountId", "providerMessageId");

-- CreateIndex
CREATE INDEX "ai_analyses_candidateId_analysisType_idx" ON "ai_analyses"("candidateId", "analysisType");

-- CreateIndex
CREATE INDEX "ai_analyses_resumeId_idx" ON "ai_analyses"("resumeId");

-- CreateIndex
CREATE INDEX "ai_analyses_jobId_analysisType_idx" ON "ai_analyses"("jobId", "analysisType");

-- CreateIndex
CREATE INDEX "ai_analyses_status_createdAt_idx" ON "ai_analyses"("status", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_candidateId_occurredAt_idx" ON "audit_logs"("candidateId", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_logs_resourceType_resourceId_idx" ON "audit_logs"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "audit_logs_correlationId_idx" ON "audit_logs"("correlationId");

-- CreateIndex
CREATE INDEX "audit_logs_action_occurredAt_idx" ON "audit_logs"("action", "occurredAt");

-- AddForeignKey
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_jobSourceId_fkey" FOREIGN KEY ("jobSourceId") REFERENCES "job_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "resumes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_selectedGeneratedEmailId_fkey" FOREIGN KEY ("selectedGeneratedEmailId") REFERENCES "generated_emails"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_emails" ADD CONSTRAINT "generated_emails_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_emails" ADD CONSTRAINT "generated_emails_attachmentResumeId_fkey" FOREIGN KEY ("attachmentResumeId") REFERENCES "resumes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_emails" ADD CONSTRAINT "generated_emails_aiAnalysisId_fkey" FOREIGN KEY ("aiAnalysisId") REFERENCES "ai_analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_accounts" ADD CONSTRAINT "email_accounts_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "email_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_generatedEmailId_fkey" FOREIGN KEY ("generatedEmailId") REFERENCES "generated_emails"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "resumes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
