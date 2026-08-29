import {
  createTimeoutController,
  isTimeoutError,
  MAX_ADAPTER_TIMEOUT_MS,
} from "./adapters/http-timeout.js";
import { FreshnessStatus, JobStatus, PreparationStatus, memoryStore, type PreparedApplicationRecord } from "../store/db-store.js";
import { AppError } from "../utils/app-error.js";
import { createAuditLog } from "./audit-service.js";
import {
  verifyJobFreshnessWithPlaywright,
  isPlaywrightVerificationEnabled,
  type PlaywrightVerifierOptions,
} from "./playwright-freshness-verifier.js";

export interface FreshnessVerificationOptions extends PlaywrightVerifierOptions {
  skipPlaywrightFallback?: boolean;
}

export interface FreshnessVerificationResult {
  status: FreshnessStatus;
  httpStatus: number | null;
  finalUrl: string | null;
  reason: string;
  provider: string;
  evidence?: string | null;
  checkedAt: Date;
  requiresManualCheck: boolean;
}

const CLOSED_JOB_PATTERNS = [
  /\b(?:job|position|vacancy|opening|posting)\s+(?:is\s+)?(?:closed|expired|filled|no longer available|no longer accepting applications|inactive|removed)\b/i,
  /\b(?:this\s+job\s+has\s+expired|this\s+position\s+has\s+been\s+filled|applications\s+are\s+closed|vacancy\s+is\s+no\s+longer\s+active)\b/i,
  /\b(?:sorry,\s+this\s+job\s+is\s+no\s+longer\s+available|job\s+listing\s+has\s+ended)\b/i,
  /(?:لم\s*يعد\s*هذا\s*الإعلان\s*متاحاً|تم\s*إغلاق\s*الوظيفة|الوظيفة\s*مغلقة|إنتهت\s*صلاحية\s*الإعلان|تم\s*شغل\s*الوظيفة)/i,
];

const BOT_CHALLENGE_PATTERNS = [
  /\b(?:attention\s+required!\s*\|\s*cloudflare|just\s+a\s+moment\.\.\.|cf-browser-verification|ddos-guard|human\s+verification|verify\s+you\s+are\s+human|challenge-running)\b/i,
  /\b(?:access\s+denied|bot\s+detection|perimeterx|incapsula|akamai\s+bot\s+manager)\b/i,
];

const NOT_FOUND_PATTERNS = [
  /\b(?:404\s+not\s+found|page\s+not\s+found|we\s+couldn't\s+find\s+that\s+page|job\s+not\s+found)\b/i,
  /(?:الصفحة\s*غير\s*موجودة|خطأ\s*404)/i,
];

/**
 * Checks external job URL accessibility and freshness.
 * Layer 1: Fast HTTP GET verification with timeout.
 * Layer 2 (Optional Fallback): Headless Playwright browser verification for JavaScript-heavy dynamic SPAs.
 * Respects anti-bot protections, CAPTCHAs, and access restrictions without bypass.
 */
export async function verifyJobFreshness(
  targetUrl: string,
  sourceName: string = "External Provider",
  options?: FreshnessVerificationOptions,
): Promise<FreshnessVerificationResult> {
  const checkedAt = new Date();

  if (!targetUrl || !targetUrl.startsWith("http")) {
    return {
      status: FreshnessStatus.NOT_FOUND,
      httpStatus: null,
      finalUrl: targetUrl || null,
      reason: "Missing or invalid job URL string.",
      provider: sourceName,
      evidence: "URL is empty or does not use HTTP/HTTPS protocol.",
      checkedAt,
      requiresManualCheck: true,
    };
  }

  const { controller, signal, cleanup } = createTimeoutController({
    timeoutMs: MAX_ADAPTER_TIMEOUT_MS,
  });

  let httpResult: FreshnessVerificationResult | null = null;
  let needsJsEvaluation = false;

  try {
    const response = await fetch(targetUrl, {
      method: "GET",
      signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
      },
    });

    const httpStatus = response.status;
    const finalUrl = response.url || targetUrl;

    // 1. 404 / 410 Not Found
    if (httpStatus === 404 || httpStatus === 410) {
      return {
        status: FreshnessStatus.NOT_FOUND,
        httpStatus,
        finalUrl,
        reason: `HTTP ${httpStatus}: Job posting page not found on server.`,
        provider: sourceName,
        evidence: `Server returned HTTP ${httpStatus} status code.`,
        checkedAt,
        requiresManualCheck: false,
      };
    }

    // 2. 403 Forbidden / 429 Rate Limit / Bot Block
    if (httpStatus === 403 || httpStatus === 429) {
      return {
        status: FreshnessStatus.BLOCKED,
        httpStatus,
        finalUrl,
        reason: `HTTP ${httpStatus}: Automated access blocked by provider security/bot controls.`,
        provider: sourceName,
        evidence: `Provider returned HTTP ${httpStatus}. Manual browser check required.`,
        checkedAt,
        requiresManualCheck: true,
      };
    }

    // 3. Inspect page body for 200 OK responses
    if (response.ok) {
      const text = await response.text();
      const sampleText = text.slice(0, 100_000); // Check first 100KB

      // Check Bot/Captcha challenges
      for (const pattern of BOT_CHALLENGE_PATTERNS) {
        if (pattern.test(sampleText)) {
          return {
            status: FreshnessStatus.BLOCKED,
            httpStatus,
            finalUrl,
            reason: "Provider presented automated bot challenge or Cloudflare screen.",
            provider: sourceName,
            evidence: "Page content matched bot protection / CAPTCHA pattern.",
            checkedAt,
            requiresManualCheck: true,
          };
        }
      }

      // Check soft 404s
      for (const pattern of NOT_FOUND_PATTERNS) {
        if (pattern.test(sampleText) && sampleText.length < 5000) {
          return {
            status: FreshnessStatus.NOT_FOUND,
            httpStatus,
            finalUrl,
            reason: "Page content indicates job posting was removed or not found (soft 404).",
            provider: sourceName,
            evidence: "Page body explicitly contained 'not found' text.",
            checkedAt,
            requiresManualCheck: false,
          };
        }
      }

      // Check vacancy closure indicators
      for (const pattern of CLOSED_JOB_PATTERNS) {
        if (pattern.test(sampleText)) {
          return {
            status: FreshnessStatus.CLOSED,
            httpStatus,
            finalUrl,
            reason: "Vacancy page clearly states the position is closed, expired, or filled.",
            provider: sourceName,
            evidence: "Matched closure pattern in vacancy body text.",
            checkedAt,
            requiresManualCheck: false,
          };
        }
      }

      // If page is very short or is a JavaScript SPA shell lacking body text, flag for optional Playwright rendering
      if (text.length < 1200 && (text.includes("root") || text.includes("app") || text.includes("noscript") || text.includes("react") || text.includes("vue") || text.includes("next"))) {
        needsJsEvaluation = true;
      } else {
        // Page is reachable and active via standard HTTP
        return {
          status: FreshnessStatus.ACTIVE,
          httpStatus,
          finalUrl,
          reason: "Job posting is active, reachable, and accepting applications.",
          provider: sourceName,
          evidence: `HTTP 200 OK received with ${text.length} bytes of vacancy HTML.`,
          checkedAt,
          requiresManualCheck: false,
        };
      }
    } else {
      // 5xx Server Errors or other codes
      httpResult = {
        status: FreshnessStatus.UNKNOWN,
        httpStatus,
        finalUrl,
        reason: `HTTP ${httpStatus}: Provider server returned an unexpected error response.`,
        provider: sourceName,
        evidence: `HTTP status ${httpStatus}.`,
        checkedAt,
        requiresManualCheck: true,
      };
      needsJsEvaluation = true;
    }
  } catch (err: any) {
    if (isTimeoutError(err)) {
      httpResult = {
        status: FreshnessStatus.TIMEOUT,
        httpStatus: null,
        finalUrl: targetUrl,
        reason: `Connection timed out after 10,000ms hard maximum ceiling.`,
        provider: sourceName,
        evidence: `AbortSignal triggered after ${MAX_ADAPTER_TIMEOUT_MS}ms.`,
        checkedAt,
        requiresManualCheck: true,
      };
    } else {
      httpResult = {
        status: FreshnessStatus.UNKNOWN,
        httpStatus: null,
        finalUrl: targetUrl,
        reason: `Network error or connection refused: ${err.message || "Unknown error"}`,
        provider: sourceName,
        evidence: String(err),
        checkedAt,
        requiresManualCheck: true,
      };
    }
    needsJsEvaluation = true;
  } finally {
    cleanup();
  }

  // Layer 2: Optional Playwright Fallback Verifier for dynamic JavaScript pages
  if (needsJsEvaluation && !options?.skipPlaywrightFallback && isPlaywrightVerificationEnabled(options)) {
    try {
      const pwResult = await verifyJobFreshnessWithPlaywright(targetUrl, sourceName, options);
      if (
        pwResult.status === FreshnessStatus.ACTIVE ||
        pwResult.status === FreshnessStatus.CLOSED ||
        pwResult.status === FreshnessStatus.NOT_FOUND ||
        pwResult.status === FreshnessStatus.BLOCKED
      ) {
        return {
          status: pwResult.status,
          httpStatus: pwResult.httpStatus,
          finalUrl: pwResult.finalUrl,
          reason: pwResult.reason,
          provider: pwResult.provider,
          evidence: pwResult.evidence,
          checkedAt: pwResult.checkedAt,
          requiresManualCheck: pwResult.requiresManualCheck,
        };
      }
    } catch {
      // Gracefully fall through to httpResult on Playwright unexpected error
    }
  }

  if (httpResult) {
    return httpResult;
  }

  return {
    status: FreshnessStatus.ACTIVE,
    httpStatus: 200,
    finalUrl: targetUrl,
    reason: "Job posting is active and accepting applications.",
    provider: sourceName,
    evidence: "Standard HTTP verification succeeded.",
    checkedAt,
    requiresManualCheck: false,
  };
}

/**
 * Runs freshness check on a prepared application record and updates its state.
 * Freshness verification order:
 * 1. employerUrl
 * 2. atsUrl
 * 3. direct applicationUrl
 * 4. provider discoveryUrl
 * If provider discovery page is blocked but original employer/ATS URL exists -> verify employer/ATS URL.
 * If everything is blocked -> MANUAL_SOURCE_VERIFICATION_REQUIRED.
 */
export async function verifyApplicationFreshness(
  preparedApplicationId: string,
  options?: FreshnessVerificationOptions,
): Promise<PreparedApplicationRecord> {
  const prep = memoryStore.preparedApplications.get(preparedApplicationId);
  if (!prep) {
    throw new AppError(
      `Prepared application with ID ${preparedApplicationId} not found.`,
      404,
      "PREPARED_APPLICATION_NOT_FOUND",
    );
  }

  // 1. Determine candidate URLs to check in order of priority
  const candidateUrls: Array<{ url: string; label: string; isEmployer: boolean }> = [];

  if (prep.employerUrl && prep.employerUrl.startsWith("http")) {
    candidateUrls.push({ url: prep.employerUrl, label: prep.job?.company?.name || "Direct Employer Portal", isEmployer: true });
  }
  if (prep.atsUrl && prep.atsUrl.startsWith("http") && prep.atsUrl !== prep.employerUrl) {
    candidateUrls.push({ url: prep.atsUrl, label: `${prep.atsProvider || "ATS"} Application Portal`, isEmployer: true });
  }
  if (prep.originalEmployerUrl && prep.originalEmployerUrl.startsWith("http") && prep.originalEmployerUrl !== prep.employerUrl && prep.originalEmployerUrl !== prep.atsUrl) {
    candidateUrls.push({ url: prep.originalEmployerUrl, label: "Original Employer URL", isEmployer: true });
  }
  if (prep.applicationUrl && prep.applicationUrl.startsWith("http") && !candidateUrls.some((c) => c.url === prep.applicationUrl)) {
    candidateUrls.push({ url: prep.applicationUrl, label: "Direct Application URL", isEmployer: false });
  }

  const fallbackDiscoveryUrl = prep.discoveryUrl || prep.canonicalUrl || prep.sourceUrl || "";
  if (fallbackDiscoveryUrl && !candidateUrls.some((c) => c.url === fallbackDiscoveryUrl)) {
    candidateUrls.push({ url: fallbackDiscoveryUrl, label: prep.sourceProvider || "Provider Discovery Portal", isEmployer: false });
  }

  let finalResult: FreshnessVerificationResult | null = null;

  for (const entry of candidateUrls) {
    const res = await verifyJobFreshness(entry.url, entry.label, options);
    if (res.status === FreshnessStatus.ACTIVE) {
      finalResult = res;
      break;
    }
    // Result prioritization hierarchy:
    // 1. ACTIVE wins immediately (handled by break above)
    // 2. CLOSED (confirmed closure) is definitive
    // 3. NOT_FOUND (confirmed 404/410)
    // 4. BLOCKED (bot protection / challenge)
    // 5. TIMEOUT / UNKNOWN (transient errors)
    if (!finalResult) {
      finalResult = res;
    } else if (res.status === FreshnessStatus.CLOSED) {
      finalResult = res;
    } else if (res.status === FreshnessStatus.NOT_FOUND && finalResult.status !== FreshnessStatus.CLOSED) {
      finalResult = res;
    } else if (
      res.status === FreshnessStatus.BLOCKED &&
      (finalResult.status === FreshnessStatus.TIMEOUT || finalResult.status === FreshnessStatus.UNKNOWN)
    ) {
      finalResult = res;
    }
  }

  if (!finalResult) {
    finalResult = {
      status: FreshnessStatus.NOT_FOUND,
      httpStatus: null,
      finalUrl: null,
      reason: "No usable job URL available for freshness verification.",
      provider: prep.sourceProvider || "JobHunter-AI",
      checkedAt: new Date(),
      requiresManualCheck: true,
    };
  }

  // If source is Jooble and returned BLOCKED, classify with exact MANUAL_SOURCE_VERIFICATION_REQUIRED reason
  if (
    finalResult.status === FreshnessStatus.BLOCKED &&
    (finalResult.provider.toLowerCase().includes("jooble") || (finalResult.finalUrl && finalResult.finalUrl.includes("jooble.org")))
  ) {
    finalResult.reason = "Provider enforces Cloudflare/WAF bot protection. MANUAL_SOURCE_VERIFICATION_REQUIRED (Open in browser to verify).";
  }

  prep.freshnessStatus = finalResult.status;
  prep.freshnessCheckedAt = finalResult.checkedAt;
  prep.freshnessHttpStatus = finalResult.httpStatus;
  prep.freshnessFinalUrl = finalResult.finalUrl;
  prep.freshnessReason = finalResult.reason;
  prep.freshnessProvider = finalResult.provider;
  prep.freshnessEvidence = finalResult.evidence || null;
  prep.requiresManualFreshnessCheck = finalResult.requiresManualCheck;
  prep.updatedAt = new Date();

  memoryStore.preparedApplications.set(prep.id, prep);

  // Sync to underlying job record when confirmed CLOSED or NOT_FOUND
  if (finalResult.status === FreshnessStatus.CLOSED || finalResult.status === FreshnessStatus.NOT_FOUND) {
    const job = memoryStore.jobs.get(prep.jobId);
    if (job) {
      job.status = JobStatus.CLOSED;
      job.updatedAt = new Date();
      memoryStore.jobs.set(job.id, job);
    }
  }

  await createAuditLog({
    candidateId: prep.candidateId,
    action: "JOB_FRESHNESS_VERIFIED",
    resourceType: "PreparedApplication",
    resourceId: prep.id,
    eventType: `FRESHNESS_RESULT_${finalResult.status}`,
    safeMetadata: {
      jobId: prep.jobId,
      status: finalResult.status,
      httpStatus: finalResult.httpStatus,
      targetUrl: finalResult.finalUrl,
      reason: finalResult.reason,
      requiresManualCheck: finalResult.requiresManualCheck,
    },
  });

  return prep;
}

/**
 * Batch freshness check for all prepared applications.
 */
export async function verifyAllPreparedFreshness(
  options?: FreshnessVerificationOptions,
): Promise<{
  totalChecked: number;
  activeCount: number;
  closedCount: number;
  notFoundCount: number;
  blockedCount: number;
  timeoutCount: number;
  unknownCount: number;
  results: PreparedApplicationRecord[];
}> {
  const list = Array.from(memoryStore.preparedApplications.values());

  let activeCount = 0;
  let closedCount = 0;
  let notFoundCount = 0;
  let blockedCount = 0;
  let timeoutCount = 0;
  let unknownCount = 0;
  const results: PreparedApplicationRecord[] = [];

  for (const prep of list) {
    const updated = await verifyApplicationFreshness(prep.id, options);
    results.push(updated);

    if (updated.freshnessStatus === FreshnessStatus.ACTIVE) activeCount++;
    else if (updated.freshnessStatus === FreshnessStatus.CLOSED) closedCount++;
    else if (updated.freshnessStatus === FreshnessStatus.NOT_FOUND) notFoundCount++;
    else if (updated.freshnessStatus === FreshnessStatus.BLOCKED) blockedCount++;
    else if (updated.freshnessStatus === FreshnessStatus.TIMEOUT) timeoutCount++;
    else unknownCount++;
  }

  return {
    totalChecked: list.length,
    activeCount,
    closedCount,
    notFoundCount,
    blockedCount,
    timeoutCount,
    unknownCount,
    results,
  };
}
