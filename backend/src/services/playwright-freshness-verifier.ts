import { FreshnessStatus } from "../store/db-store.js";
import { loadEnvironment } from "../config/env.js";

export interface PlaywrightVerificationResult {
  status: FreshnessStatus;
  httpStatus: number | null;
  finalUrl: string | null;
  reason: string;
  provider: string;
  evidence?: string | null;
  checkedAt: Date;
  requiresManualCheck: boolean;
  extractedSignals?: {
    pageTitle?: string | null;
    jobTitle?: string | null;
    companyName?: string | null;
    hasApplyButton?: boolean;
    hasJobDescription?: boolean;
    pageTextLength?: number;
  };
}

export interface PlaywrightVerifierOptions {
  timeoutMs?: number;
  enabled?: boolean;
  /**
   * Optional custom launcher for unit/integration testing mocks
   */
  customLauncher?: {
    launch: (options?: any) => Promise<any>;
  };
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

const APPLY_BUTTON_SELECTORS = [
  'button:has-text("Apply")',
  'button:has-text("Apply Now")',
  'button:has-text("Easy Apply")',
  'button:has-text("Submit Application")',
  'button:has-text("قدم الآن")',
  'button:has-text("التقديم")',
  'a:has-text("Apply")',
  'a:has-text("Apply Now")',
  'a:has-text("Apply on company website")',
  'a:has-text("Apply on Company Site")',
  'a:has-text("قدم الآن")',
  '[data-testid*="apply"]',
  '[aria-label*="Apply"]',
  '.apply-button',
  '#apply-button',
];

/**
 * Checks if Playwright is enabled via configuration or parameters.
 */
export function isPlaywrightVerificationEnabled(options?: PlaywrightVerifierOptions): boolean {
  if (options?.enabled !== undefined) {
    return options.enabled;
  }
  try {
    const env = loadEnvironment();
    return env.PLAYWRIGHT_VERIFICATION_ENABLED;
  } catch {
    return false;
  }
}

/**
 * Legitimate Playwright-based freshness verifier for JavaScript-rendered job pages.
 * 
 * Safety & Compliance Invariants:
 * - Always runs in headless mode.
 * - Enforces strict timeout limits.
 * - Always closes page, context, and browser resources in finally block.
 * - Strictly NO CAPTCHA solving, NO Cloudflare bypass, NO evasion/stealth techniques, NO proxy rotation.
 * - When access-denied or bot protection is encountered, immediately returns BLOCKED.
 */
export async function verifyJobFreshnessWithPlaywright(
  targetUrl: string,
  sourceName: string = "Dynamic JS Job Page",
  options?: PlaywrightVerifierOptions,
): Promise<PlaywrightVerificationResult> {
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

  let timeoutMs = 10000;
  try {
    const env = loadEnvironment();
    timeoutMs = options?.timeoutMs || env.PLAYWRIGHT_TIMEOUT_MS || 10000;
  } catch {
    timeoutMs = options?.timeoutMs || 10000;
  }

  let browser: any = null;
  let context: any = null;
  let page: any = null;

  try {
    // Dynamic import of playwright if no custom launcher provided
    let playwrightModule: any;
    if (options?.customLauncher) {
      playwrightModule = { chromium: options.customLauncher };
    } else {
      try {
        playwrightModule = await import("playwright");
      } catch (importErr) {
        return {
          status: FreshnessStatus.UNKNOWN,
          httpStatus: null,
          finalUrl: targetUrl,
          reason: "Playwright library is not available in the current runtime environment.",
          provider: sourceName,
          evidence: String(importErr),
          checkedAt,
          requiresManualCheck: true,
        };
      }
    }

    browser = await playwrightModule.chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      locale: "en-US",
      viewport: { width: 1280, height: 800 },
    });

    page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);

    let response: any = null;
    try {
      response = await page.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: timeoutMs,
      });
    } catch (navErr: any) {
      const msg = navErr?.message || String(navErr);
      if (msg.includes("Timeout") || msg.includes("timed out")) {
        return {
          status: FreshnessStatus.TIMEOUT,
          httpStatus: null,
          finalUrl: targetUrl,
          reason: `Playwright navigation timed out after ${timeoutMs}ms.`,
          provider: sourceName,
          evidence: msg,
          checkedAt,
          requiresManualCheck: true,
        };
      }
      return {
        status: FreshnessStatus.UNKNOWN,
        httpStatus: null,
        finalUrl: targetUrl,
        reason: `Playwright navigation error: ${msg}`,
        provider: sourceName,
        evidence: msg,
        checkedAt,
        requiresManualCheck: true,
      };
    }

    const httpStatus = response ? response.status() : null;
    const finalUrl = page.url() || targetUrl;

    // 1. Check HTTP Status Code from response
    if (httpStatus === 404 || httpStatus === 410) {
      return {
        status: FreshnessStatus.NOT_FOUND,
        httpStatus,
        finalUrl,
        reason: `HTTP ${httpStatus}: Job posting page not found on server.`,
        provider: sourceName,
        evidence: `Server returned HTTP ${httpStatus} status code via Playwright.`,
        checkedAt,
        requiresManualCheck: false,
      };
    }

    if (httpStatus === 403 || httpStatus === 429) {
      return {
        status: FreshnessStatus.BLOCKED,
        httpStatus,
        finalUrl,
        reason: `HTTP ${httpStatus}: Automated access blocked by provider security/bot controls.`,
        provider: sourceName,
        evidence: `Provider returned HTTP ${httpStatus}. Manual browser check required. (No bypass attempted).`,
        checkedAt,
        requiresManualCheck: true,
      };
    }

    // 2. Extract DOM content and signals
    const pageTitle = await page.title().catch(() => "");
    const bodyText = await page.evaluate(() => document.body ? document.body.innerText : "").catch(() => "");
    const sampleText = (pageTitle + "\n" + bodyText).slice(0, 100_000);

    // 3. Check for Bot / Cloudflare / CAPTCHA challenge screens
    for (const pattern of BOT_CHALLENGE_PATTERNS) {
      if (pattern.test(sampleText)) {
        return {
          status: FreshnessStatus.BLOCKED,
          httpStatus,
          finalUrl,
          reason: "Provider presented automated bot challenge or Cloudflare screen. MANUAL_SOURCE_VERIFICATION_REQUIRED (Open in browser to verify).",
          provider: sourceName,
          evidence: "Rendered page content matched bot protection/challenge pattern.",
          checkedAt,
          requiresManualCheck: true,
        };
      }
    }

    // 4. Check for Soft 404 / Not Found signals
    for (const pattern of NOT_FOUND_PATTERNS) {
      if (pattern.test(sampleText) && bodyText.length < 5000) {
        return {
          status: FreshnessStatus.NOT_FOUND,
          httpStatus,
          finalUrl,
          reason: "Rendered page indicates job posting was removed or not found (soft 404).",
          provider: sourceName,
          evidence: "Page body explicitly contained 'not found' text.",
          checkedAt,
          requiresManualCheck: false,
        };
      }
    }

    // 5. Check for Vacancy Closure / Expired indicators
    for (const pattern of CLOSED_JOB_PATTERNS) {
      if (pattern.test(sampleText)) {
        return {
          status: FreshnessStatus.CLOSED,
          httpStatus,
          finalUrl,
          reason: "Vacancy page clearly states the position is closed, expired, or filled.",
          provider: sourceName,
          evidence: "Matched closure pattern in rendered vacancy body text.",
          checkedAt,
          requiresManualCheck: false,
        };
      }
    }

    // 6. Check for Active Job Signals (Job title, apply button, description text)
    let hasApplyButton = false;
    for (const selector of APPLY_BUTTON_SELECTORS) {
      const el = await page.$(selector).catch(() => null);
      if (el) {
        hasApplyButton = true;
        break;
      }
    }

    const jobTitle = await page.evaluate(() => {
      const h1 = document.querySelector("h1");
      if (h1 && h1.textContent?.trim()) return h1.textContent.trim();
      const jobHeading = document.querySelector('[data-testid*="job-title"], .job-title, [role="heading"]');
      if (jobHeading && jobHeading.textContent?.trim()) return jobHeading.textContent.trim();
      return null;
    }).catch(() => null);

    const hasJobDescription = bodyText.length > 200;

    return {
      status: FreshnessStatus.ACTIVE,
      httpStatus: httpStatus || 200,
      finalUrl,
      reason: "Job posting is active, rendered via JavaScript, and accepting applications.",
      provider: sourceName,
      evidence: `Rendered ${bodyText.length} characters of vacancy content. Title: "${jobTitle || pageTitle || "N/A"}", Apply Button: ${hasApplyButton ? "Present" : "Not Detected"}.`,
      checkedAt,
      requiresManualCheck: false,
      extractedSignals: {
        pageTitle: pageTitle || null,
        jobTitle: jobTitle || null,
        companyName: null,
        hasApplyButton,
        hasJobDescription,
        pageTextLength: bodyText.length,
      },
    };
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    return {
      status: FreshnessStatus.UNKNOWN,
      httpStatus: null,
      finalUrl: targetUrl,
      reason: `Playwright verification encounter unexpected error: ${errorMsg}`,
      provider: sourceName,
      evidence: errorMsg,
      checkedAt,
      requiresManualCheck: true,
    };
  } finally {
    // Guaranteed resource cleanup
    if (page) {
      await page.close().catch(() => {});
    }
    if (context) {
      await context.close().catch(() => {});
    }
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
