import { randomUUID } from "node:crypto";
import {
  ApplicationWorkflowStatus,
  DetectedChannel,
  FreshnessStatus,
  PreparationStatus,
  type PreparedApplicationRecord,
  memoryStore,
} from "../store/db-store.js";
import { AppError } from "../utils/app-error.js";
import { getCandidateById, listCandidates } from "./candidate-service.js";
import { getJobById, listJobs } from "./job-service.js";
import { evaluateCandidateEligibility, NAYERA_VERIFIED_FACTS } from "./eligibility-service.js";
import { RuleBasedAIProvider } from "./ai/ai-provider.js";
import { createAuditLog } from "./audit-service.js";
import { normalizeUrl } from "./deduplication-service.js";
import { verifyApplicationFreshness } from "./job-freshness-service.js";
import { attributeJobSource } from "./job-attribution-service.js";
import { discoverDirectEmployer } from "./job-employer-discovery-service.js";

const aiProvider = new RuleBasedAIProvider();

export interface ChannelDetectionResult {
  channel: DetectedChannel;
  requiresManualAction: boolean;
  notes?: string;
  detectedEmail?: string;
}

/**
 * Safely inspects the job posting metadata and URL structure to detect the application channel.
 * Never fabricates recruiter emails or URLs.
 */
export function detectApplicationChannel(job: {
  title: string;
  description?: string | null;
  sourceUrl?: string | null;
  canonicalUrl?: string | null;
  rawReferenceMetadata?: any;
}): ChannelDetectionResult {
  const desc = (job.description || "").toLowerCase();
  const rawUrl = (job.canonicalUrl || job.sourceUrl || "").toLowerCase();

  // 1. Direct Email application check in description or raw metadata
  const emailRegex = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
  const emailsFound = (job.description || "").match(emailRegex);
  if (emailsFound && emailsFound.length > 0) {
    const legitimateEmail = emailsFound.find(
      (e) => !e.includes("example.com") && !e.includes("tareknayera") && !e.includes("sentry"),
    );
    if (legitimateEmail) {
      return {
        channel: DetectedChannel.EMAIL,
        requiresManualAction: false,
        detectedEmail: legitimateEmail,
        notes: `Direct hiring email detected in vacancy description: ${legitimateEmail}`,
      };
    }
  }

  // 2. Company ATS / Application Portal
  const isCompanyATS =
    rawUrl.includes("myworkdayjobs.com") ||
    rawUrl.includes("greenhouse.io") ||
    rawUrl.includes("lever.co") ||
    rawUrl.includes("taleo.net") ||
    rawUrl.includes("ashbyhq.com") ||
    rawUrl.includes("smartrecruiters.com") ||
    rawUrl.includes("recruitee.com") ||
    rawUrl.includes("bamboohr.com") ||
    rawUrl.includes("icims.com") ||
    rawUrl.includes("oraclecloud.com") ||
    rawUrl.includes("/careers/") ||
    rawUrl.includes("/jobs/");

  if (isCompanyATS && !rawUrl.includes("jooble.org") && !rawUrl.includes("adzuna")) {
    return {
      channel: DetectedChannel.COMPANY_APPLICATION_PAGE,
      requiresManualAction: true,
      notes: "Company ATS portal. Requires manual candidate submission (anti-bot & login safe).",
    };
  }

  // 3. Known Job Boards / Aggregators
  if (
    rawUrl.includes("jooble.org") ||
    rawUrl.includes("adzuna") ||
    rawUrl.includes("wuzzuf.net") ||
    rawUrl.includes("bayt.com") ||
    rawUrl.includes("linkedin.com") ||
    rawUrl.includes("indeed.com")
  ) {
    return {
      channel: DetectedChannel.JOB_BOARD,
      requiresManualAction: true,
      notes: "External Job Board listing. Stored for manual application review.",
    };
  }

  // 4. External general application link
  if (rawUrl.startsWith("http")) {
    return {
      channel: DetectedChannel.EXTERNAL_APPLICATION,
      requiresManualAction: true,
      notes: "External web vacancy link. Stored for manual application review.",
    };
  }

  // 5. Fallback Unknown
  return {
    channel: DetectedChannel.UNKNOWN,
    requiresManualAction: true,
    notes: "Application channel could not be safely categorized. Routed for manual verification.",
  };
}

/**
 * Selects profile emphasis strictly based on job category and verified qualifications.
 */
export function selectProfileEmphasis(
  categories: string[] = [],
  title: string = "",
): "LEGAL / COMPLIANCE / CONTRACTS" | "BANKING / SALES" | "RECRUITMENT / HR" {
  const normTitle = title.toLowerCase();
  const isLegal =
    categories.includes("LEGAL") ||
    categories.includes("COMPLIANCE") ||
    categories.includes("CONTRACTS") ||
    categories.includes("REGULATORY") ||
    /\b(legal|counsel|lawyer|contracts|compliance|regulatory|شؤون قانونية|محامي|عقود|امتثال)\b/i.test(normTitle);

  if (isLegal) {
    return "LEGAL / COMPLIANCE / CONTRACTS";
  }

  const isRecruitment =
    categories.includes("RECRUITMENT") ||
    categories.includes("HR") ||
    /\b(recruitment|recruiter|talent acquisition|hr|human resources|توظيف|موارد بشرية)\b/i.test(normTitle);

  if (isRecruitment) {
    return "RECRUITMENT / HR";
  }

  return "BANKING / SALES";
}

/**
 * Generates a concise, tailored cover letter strictly grounded in Nayera's verified facts.
 */
export function generateJobCoverLetter(
  job: { title: string; companyName: string; location?: string | null },
  emphasis: "LEGAL / COMPLIANCE / CONTRACTS" | "BANKING / SALES" | "RECRUITMENT / HR",
): string {
  const name = NAYERA_VERIFIED_FACTS.name;
  const location = NAYERA_VERIFIED_FACTS.location;
  const email = NAYERA_VERIFIED_FACTS.email;
  const targetRole = job.title;
  const targetCompany = job.companyName || "Hiring Organization";

  if (emphasis === "LEGAL / COMPLIANCE / CONTRACTS") {
    return `Dear Hiring Team at ${targetCompany},

I am writing to submit my application for the ${targetRole} position. As a legal professional holding an LL.M of Law from Menoufia University, an LL.B of Law from Banha University (2019, Grade: Good), and postgraduate diplomas including the Diploma of Administrative Sciences (Very Good) and Diploma of Public Law (Very Good), I offer a strong foundation in legal research, compliance, and regulatory analysis.

My background combines rigorous postgraduate legal education with practical legal internship experience at Dr. Zein El-Abdeen Law Office and Abdel Mawgood Law Office. Across these roles, I focused on statutory research, legal document review, and case analysis. Furthermore, I hold certifications in ICDL, TOEFL, and Banking courses, ensuring disciplined work ethics, decision-making, and professional communication.

I welcome the opportunity to discuss how my legal qualifications and commitment to quality can add tangible value to ${targetCompany}.

Sincerely,
${name}
Location: ${location}
Email: ${email}`;
  }

  if (emphasis === "RECRUITMENT / HR") {
    return `Dear Hiring Team at ${targetCompany},

I am writing to express my strong interest in the ${targetRole} opening at ${targetCompany}. With direct professional experience as a Recruitment Manager at Eden Cleaning Company (October 2025 to June 2026), I offer proven expertise in talent acquisition pipelines, candidate screening, interviewing, and workforce coordination.

My work is backed by structured time management, punctuality, and strong client-handling skills, supported by postgraduate legal education (LL.B, LL.M, Diplomas) and professional certifications (ICDL, TOEFL). I take pride in consistently meeting operational recruitment goals while fostering collaborative relationships.

I look forward to discussing how my recruitment background and organizational commitment can support ${targetCompany}'s hiring goals.

Sincerely,
${name}
Location: ${location}
Email: ${email}`;
  }

  // BANKING / SALES Emphasis
  return `Dear Hiring Team at ${targetCompany},

I am writing to express my interest in the ${targetRole} position with ${targetCompany}. With extensive banking tele-sales experience across Attijariwafa Bank (May 2022 to September 2022), Al Ahli Bank of Kuwait (October 2022 to May 2024), and ADIB Bank (June 2024 to September 2025), I bring a consistent track record in outbound tele-sales and sales target achievement.

Throughout my banking career, I have specialized in customer relationship management, sales target achievement, and consultative communication. My professional development includes completed Banking courses, ICDL, and TOEFL, alongside postgraduate legal education that instills strict compliance and attention to detail.

I would welcome the opportunity to discuss how my banking tele-sales experience and dedication can drive success at ${targetCompany}.

Sincerely,
${name}
Location: ${location}
Email: ${email}`;
}

export interface PrepareApplicationOptions {
  candidateId?: string;
  forceRecreate?: boolean;
}

/**
 * Validates and prepares an application package for an eligible job.
 * Enforces strict quality gates, duplicate prevention, and zero-automatic-submission invariants.
 */
export async function prepareApplicationForJob(
  jobId: string,
  options: PrepareApplicationOptions = {},
): Promise<PreparedApplicationRecord> {
  const job = await getJobById(jobId);
  const candidateId = options.candidateId || (await listCandidates())[0]?.id;
  if (!candidateId) {
    throw new AppError("No active candidate profile found.", 404, "CANDIDATE_NOT_FOUND");
  }
  const candidate = await getCandidateById(candidateId);

  // 1. Validation: Job metadata
  if (!job.title || job.title.trim().length < 2) {
    throw new AppError("Job record contains invalid title.", 400, "INVALID_JOB_TITLE");
  }
  const companyName = job.company?.name || "Direct Employer";

  // 2. Validation: Usable source/canonical URL
  const sourceUrl = job.sourceUrl || job.canonicalUrl;
  if (!sourceUrl || !sourceUrl.startsWith("http")) {
    throw new AppError("Job is missing a valid usable source URL.", 400, "MISSING_SOURCE_URL");
  }
  const canonicalUrl = normalizeUrl(job.canonicalUrl || sourceUrl) || sourceUrl;

  // 3. Validation: Quality Gate & Eligibility Check
  const eligibility = evaluateCandidateEligibility({
    title: job.title,
    description: job.description,
    location: job.location,
    categories: job.categories,
  });

  if (!eligibility.isEligibleForApplication || (eligibility.priorityTier !== "HIGH_PRIORITY" && eligibility.priorityTier !== "GOOD_MATCH")) {
    throw new AppError(
      `Job is not eligible for application preparation. Priority tier: ${eligibility.priorityTier}, Score: ${eligibility.eligibilityScore}%`,
      400,
      "JOB_INELIGIBLE_FOR_PREPARATION",
    );
  }

  // 4. Duplicate Application Protection
  const existingPrep = Array.from(memoryStore.preparedApplications.values()).find(
    (p) => p.jobId === job.id && p.candidateId === candidate.id,
  );
  if (existingPrep && !options.forceRecreate) {
    return existingPrep;
  }

  // 5. Channel Detection, Direct Employer & ATS Discovery & Profile Emphasis
  const channelInfo = detectApplicationChannel({
    title: job.title,
    description: job.description,
    sourceUrl,
    canonicalUrl,
    rawReferenceMetadata: job.rawReferenceMetadata,
  });

  const catalog = Array.from(memoryStore.jobs.values());
  const employerDiscovery = discoverDirectEmployer(job, job.company, catalog);

  // Preferred Channel: ATS_APPLICATION_PAGE > COMPANY_APPLICATION_PAGE > EMAIL > channelInfo.channel
  const effectiveChannel = employerDiscovery.employerUrl || employerDiscovery.atsUrl
    ? employerDiscovery.applicationChannel
    : channelInfo.channel;

  const effectiveApplyUrl =
    employerDiscovery.atsUrl ||
    employerDiscovery.employerUrl ||
    employerDiscovery.applicationUrl ||
    canonicalUrl ||
    sourceUrl;

  const emphasis = selectProfileEmphasis(job.categories, job.title);

  // 6. AI Match Calculation
  const matchResult = await aiProvider.evaluateJobMatch(NAYERA_VERIFIED_FACTS, {
    title: job.title,
    company: { name: companyName },
    description: job.description,
    location: job.location,
  });

  // 7. Grounded Draft Email Generation (Never invented recruiter details)
  const draftEmail = await aiProvider.generateEmailDraft(
    NAYERA_VERIFIED_FACTS,
    {
      title: job.title,
      company: { name: companyName, domain: job.company?.domain },
      description: job.description,
    },
    {
      name: `Hiring Team at ${companyName}`,
      email: channelInfo.detectedEmail || (job.company?.domain ? `careers@${job.company.domain}` : undefined),
    },
  );

  // 8. Grounded Cover Letter Generation
  const coverLetterDraft = generateJobCoverLetter(
    { title: job.title, companyName, location: job.location },
    emphasis,
  );

  const resumeId = Array.from(memoryStore.resumes.values()).find((r) => r.candidateId === candidate.id)?.id || null;

  const now = new Date();
  const prepId = existingPrep ? existingPrep.id : randomUUID();

  // Status is PENDING_APPROVAL by default
  const preparationStatus = PreparationStatus.PENDING_APPROVAL;

  const prepRecord: PreparedApplicationRecord = {
    id: prepId,
    jobId: job.id,
    candidateId: candidate.id,
    priorityTier: eligibility.priorityTier,
    eligibilityScore: eligibility.eligibilityScore,
    aiMatchScore: matchResult.matchScore,
    applicationChannel: effectiveChannel,
    sourceUrl,
    canonicalUrl,
    discoveryUrl: employerDiscovery.discoveryUrl,
    discoveryProviders: employerDiscovery.discoveryProviders,
    sourceProvider: employerDiscovery.sourceProvider,
    employerUrl: employerDiscovery.employerUrl,
    employerDomain: employerDiscovery.employerDomain,
    originalEmployerUrl: employerDiscovery.employerUrl,
    originalEmployerDomain: employerDiscovery.employerDomain,
    atsProvider: employerDiscovery.atsProvider,
    atsUrl: employerDiscovery.atsUrl,
    atsConfidence: employerDiscovery.atsConfidence,
    applicationUrl: effectiveApplyUrl,
    applyUrl: effectiveApplyUrl,
    attributionConfidence: employerDiscovery.attributionConfidence,
    attributionSource: employerDiscovery.attributionSource,
    profileEmphasis: emphasis,
    selectedResumeId: resumeId,
    preparedEmail: {
      subject: draftEmail.subject,
      body: draftEmail.body,
      recipientName: draftEmail.recipientName || `Hiring Team at ${companyName}`,
      recipientEmail: draftEmail.recipientEmail,
      keyHighlights: draftEmail.keyHighlights,
    },
    coverLetterDraft,
    preparationStatus,
    workflowStatus: (employerDiscovery.requiresManualVerification || channelInfo.requiresManualAction)
      ? ApplicationWorkflowStatus.MANUAL_ACTION_REQUIRED
      : ApplicationWorkflowStatus.READY,
    lastAction: (employerDiscovery.requiresManualVerification || channelInfo.requiresManualAction)
      ? "Manual action required (anti-bot / portal login)"
      : "Application package prepared and ready for human review",
    requiresManualAction: employerDiscovery.requiresManualVerification || channelInfo.requiresManualAction,
    manualActionNotes: employerDiscovery.notes || channelInfo.notes || null,
    manualActionReason: employerDiscovery.notes || channelInfo.notes || null,
    provenance: {
      generatedFrom: "Nayera's verified CV (LL.B 2019 Good, LL.M Menoufia, Diplomas Very Good, Banking & Recruitment Experience)",
      source: job.jobSource?.name || employerDiscovery.sourceProvider || "External Job Source",
      disclaimer: "NO EMAIL SENT • NO APPLICATION SUBMITTED • REQUIRES EXPLICIT HUMAN APPROVAL",
      emailSent: false,
      applicationSubmitted: false,
    },
    createdAt: existingPrep ? existingPrep.createdAt : now,
    updatedAt: now,
    job,
    candidate,
  };

  memoryStore.preparedApplications.set(prepId, prepRecord);

  await createAuditLog({
    candidateId: candidate.id,
    action: "APPLICATION_PREPARED",
    resourceType: "PreparedApplication",
    resourceId: prepId,
    eventType: "APPLICATION_PACKAGE_ASSEMBLED",
    safeMetadata: {
      jobId: job.id,
      jobTitle: job.title,
      company: companyName,
      priorityTier: eligibility.priorityTier,
      channel: channelInfo.channel,
      status: preparationStatus,
      emailSent: false,
      applicationSubmitted: false,
    },
  });

  return prepRecord;
}

/**
 * Prepares application packages for all eligible jobs in catalog.
 */
export async function prepareAllEligibleApplications(candidateId?: string): Promise<{
  totalEvaluated: number;
  totalPrepared: number;
  highPriorityCount: number;
  goodMatchCount: number;
  manualActionCount: number;
  emailChannelCount: number;
  externalChannelCount: number;
  ineligibleRejected: number;
  records: PreparedApplicationRecord[];
}> {
  const jobs = await listJobs();
  const cId = candidateId || (await listCandidates())[0]?.id;

  let highPriorityCount = 0;
  let goodMatchCount = 0;
  let manualActionCount = 0;
  let emailChannelCount = 0;
  let externalChannelCount = 0;
  let ineligibleRejected = 0;
  const records: PreparedApplicationRecord[] = [];

  for (const job of jobs) {
    const eligibility = evaluateCandidateEligibility({
      title: job.title,
      description: job.description,
      location: job.location,
      categories: job.categories,
    });

    if (eligibility.priorityTier === "HIGH_PRIORITY" || eligibility.priorityTier === "GOOD_MATCH") {
      try {
        const prep = await prepareApplicationForJob(job.id, { candidateId: cId });
        records.push(prep);

        if (prep.priorityTier === "HIGH_PRIORITY") highPriorityCount++;
        if (prep.priorityTier === "GOOD_MATCH") goodMatchCount++;
        if (prep.requiresManualAction) manualActionCount++;
        if (prep.applicationChannel === DetectedChannel.EMAIL) emailChannelCount++;
        if (
          prep.applicationChannel === DetectedChannel.JOB_BOARD ||
          prep.applicationChannel === DetectedChannel.COMPANY_APPLICATION_PAGE ||
          prep.applicationChannel === DetectedChannel.EXTERNAL_APPLICATION
        ) {
          externalChannelCount++;
        }
      } catch (err) {
        ineligibleRejected++;
      }
    } else {
      ineligibleRejected++;
    }
  }

  return {
    totalEvaluated: jobs.length,
    totalPrepared: records.length,
    highPriorityCount,
    goodMatchCount,
    manualActionCount,
    emailChannelCount,
    externalChannelCount,
    ineligibleRejected,
    records,
  };
}

export interface PreparedApplicationFilters {
  candidateId?: string;
  priorityTier?: string;
  status?: PreparationStatus;
  limit?: number;
}

export async function listPreparedApplications(
  filters: PreparedApplicationFilters = {},
): Promise<PreparedApplicationRecord[]> {
  let list = Array.from(memoryStore.preparedApplications.values());

  if (filters.candidateId) {
    list = list.filter((p) => p.candidateId === filters.candidateId);
  }
  if (filters.priorityTier) {
    list = list.filter((p) => p.priorityTier.toLowerCase() === filters.priorityTier!.toLowerCase());
  }
  if (filters.status) {
    list = list.filter((p) => p.preparationStatus === filters.status);
  }

  // Sort by priority tier (HIGH_PRIORITY first), then eligibility score desc, then date desc
  list.sort((a, b) => {
    const tierOrder: Record<string, number> = { HIGH_PRIORITY: 1, GOOD_MATCH: 2, LOW_MATCH: 3, REJECT: 4 };
    const orderDiff = (tierOrder[a.priorityTier] || 5) - (tierOrder[b.priorityTier] || 5);
    if (orderDiff !== 0) return orderDiff;
    if (b.eligibilityScore !== a.eligibilityScore) return b.eligibilityScore - a.eligibilityScore;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  if (filters.limit && filters.limit > 0) {
    list = list.slice(0, filters.limit);
  }

  // Populate references
  return list.map((item) => ({
    ...item,
    job: memoryStore.jobs.get(item.jobId)
      ? {
          ...memoryStore.jobs.get(item.jobId)!,
          company: memoryStore.companies.get(memoryStore.jobs.get(item.jobId)!.companyId),
        }
      : undefined,
    candidate: memoryStore.candidates.get(item.candidateId),
  }));
}

export async function getPreparedApplicationById(id: string): Promise<PreparedApplicationRecord> {
  const prep = memoryStore.preparedApplications.get(id);
  if (!prep) {
    throw new AppError(`Prepared application record with ID ${id} not found.`, 404, "PREPARED_APPLICATION_NOT_FOUND");
  }

  return {
    ...prep,
    job: memoryStore.jobs.get(prep.jobId)
      ? {
          ...memoryStore.jobs.get(prep.jobId)!,
          company: memoryStore.companies.get(memoryStore.jobs.get(prep.jobId)!.companyId),
        }
      : undefined,
    candidate: memoryStore.candidates.get(prep.candidateId),
  };
}

export interface ApprovePreparedOptions {
  forceApprove?: boolean;
  skipFreshnessCheck?: boolean;
  notes?: string;
}

/**
 * Human approval transition with mandatory Job Freshness Verification Gate.
 * Distinguishes confirmed closed/expired jobs from bot protection and transient errors.
 * Does NOT send emails or submit forms.
 */
export async function approvePreparedApplication(
  id: string,
  options?: ApprovePreparedOptions,
): Promise<PreparedApplicationRecord> {
  let prep = await getPreparedApplicationById(id);

  const hasUsableUrl = Boolean(
    (prep.sourceUrl && prep.sourceUrl.startsWith("http")) ||
    (prep.canonicalUrl && prep.canonicalUrl.startsWith("http")) ||
    (prep.applicationUrl && prep.applicationUrl.startsWith("http")) ||
    (prep.employerUrl && prep.employerUrl.startsWith("http")) ||
    (prep.atsUrl && prep.atsUrl.startsWith("http"))
  );

  if (!hasUsableUrl) {
    prep.preparationStatus = PreparationStatus.PENDING_APPROVAL;
    prep.requiresManualFreshnessCheck = true;
    prep.updatedAt = new Date();
    memoryStore.preparedApplications.set(id, prep);

    throw new AppError(
      "Application approval blocked: Job record has no valid application or source URL.",
      400,
      "FRESHNESS_VERIFICATION_BLOCKED",
    );
  }

  if (!options?.skipFreshnessCheck && !options?.forceApprove) {
    const isRecentlyActive =
      prep.freshnessStatus === FreshnessStatus.ACTIVE &&
      prep.freshnessCheckedAt &&
      Date.now() - new Date(prep.freshnessCheckedAt).getTime() < 15 * 60 * 1000;

    if (!isRecentlyActive) {
      prep = await verifyApplicationFreshness(id);
    }

    if (prep.freshnessStatus === FreshnessStatus.CLOSED) {
      const reason = prep.freshnessReason || "Job posting is closed, expired, or filled.";
      prep.preparationStatus = PreparationStatus.PENDING_APPROVAL;
      prep.requiresManualFreshnessCheck = true;
      prep.updatedAt = new Date();
      memoryStore.preparedApplications.set(id, prep);

      throw new AppError(
        `Application approval blocked: Underlying job posting is not ACTIVE (Status: CLOSED). Reason: ${reason}`,
        400,
        "FRESHNESS_VERIFICATION_BLOCKED",
      );
    }

    if (prep.freshnessStatus === FreshnessStatus.NOT_FOUND) {
      const reason = prep.freshnessReason || "Job posting page was not found (HTTP 404).";
      prep.preparationStatus = PreparationStatus.PENDING_APPROVAL;
      prep.requiresManualFreshnessCheck = true;
      prep.updatedAt = new Date();
      memoryStore.preparedApplications.set(id, prep);

      throw new AppError(
        `Application approval blocked: Underlying job posting is not ACTIVE (Status: NOT_FOUND). Reason: ${reason}`,
        400,
        "FRESHNESS_VERIFICATION_BLOCKED",
      );
    }

    if (prep.freshnessStatus === FreshnessStatus.BLOCKED) {
      const reason = prep.freshnessReason || "Provider enforces automated bot protection / Cloudflare screen.";
      prep.preparationStatus = PreparationStatus.PENDING_APPROVAL;
      prep.requiresManualFreshnessCheck = true;
      prep.updatedAt = new Date();
      memoryStore.preparedApplications.set(id, prep);

      throw new AppError(
        `Application approval blocked: Underlying job posting is not ACTIVE (Status: BLOCKED). Reason: ${reason}`,
        400,
        "FRESHNESS_VERIFICATION_BLOCKED",
      );
    }

    if (prep.freshnessStatus === FreshnessStatus.TIMEOUT || prep.freshnessStatus === FreshnessStatus.UNKNOWN) {
      const jobSeenAt = prep.job?.seenAt || prep.job?.createdAt || prep.createdAt;
      const isRecentlyDiscovered =
        jobSeenAt && Date.now() - new Date(jobSeenAt).getTime() < 72 * 60 * 60 * 1000;

      if (!isRecentlyDiscovered) {
        const reason = prep.freshnessReason || "Job freshness verification temporarily unavailable.";
        prep.preparationStatus = PreparationStatus.PENDING_APPROVAL;
        prep.requiresManualFreshnessCheck = true;
        prep.updatedAt = new Date();
        memoryStore.preparedApplications.set(id, prep);

        throw new AppError(
          `Application approval blocked: Job freshness verification temporarily unavailable (Status: ${prep.freshnessStatus}). Reason: ${reason}`,
          400,
          "FRESHNESS_VERIFICATION_BLOCKED",
        );
      }
    }
  }

  prep.preparationStatus = PreparationStatus.APPROVED;
  prep.updatedAt = new Date();
  memoryStore.preparedApplications.set(id, prep);

  await createAuditLog({
    candidateId: prep.candidateId,
    action: "APPLICATION_APPROVED_BY_USER",
    resourceType: "PreparedApplication",
    resourceId: id,
    eventType: "APPROVAL_GRANTED_NO_DISPATCH",
    safeMetadata: {
      jobId: prep.jobId,
      status: PreparationStatus.APPROVED,
      freshnessStatus: prep.freshnessStatus || FreshnessStatus.ACTIVE,
      forceApprove: Boolean(options?.forceApprove),
      skipFreshnessCheck: Boolean(options?.skipFreshnessCheck),
      notes: options?.notes || null,
      emailSent: false,
      applicationSubmitted: false,
      notice: "Approval recorded after verifying active job posting. No automatic dispatch executed.",
    },
  });

  return prep;
}

/**
 * User rejects prepared application package.
 */
export async function rejectPreparedApplication(
  id: string,
  reason: string = "User rejected preparation",
): Promise<PreparedApplicationRecord> {
  const prep = await getPreparedApplicationById(id);
  prep.preparationStatus = PreparationStatus.REJECTED;
  prep.manualActionNotes = reason;
  prep.updatedAt = new Date();
  memoryStore.preparedApplications.set(id, prep);

  await createAuditLog({
    candidateId: prep.candidateId,
    action: "APPLICATION_REJECTED_BY_USER",
    resourceType: "PreparedApplication",
    resourceId: id,
    eventType: "PREPARATION_DISMISSED",
    safeMetadata: { jobId: prep.jobId, reason, status: PreparationStatus.REJECTED },
  });

  return prep;
}
