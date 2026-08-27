import {
  DetectedChannel,
  type AttributionConfidence,
  type CompanyRecord,
  type JobRecord,
} from "../store/db-store.js";
import type { NormalizedJob } from "./adapters/types.js";

export interface JobAttributionResult {
  discoveryUrl: string;
  sourceProvider: string;
  originalEmployerUrl: string | null;
  originalEmployerDomain: string | null;
  attributionConfidence: AttributionConfidence;
  applyUrl: string;
  applicationChannel: DetectedChannel;
  attributionSource: "DIRECT_METADATA" | "DESCRIPTION_ATS_LINK" | "DESCRIPTION_EMAIL" | "VERIFIED_COMPANY_CAREERS" | "AGGREGATOR_ONLY";
  notes?: string;
}

const KNOWN_AGGREGATOR_DOMAINS = new Set([
  "jooble.org",
  "jooble.com",
  "adzuna.com",
  "adzuna.co.uk",
  "indeed.com",
  "indeed.co.uk",
  "glassdoor.com",
  "monster.com",
  "ziprecruiter.com",
  "simplyhired.com",
  "bayt.com",
  "wuzzuf.net",
  "forasna.com",
  "gulftalent.com",
  "tanqeeb.com",
]);

const KNOWN_ATS_DOMAINS = [
  "myworkdayjobs.com",
  "greenhouse.io",
  "boards.greenhouse.io",
  "jobs.lever.co",
  "lever.co",
  "taleo.net",
  "oraclecloud.com",
  "ashbyhq.com",
  "smartrecruiters.com",
  "workable.com",
  "applytojob.com",
  "bamboohr.com",
  "breezy.hr",
  "recruitee.com",
  "icims.com",
  "jobvite.com",
  "personio.de",
  "personio.com",
  "pinpointhq.com",
  "teamtailor.com",
  "rippling-ats.com",
];

/**
 * Safely extracts host domain from a URL string without throwing.
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
 * Checks if a domain belongs to a known aggregator/job board.
 */
export function isAggregatorDomain(domain: string | null): boolean {
  if (!domain) return false;
  for (const agg of KNOWN_AGGREGATOR_DOMAINS) {
    if (domain === agg || domain.endsWith(`.${agg}`)) return true;
  }
  return false;
}

/**
 * Checks if a domain is a known ATS/direct application platform.
 */
export function isAtsDomain(domain: string | null): boolean {
  if (!domain) return false;
  for (const ats of KNOWN_ATS_DOMAINS) {
    if (domain === ats || domain.endsWith(`.${ats}`)) return true;
  }
  return false;
}

/**
 * Searches text for explicit HTTP/HTTPS URLs matching known ATS or company careers domains.
 * NEVER guesses or fabricates URLs.
 */
export function extractAtsUrlsFromText(text: string): string[] {
  if (!text) return [];
  const urlRegex = /https?:\/\/[^\s"'<>()[\]{}|\\^`]+/gi;
  const matches = text.match(urlRegex) || [];
  const found: string[] = [];

  for (const rawUrl of matches) {
    const cleanUrl = rawUrl.replace(/[.,;:!?)]+$/, "");
    const domain = extractDomain(cleanUrl);
    if (!domain) continue;

    if (isAtsDomain(domain)) {
      found.push(cleanUrl);
    } else if (
      (cleanUrl.toLowerCase().includes("/careers") ||
        cleanUrl.toLowerCase().includes("/jobs") ||
        cleanUrl.toLowerCase().includes("/positions") ||
        domain.startsWith("careers.") ||
        domain.startsWith("jobs.")) &&
      !isAggregatorDomain(domain)
    ) {
      found.push(cleanUrl);
    }
  }

  return Array.from(new Set(found));
}

/**
 * Extracts direct recruitment email from text.
 */
export function extractRecruitmentEmailFromText(text: string): string | null {
  if (!text) return null;
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  const matches = text.match(emailRegex) || [];

  for (const em of matches) {
    const lower = em.toLowerCase();
    if (
      lower.includes("career") ||
      lower.includes("job") ||
      lower.includes("recruit") ||
      lower.includes("hr") ||
      lower.includes("talent") ||
      lower.includes("apply") ||
      lower.includes("hiring")
    ) {
      if (!lower.includes("example.com") && !lower.includes("jooble") && !lower.includes("adzuna")) {
        return em;
      }
    }
  }

  return null;
}

/**
 * Attributes a job vacancy to its original employer application URL and channel.
 * Strictly adheres to zero-hallucination / zero-guessing rules.
 */
export function attributeJobSource(
  job: Partial<JobRecord> | Partial<NormalizedJob>,
  company?: Partial<CompanyRecord>,
): JobAttributionResult {
  const discoveryUrl = (job.canonicalUrl || job.sourceUrl || "https://jooble.org").trim();
  const sourceProvider = (job as any).jobSource?.name || "Jooble Real Jobs API";
  const rawMeta = (job as any).rawReferenceMetadata || (job as any).rawMetadata || {};
  const description = job.description || "";

  // 1. Direct Employer URL in API Raw Metadata
  const explicitDirectUrl =
    rawMeta.original_link ||
    rawMeta.direct_url ||
    rawMeta.employer_url ||
    rawMeta.external_url ||
    rawMeta.apply_url;

  if (typeof explicitDirectUrl === "string" && explicitDirectUrl.startsWith("http")) {
    const domain = extractDomain(explicitDirectUrl);
    if (domain && !isAggregatorDomain(domain)) {
      return {
        discoveryUrl,
        sourceProvider,
        originalEmployerUrl: explicitDirectUrl,
        originalEmployerDomain: domain,
        attributionConfidence: "HIGH",
        applyUrl: explicitDirectUrl,
        applicationChannel: isAtsDomain(domain)
          ? DetectedChannel.COMPANY_APPLICATION_PAGE
          : DetectedChannel.EXTERNAL_APPLICATION,
        attributionSource: "DIRECT_METADATA",
        notes: `Attributed from verified provider API metadata field (${domain}).`,
      };
    }
  }

  // 2. Direct ATS or Careers URL embedded in Vacancy Description Text
  const atsUrls = extractAtsUrlsFromText(description);
  if (atsUrls.length > 0) {
    const selectedAtsUrl = atsUrls[0];
    const domain = extractDomain(selectedAtsUrl);
    return {
      discoveryUrl,
      sourceProvider,
      originalEmployerUrl: selectedAtsUrl,
      originalEmployerDomain: domain,
      attributionConfidence: "HIGH",
      applyUrl: selectedAtsUrl,
      applicationChannel: DetectedChannel.COMPANY_APPLICATION_PAGE,
      attributionSource: "DESCRIPTION_ATS_LINK",
      notes: `Direct employer/ATS application link extracted from job description (${domain}).`,
    };
  }

  // 3. Direct Email in Vacancy Description Text
  const directEmail = extractRecruitmentEmailFromText(description);
  if (directEmail) {
    const domain = directEmail.split("@")[1]?.toLowerCase() || null;
    return {
      discoveryUrl,
      sourceProvider,
      originalEmployerUrl: `mailto:${directEmail}`,
      originalEmployerDomain: domain,
      attributionConfidence: "HIGH",
      applyUrl: `mailto:${directEmail}`,
      applicationChannel: DetectedChannel.EMAIL,
      attributionSource: "DESCRIPTION_EMAIL",
      notes: `Direct employer hiring inbox extracted from vacancy text (${directEmail}).`,
    };
  }

  // 4. Verified Company Record Careers / Website URL
  if (company?.websiteUrl && typeof company.websiteUrl === "string" && company.websiteUrl.startsWith("http")) {
    const domain = extractDomain(company.websiteUrl);
    if (domain && !isAggregatorDomain(domain)) {
      return {
        discoveryUrl,
        sourceProvider,
        originalEmployerUrl: company.websiteUrl,
        originalEmployerDomain: domain,
        attributionConfidence: "MEDIUM",
        applyUrl: company.websiteUrl,
        applicationChannel: DetectedChannel.COMPANY_APPLICATION_PAGE,
        attributionSource: "VERIFIED_COMPANY_CAREERS",
        notes: `Verified employer web portal from company profile (${domain}).`,
      };
    }
  }

  // 5. Fallback: Aggregator Discovery URL Only
  const discDomain = extractDomain(discoveryUrl);
  return {
    discoveryUrl,
    sourceProvider,
    originalEmployerUrl: null,
    originalEmployerDomain: discDomain,
    attributionConfidence: "NONE",
    applyUrl: discoveryUrl,
    applicationChannel: isAggregatorDomain(discDomain)
      ? DetectedChannel.JOB_BOARD
      : DetectedChannel.EXTERNAL_APPLICATION,
    attributionSource: "AGGREGATOR_ONLY",
    notes: `No direct employer URL returned by provider. Application will use ${sourceProvider} discovery portal.`,
  };
}
