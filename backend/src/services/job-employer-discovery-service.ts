import {
  DetectedChannel,
  type AttributionConfidence,
  type CompanyRecord,
  type JobRecord,
} from "../store/db-store.js";
import type { NormalizedJob } from "./adapters/types.js";

export interface AtsDetectionResult {
  atsProvider: string | null;
  atsUrl: string | null;
  atsConfidence: AttributionConfidence;
}

export interface DirectEmployerDiscoveryResult {
  discoveryUrl: string;
  discoveryProviders: string[];
  sourceProvider: string;
  employerUrl: string | null;
  employerDomain: string | null;
  atsProvider: string | null;
  atsUrl: string | null;
  atsConfidence: AttributionConfidence;
  applicationUrl: string;
  applicationChannel: DetectedChannel;
  attributionConfidence: AttributionConfidence;
  attributionSource: string;
  requiresManualVerification: boolean;
  notes?: string;
}

interface AtsDefinition {
  name: string;
  domainPatterns: RegExp[];
}

const ATS_REGISTRY: AtsDefinition[] = [
  {
    name: "Workday",
    domainPatterns: [/\.myworkdayjobs\.com$/i, /^myworkdayjobs\.com$/i, /wd\d+\.myworkdayjobs\.com$/i, /\.workday\.com$/i],
  },
  {
    name: "Greenhouse",
    domainPatterns: [/\.greenhouse\.io$/i, /^greenhouse\.io$/i],
  },
  {
    name: "Lever",
    domainPatterns: [/\.lever\.co$/i, /^lever\.co$/i],
  },
  {
    name: "Ashby",
    domainPatterns: [/\.ashbyhq\.com$/i, /^ashbyhq\.com$/i],
  },
  {
    name: "SmartRecruiters",
    domainPatterns: [/\.smartrecruiters\.com$/i, /^smartrecruiters\.com$/i],
  },
  {
    name: "Taleo",
    domainPatterns: [/\.taleo\.net$/i, /^taleo\.net$/i, /oraclecloud\.com\/hcmUI/i],
  },
  {
    name: "iCIMS",
    domainPatterns: [/\.icims\.com$/i, /^icims\.com$/i],
  },
  {
    name: "Breezy",
    domainPatterns: [/\.breezy\.hr$/i, /^breezy\.hr$/i],
  },
  {
    name: "Recruitee",
    domainPatterns: [/\.recruitee\.com$/i, /^recruitee\.com$/i],
  },
  {
    name: "Jobvite",
    domainPatterns: [/\.jobvite\.com$/i, /^jobvite\.com$/i],
  },
  {
    name: "BambooHR",
    domainPatterns: [/\.bamboohr\.com$/i, /^bamboohr\.com$/i],
  },
  {
    name: "SuccessFactors",
    domainPatterns: [/\.successfactors\.(?:com|eu)$/i, /^successfactors\.(?:com|eu)$/i, /\.jobs2web\.com$/i],
  },
  {
    name: "Workable",
    domainPatterns: [/\.workable\.com$/i, /^workable\.com$/i],
  },
];

const KNOWN_AGGREGATORS = new Set([
  "jooble.org",
  "jooble.com",
  "adzuna.com",
  "adzuna.co.uk",
  "indeed.com",
  "indeed.co.uk",
  "glassdoor.com",
  "monster.com",
  "ziprecruiter.com",
  "bayt.com",
  "wuzzuf.net",
  "forasna.com",
  "tanqeeb.com",
  "gulftalent.com",
]);

/**
 * Safely extracts domain without protocol or www prefix.
 */
export function extractDomain(urlStr: string | null | undefined): string | null {
  if (!urlStr || typeof urlStr !== "string") return null;
  try {
    const parsed = new URL(urlStr.startsWith("http") ? urlStr : `https://${urlStr}`);
    return parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Checks if a domain is a known aggregator.
 */
export function isAggregator(domain: string | null): boolean {
  if (!domain) return false;
  for (const agg of KNOWN_AGGREGATORS) {
    if (domain === agg || domain.endsWith(`.${agg}`)) return true;
  }
  return false;
}

/**
 * Detects legitimate ATS system from a given URL.
 */
export function detectAtsFromUrl(urlStr: string | null | undefined): AtsDetectionResult {
  if (!urlStr || typeof urlStr !== "string") {
    return { atsProvider: null, atsUrl: null, atsConfidence: "NONE" };
  }

  const domain = extractDomain(urlStr);
  if (!domain) {
    return { atsProvider: null, atsUrl: null, atsConfidence: "NONE" };
  }

  for (const ats of ATS_REGISTRY) {
    for (const pattern of ats.domainPatterns) {
      if (pattern.test(domain) || pattern.test(urlStr)) {
        return {
          atsProvider: ats.name,
          atsUrl: urlStr,
          atsConfidence: "HIGH",
        };
      }
    }
  }

  return { atsProvider: null, atsUrl: null, atsConfidence: "NONE" };
}

/**
 * Scans text for explicit ATS URLs.
 * Never fabricates or guesses.
 */
export function scanTextForAtsUrls(text: string): AtsDetectionResult {
  if (!text) {
    return { atsProvider: null, atsUrl: null, atsConfidence: "NONE" };
  }

  const urlRegex = /https?:\/\/[^\s"'<>()[\]{}|\\^`]+/gi;
  const matches = text.match(urlRegex) || [];

  for (const rawUrl of matches) {
    const cleanUrl = rawUrl.replace(/[.,;:!?)]+$/, "");
    const ats = detectAtsFromUrl(cleanUrl);
    if (ats.atsProvider) {
      return ats;
    }
  }

  return { atsProvider: null, atsUrl: null, atsConfidence: "NONE" };
}

/**
 * Scans text for direct recruitment emails.
 */
export function scanTextForRecruitmentEmail(text: string): string | null {
  if (!text) return null;
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  const matches = text.match(emailRegex) || [];

  for (const em of matches) {
    const lower = em.toLowerCase();
    if (
      (lower.includes("career") ||
        lower.includes("job") ||
        lower.includes("recruit") ||
        lower.includes("hr") ||
        lower.includes("talent") ||
        lower.includes("apply") ||
        lower.includes("hiring")) &&
      !lower.includes("example.com") &&
      !lower.includes("jooble") &&
      !lower.includes("adzuna")
    ) {
      return em;
    }
  }

  return null;
}

/**
 * Cross-source matching engine. Identifies if the same vacancy is present across multiple real providers.
 */
export function crossMatchJobAcrossSources(
  targetJob: Partial<JobRecord> | Partial<NormalizedJob>,
  catalog: JobRecord[] = [],
): {
  matchedJobs: JobRecord[];
  discoveryProviders: string[];
  crossAtsUrl: string | null;
  crossEmployerUrl: string | null;
} {
  const providers = new Set<string>();
  const primaryProvider = (targetJob as any).jobSource?.name || "Jooble Real Jobs API";
  providers.add(primaryProvider);

  const matchedJobs: JobRecord[] = [];
  let crossAtsUrl: string | null = null;
  let crossEmployerUrl: string | null = null;

  const targetTitleNorm = (targetJob.title || "").toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]/gi, " ").trim();
  const targetCompanyNorm = ((targetJob as any).company?.name || (targetJob as any).companyName || "").toLowerCase().trim();

  if (!targetTitleNorm || !targetCompanyNorm) {
    return {
      matchedJobs,
      discoveryProviders: Array.from(providers),
      crossAtsUrl,
      crossEmployerUrl,
    };
  }

  for (const other of catalog) {
    if ((targetJob as any).id && other.id === (targetJob as any).id) continue;

    const otherTitleNorm = (other.title || "").toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]/gi, " ").trim();
    const otherCompanyNorm = (other.company?.name || "").toLowerCase().trim();

    // Check high-confidence identity signals
    const titleMatch = targetTitleNorm === otherTitleNorm;
    const companyMatch = targetCompanyNorm === otherCompanyNorm;

    if (titleMatch && companyMatch) {
      matchedJobs.push(other);
      if (other.jobSource?.name) providers.add(other.jobSource.name);

      if (other.atsUrl && !crossAtsUrl) crossAtsUrl = other.atsUrl;
      if (other.employerUrl && !crossEmployerUrl) crossEmployerUrl = other.employerUrl;
      if (other.originalEmployerUrl && !crossEmployerUrl) crossEmployerUrl = other.originalEmployerUrl;
    }
  }

  return {
    matchedJobs,
    discoveryProviders: Array.from(providers),
    crossAtsUrl,
    crossEmployerUrl,
  };
}

/**
 * Discovers Direct Employer application URLs, ATS platforms, and confidence.
 * Follows strict URL Priority:
 * 1. Verified original employer application URL
 * 2. Verified ATS application URL
 * 3. Verified direct employer job URL
 * 4. Provider discovery URL
 */
export function discoverDirectEmployer(
  job: Partial<JobRecord> | Partial<NormalizedJob>,
  company?: Partial<CompanyRecord>,
  catalog: JobRecord[] = [],
): DirectEmployerDiscoveryResult {
  const discoveryUrl = (job.canonicalUrl || job.sourceUrl || "https://jooble.org").trim();
  const sourceProvider = (job as any).jobSource?.name || "Jooble Real Jobs API";
  const rawMeta = (job as any).rawReferenceMetadata || (job as any).rawMetadata || {};
  const description = job.description || "";

  // Perform cross-source matching
  const crossMatch = crossMatchJobAcrossSources(job, catalog);
  const discoveryProviders = crossMatch.discoveryProviders;

  // 1. Direct Employer URL in Provider Raw Metadata
  const explicitEmployerUrl =
    rawMeta.original_link ||
    rawMeta.direct_url ||
    rawMeta.employer_url ||
    rawMeta.external_url ||
    rawMeta.apply_url ||
    crossMatch.crossEmployerUrl;

  if (typeof explicitEmployerUrl === "string" && explicitEmployerUrl.startsWith("http")) {
    const domain = extractDomain(explicitEmployerUrl);
    if (domain && !isAggregator(domain)) {
      const atsCheck = detectAtsFromUrl(explicitEmployerUrl);
      const isAts = !!atsCheck.atsProvider;

      return {
        discoveryUrl,
        discoveryProviders,
        sourceProvider,
        employerUrl: explicitEmployerUrl,
        employerDomain: domain,
        atsProvider: atsCheck.atsProvider,
        atsUrl: isAts ? explicitEmployerUrl : null,
        atsConfidence: isAts ? "HIGH" : "NONE",
        applicationUrl: explicitEmployerUrl,
        applicationChannel: isAts
          ? DetectedChannel.ATS_APPLICATION_PAGE
          : DetectedChannel.COMPANY_APPLICATION_PAGE,
        attributionConfidence: "HIGH",
        attributionSource: isAts ? "DIRECT_METADATA_ATS" : "DIRECT_METADATA_EMPLOYER",
        requiresManualVerification: false,
        notes: `Direct employer application URL verified from provider metadata (${domain}).`,
      };
    }
  }

  // 2. ATS URL explicitly embedded in Job Description or Cross-Source
  const atsScan = scanTextForAtsUrls(description);
  const effectiveAtsUrl = atsScan.atsUrl || crossMatch.crossAtsUrl;
  const effectiveAtsProvider = atsScan.atsProvider || (crossMatch.crossAtsUrl ? detectAtsFromUrl(crossMatch.crossAtsUrl).atsProvider : null);

  if (effectiveAtsUrl && effectiveAtsProvider) {
    const domain = extractDomain(effectiveAtsUrl);
    return {
      discoveryUrl,
      discoveryProviders,
      sourceProvider,
      employerUrl: effectiveAtsUrl,
      employerDomain: domain,
      atsProvider: effectiveAtsProvider,
      atsUrl: effectiveAtsUrl,
      atsConfidence: "HIGH",
      applicationUrl: effectiveAtsUrl,
      applicationChannel: DetectedChannel.ATS_APPLICATION_PAGE,
      attributionConfidence: "HIGH",
      attributionSource: "DESCRIPTION_ATS_LINK",
      requiresManualVerification: false,
      notes: `Direct ATS vacancy link (${effectiveAtsProvider}) extracted from job posting text.`,
    };
  }

  // 3. Direct Recruitment Email embedded in description
  const directEmail = scanTextForRecruitmentEmail(description);
  if (directEmail) {
    const domain = directEmail.split("@")[1]?.toLowerCase() || null;
    return {
      discoveryUrl,
      discoveryProviders,
      sourceProvider,
      employerUrl: `mailto:${directEmail}`,
      employerDomain: domain,
      atsProvider: null,
      atsUrl: null,
      atsConfidence: "NONE",
      applicationUrl: `mailto:${directEmail}`,
      applicationChannel: DetectedChannel.EMAIL,
      attributionConfidence: "HIGH",
      attributionSource: "DESCRIPTION_EMAIL",
      requiresManualVerification: false,
      notes: `Direct employer hiring email extracted from job description (${directEmail}).`,
    };
  }

  // 4. Verified Company Profile Career Portal (MEDIUM confidence) - Never accepts generic root homepage
  if (company?.websiteUrl && typeof company.websiteUrl === "string" && company.websiteUrl.startsWith("http")) {
    const domain = extractDomain(company.websiteUrl);
    const parsedPath = company.websiteUrl.replace(/^https?:\/\/[^/]+/i, "").toLowerCase();
    const hasCareerPath = /\b(career|careers|jobs|vacancies|recruitment|work-with-us|join-us|join-our-team)\b/i.test(parsedPath);

    if (domain && !isAggregator(domain) && hasCareerPath) {
      return {
        discoveryUrl,
        discoveryProviders,
        sourceProvider,
        employerUrl: company.websiteUrl,
        employerDomain: domain,
        atsProvider: null,
        atsUrl: null,
        atsConfidence: "NONE",
        applicationUrl: company.websiteUrl,
        applicationChannel: DetectedChannel.COMPANY_APPLICATION_PAGE,
        attributionConfidence: "MEDIUM",
        attributionSource: "VERIFIED_COMPANY_CAREERS",
        requiresManualVerification: true,
        notes: `Verified employer career portal from company profile (${domain}). Manual review required before application.`,
      };
    }
  }

  // 5. Aggregator Discovery Reference Only (NONE confidence) - Never guesses or invents URLs
  const discoveryDomain = extractDomain(discoveryUrl);
  return {
    discoveryUrl,
    discoveryProviders,
    sourceProvider,
    employerUrl: null,
    employerDomain: discoveryDomain,
    atsProvider: null,
    atsUrl: null,
    atsConfidence: "NONE",
    applicationUrl: discoveryUrl,
    applicationChannel: isAggregator(discoveryDomain)
      ? DetectedChannel.JOB_BOARD
      : DetectedChannel.EXTERNAL_APPLICATION,
    attributionConfidence: "NONE",
    attributionSource: "AGGREGATOR_ONLY",
    requiresManualVerification: true,
    notes: `Discovery vacancy on ${sourceProvider}. No direct employer URL returned in provider metadata.`,
  };
}
