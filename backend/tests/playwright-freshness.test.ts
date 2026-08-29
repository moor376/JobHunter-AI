import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  verifyJobFreshnessWithPlaywright,
  isPlaywrightVerificationEnabled,
} from "../src/services/playwright-freshness-verifier.js";
import {
  verifyJobFreshness,
  verifyApplicationFreshness,
} from "../src/services/job-freshness-service.js";
import {
  FreshnessStatus,
  JobStatus,
  PreparationStatus,
  memoryStore,
  EmploymentType,
  type JobRecord,
} from "../src/store/db-store.js";
import { prepareApplicationForJob } from "../src/services/application-preparation-service.js";

describe("Playwright Freshness Verification Engine & Resource Safety Suite", { timeout: 25000 }, () => {
  let server: ReturnType<typeof createServer>;
  let baseUrl: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      const url = req.url || "/";

      // 1. Dynamic SPA page rendering job details via JavaScript
      if (url === "/spa-active-job") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>SPA Careers Portal</title></head>
            <body>
              <div id="root">
                <noscript>You need to enable JavaScript to view this application.</noscript>
              </div>
              <script>
                document.getElementById('root').innerHTML = \`
                  <main class="job-container">
                    <h1 class="job-title">Senior Legal Counsel (Banking & Finance)</h1>
                    <div class="company-name">EFG Hermes Holding</div>
                    <div class="location">Cairo, Egypt</div>
                    <div class="job-description">
                      <p>We are looking for an experienced Senior Legal Counsel to oversee corporate compliance, banking agreements, and regulatory advisory.</p>
                      <p>Key requirements: Law degree (LL.B / LL.M), 5+ years experience in banking legal affairs.</p>
                    </div>
                    <button class="btn apply-button" id="apply-btn">Apply Now</button>
                  </main>
                \`;
              </script>
            </body>
          </html>
        `);
        return;
      }

      // 2. Dynamic SPA page rendering closure notice
      if (url === "/spa-closed-job") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Job Vacancy</title></head>
            <body>
              <div id="app"></div>
              <script>
                document.getElementById('app').innerHTML = \`
                  <div>
                    <h1>Corporate Legal Specialist</h1>
                    <div class="status-banner">This job is closed and no longer accepting applications.</div>
                  </div>
                \`;
              </script>
            </body>
          </html>
        `);
        return;
      }

      // 3. Dynamic SPA soft-404 page
      if (url === "/spa-not-found") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Page Not Found</title></head>
            <body>
              <div id="root"></div>
              <script>
                document.getElementById('root').innerHTML = \`
                  <div class="error-view">
                    <h1>404 Page Not Found</h1>
                    <p>The job posting you are looking for has been removed from our server.</p>
                  </div>
                \`;
              </script>
            </body>
          </html>
        `);
        return;
      }

      // 4. HTTP 404
      if (url === "/http-404") {
        res.writeHead(404, { "Content-Type": "text/html" });
        res.end("<html><body><h1>404 Not Found</h1></body></html>");
        return;
      }

      // 5. Access denied / 403
      if (url === "/access-denied-403") {
        res.writeHead(403, { "Content-Type": "text/html" });
        res.end("<html><body><h1>403 Forbidden - Bot Access Blocked</h1></body></html>");
        return;
      }

      // 6. Cloudflare Bot Challenge page
      if (url === "/cloudflare-challenge") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Just a moment...</title></head>
            <body>
              <h1>Attention Required! | Cloudflare</h1>
              <div id="cf-browser-verification">Verify you are human to continue.</div>
            </body>
          </html>
        `);
        return;
      }

      // 7. Slow endpoint for timeout testing
      if (url === "/slow-page") {
        setTimeout(() => {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end("<html><body><h1>Delayed Response</h1></body></html>");
        }, 3000);
        return;
      }

      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("OK");
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it("successfully verifies a JavaScript-rendered dynamic active job page", async () => {
    const result = await verifyJobFreshnessWithPlaywright(
      `${baseUrl}/spa-active-job`,
      "SPA Portal",
      { timeoutMs: 8000, enabled: true },
    );

    expect(result.status).toBe(FreshnessStatus.ACTIVE);
    expect(result.httpStatus).toBe(200);
    expect(result.requiresManualCheck).toBe(false);
    expect(result.reason).toContain("active");
    expect(result.extractedSignals?.hasApplyButton).toBe(true);
    expect(result.extractedSignals?.jobTitle).toContain("Senior Legal Counsel");
  });

  it("detects closed vacancy in JavaScript-rendered DOM and returns CLOSED", async () => {
    const result = await verifyJobFreshnessWithPlaywright(
      `${baseUrl}/spa-closed-job`,
      "SPA Portal",
      { timeoutMs: 8000, enabled: true },
    );

    expect(result.status).toBe(FreshnessStatus.CLOSED);
    expect(result.requiresManualCheck).toBe(false);
    expect(result.reason).toContain("closed");
  });

  it("detects soft 404 in JavaScript-rendered DOM and returns NOT_FOUND", async () => {
    const result = await verifyJobFreshnessWithPlaywright(
      `${baseUrl}/spa-not-found`,
      "SPA Portal",
      { timeoutMs: 8000, enabled: true },
    );

    expect(result.status).toBe(FreshnessStatus.NOT_FOUND);
    expect(result.requiresManualCheck).toBe(false);
    expect(result.reason).toContain("not found");
  });

  it("detects HTTP 404 status and returns NOT_FOUND", async () => {
    const result = await verifyJobFreshnessWithPlaywright(
      `${baseUrl}/http-404`,
      "Direct Link",
      { timeoutMs: 8000, enabled: true },
    );

    expect(result.status).toBe(FreshnessStatus.NOT_FOUND);
    expect(result.httpStatus).toBe(404);
  });

  it("detects Cloudflare / Bot protection challenge and returns BLOCKED without evasion", async () => {
    const result = await verifyJobFreshnessWithPlaywright(
      `${baseUrl}/cloudflare-challenge`,
      "Protected Portal",
      { timeoutMs: 8000, enabled: true },
    );

    expect(result.status).toBe(FreshnessStatus.BLOCKED);
    expect(result.requiresManualCheck).toBe(true);
    expect(result.reason).toContain("bot challenge");
  });

  it("detects HTTP 403 Forbidden and returns BLOCKED", async () => {
    const result = await verifyJobFreshnessWithPlaywright(
      `${baseUrl}/access-denied-403`,
      "Protected Portal",
      { timeoutMs: 8000, enabled: true },
    );

    expect(result.status).toBe(FreshnessStatus.BLOCKED);
    expect(result.httpStatus).toBe(403);
    expect(result.requiresManualCheck).toBe(true);
  });

  it("handles navigation timeout cleanly without crashing and returns TIMEOUT", async () => {
    const result = await verifyJobFreshnessWithPlaywright(
      `${baseUrl}/slow-page`,
      "Slow Provider",
      { timeoutMs: 500, enabled: true },
    );

    expect(result.status).toBe(FreshnessStatus.TIMEOUT);
    expect(result.requiresManualCheck).toBe(true);
    expect(result.reason).toContain("timed out");
  });

  it("guarantees browser, context, and page resources are properly closed", async () => {
    const closePageSpy = vi.fn().mockResolvedValue(undefined);
    const closeContextSpy = vi.fn().mockResolvedValue(undefined);
    const closeBrowserSpy = vi.fn().mockResolvedValue(undefined);

    const mockPage = {
      setDefaultTimeout: vi.fn(),
      setDefaultNavigationTimeout: vi.fn(),
      goto: vi.fn().mockResolvedValue({ status: () => 200 }),
      url: () => `${baseUrl}/spa-active-job`,
      title: vi.fn().mockResolvedValue("Senior Legal Counsel"),
      evaluate: vi.fn().mockResolvedValue("Senior Legal Counsel full description text with more than 200 characters."),
      $: vi.fn().mockResolvedValue({}),
      close: closePageSpy,
    };

    const mockContext = {
      newPage: vi.fn().mockResolvedValue(mockPage),
      close: closeContextSpy,
    };

    const mockBrowser = {
      newContext: vi.fn().mockResolvedValue(mockContext),
      close: closeBrowserSpy,
    };

    const customLauncher = {
      launch: vi.fn().mockResolvedValue(mockBrowser),
    };

    const result = await verifyJobFreshnessWithPlaywright(
      `${baseUrl}/spa-active-job`,
      "Mocked Launcher",
      { customLauncher, enabled: true },
    );

    expect(result.status).toBe(FreshnessStatus.ACTIVE);
    expect(closePageSpy).toHaveBeenCalledTimes(1);
    expect(closeContextSpy).toHaveBeenCalledTimes(1);
    expect(closeBrowserSpy).toHaveBeenCalledTimes(1);
  });

  it("gracefully falls back when Playwright launch fails", async () => {
    const customLauncher = {
      launch: vi.fn().mockRejectedValue(new Error("Chromium binary missing")),
    };

    const result = await verifyJobFreshnessWithPlaywright(
      `${baseUrl}/spa-active-job`,
      "Failed Launcher",
      { customLauncher, enabled: true },
    );

    expect(result.status).toBe(FreshnessStatus.UNKNOWN);
    expect(result.reason).toContain("Chromium binary missing");
    expect(result.requiresManualCheck).toBe(true);
  });

  it("integrates Playwright fallback into verifyJobFreshness for SPA dynamic page", async () => {
    // When Playwright is enabled, verifyJobFreshness uses Playwright for SPA pages
    const result = await verifyJobFreshness(`${baseUrl}/spa-active-job`, "SPA Employer", {
      enabled: true,
      timeoutMs: 8000,
    });

    expect(result.status).toBe(FreshnessStatus.ACTIVE);
    expect(result.reason).toContain("accepting applications");
  });

  it("integrates Playwright in verifyApplicationFreshness and updates prepared application record", async () => {
    const candidate = Array.from(memoryStore.candidates.values())[0];
    const job: JobRecord = {
      id: `playwright-test-job-${Date.now()}`,
      title: "Senior Legal Counsel (Playwright Verified)",
      companyId: "comp-pw-1",
      company: { id: "comp-pw-1", name: "Alpha Financial Group", domain: "alphafg.com" },
      location: "Cairo, Egypt",
      country: "Egypt",
      city: "Cairo",
      isRemote: false,
      jobType: EmploymentType.FULL_TIME,
      description: "Senior Legal Counsel responsible for banking regulations, AML compliance, and contracts.",
      requirements: ["Law Degree", "Banking experience"],
      skills: ["Legal Advisory", "Banking Law"],
      sourceUrl: `${baseUrl}/spa-active-job`,
      canonicalUrl: `${baseUrl}/spa-active-job`,
      status: JobStatus.OPEN,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    memoryStore.jobs.set(job.id, job);

    const prep = await prepareApplicationForJob(job.id, candidate.id);
    prep.applicationUrl = `${baseUrl}/spa-active-job`;
    prep.employerUrl = `${baseUrl}/spa-active-job`;
    memoryStore.preparedApplications.set(prep.id, prep);

    const updated = await verifyApplicationFreshness(prep.id, { enabled: true, timeoutMs: 8000 });

    expect(updated.freshnessStatus).toBe(FreshnessStatus.ACTIVE);
    expect(updated.freshnessReason).toContain("accepting applications");
    expect(updated.requiresManualFreshnessCheck).toBe(false);
  });
});
