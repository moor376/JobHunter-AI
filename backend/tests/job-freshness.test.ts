import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  verifyJobFreshness,
  verifyApplicationFreshness,
} from "../src/services/job-freshness-service.js";
import {
  approvePreparedApplication,
  prepareApplicationForJob,
} from "../src/services/application-preparation-service.js";
import {
  FreshnessStatus,
  PreparationStatus,
  memoryStore,
  EmploymentType,
  JobStatus,
  type JobRecord,
} from "../src/store/db-store.js";

describe("Job Freshness Verification Engine & Approval Gate", () => {
  let server: ReturnType<typeof createServer>;
  let baseUrl: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      const url = req.url || "/";

      if (url === "/active-job") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <html>
            <head><title>Senior Legal Counsel - Cairo Corp</title></head>
            <body>
              <h1>Senior Legal Counsel</h1>
              <p>We are hiring a full-time Senior Legal Counsel in Cairo, Egypt.</p>
              <button>Apply Now</button>
            </body>
          </html>
        `);
        return;
      }

      if (url === "/closed-job-text") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <html>
            <head><title>Job Closed</title></head>
            <body>
              <h1>Senior Legal Counsel</h1>
              <div class="alert">This job has expired and is no longer accepting applications.</div>
            </body>
          </html>
        `);
        return;
      }

      if (url === "/closed-arabic-job") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`
          <html>
            <body>
              <h1>محامي شؤون قانونية</h1>
              <div>تم إغلاق الوظيفة ولم يعد هذا الإعلان متاحاً للتقديم.</div>
            </body>
          </html>
        `);
        return;
      }

      if (url === "/not-found-404") {
        res.writeHead(404, { "Content-Type": "text/html" });
        res.end("<html><body><h1>404 Not Found</h1></body></html>");
        return;
      }

      if (url === "/redirect-to-active") {
        res.writeHead(302, { Location: "/active-job" });
        res.end();
        return;
      }

      if (url === "/bot-blocked-403") {
        res.writeHead(403, { "Content-Type": "text/html" });
        res.end("<html><body><h1>403 Forbidden - Bot Access Denied</h1></body></html>");
        return;
      }

      if (url === "/cloudflare-challenge") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <html>
            <head><title>Just a moment...</title></head>
            <body>
              <h1>Attention Required! | Cloudflare</h1>
              <div id="cf-browser-verification">Please verify you are human</div>
            </body>
          </html>
        `);
        return;
      }

      if (url === "/hanging-timeout") {
        // Do not respond, keep connection open to test timeout
        return;
      }

      if (url === "/server-error-500") {
        res.writeHead(500, { "Content-Type": "text/html" });
        res.end("<html><body>500 Internal Server Error</body></html>");
        return;
      }

      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  describe("Job URL Freshness Detection Scenarios", () => {
    it("detects ACTIVE job when vacancy page is reachable and open", async () => {
      const res = await verifyJobFreshness(`${baseUrl}/active-job`, "Test Provider");
      expect(res.status).toBe(FreshnessStatus.ACTIVE);
      expect(res.httpStatus).toBe(200);
      expect(res.requiresManualCheck).toBe(false);
    });

    it("detects CLOSED job when page states vacancy is closed or expired", async () => {
      const res = await verifyJobFreshness(`${baseUrl}/closed-job-text`, "Test Provider");
      expect(res.status).toBe(FreshnessStatus.CLOSED);
      expect(res.reason).toContain("closed, expired, or filled");
    });

    it("detects CLOSED job with Arabic closure notices (تم إغلاق الوظيفة)", async () => {
      const res = await verifyJobFreshness(`${baseUrl}/closed-arabic-job`, "Test Provider");
      expect(res.status).toBe(FreshnessStatus.CLOSED);
    });

    it("detects NOT_FOUND on HTTP 404 response", async () => {
      const res = await verifyJobFreshness(`${baseUrl}/not-found-404`, "Test Provider");
      expect(res.status).toBe(FreshnessStatus.NOT_FOUND);
      expect(res.httpStatus).toBe(404);
    });

    it("follows redirects and detects ACTIVE final destination", async () => {
      const res = await verifyJobFreshness(`${baseUrl}/redirect-to-active`, "Test Provider");
      expect(res.status).toBe(FreshnessStatus.ACTIVE);
      expect(res.httpStatus).toBe(200);
      expect(res.finalUrl).toContain("/active-job");
    });

    it("detects BLOCKED when HTTP 403 or 429 is returned", async () => {
      const res = await verifyJobFreshness(`${baseUrl}/bot-blocked-403`, "Test Provider");
      expect(res.status).toBe(FreshnessStatus.BLOCKED);
      expect(res.httpStatus).toBe(403);
      expect(res.requiresManualCheck).toBe(true);
    });

    it("detects BLOCKED when Cloudflare/CAPTCHA challenge is presented in HTML", async () => {
      const res = await verifyJobFreshness(`${baseUrl}/cloudflare-challenge`, "Test Provider");
      expect(res.status).toBe(FreshnessStatus.BLOCKED);
      expect(res.requiresManualCheck).toBe(true);
    });

    it("detects UNKNOWN on 500 server error", async () => {
      const res = await verifyJobFreshness(`${baseUrl}/server-error-500`, "Test Provider");
      expect(res.status).toBe(FreshnessStatus.UNKNOWN);
      expect(res.httpStatus).toBe(500);
    });
  });

  describe("Application Preparation & Approval Freshness Gate", () => {
    it("allows approval when underlying job posting is verified ACTIVE", async () => {
      const activeJobId = "job-freshness-active-01";
      const activeJob: JobRecord = {
        id: activeJobId,
        companyId: "c-fresh-1",
        jobSourceId: "src-fresh",
        title: "Senior Legal Affairs Specialist",
        description: "Managing corporate contracts, legal research, and regulatory filings in Cairo.",
        location: "Cairo, Egypt",
        employmentType: EmploymentType.FULL_TIME,
        sourceUrl: `${baseUrl}/active-job`,
        canonicalUrl: `${baseUrl}/active-job`,
        categories: ["LEGAL", "COMPLIANCE"],
        status: JobStatus.ACTIVE,
        seenAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        company: {
          id: "c-fresh-1",
          name: "Cairo Legal Corp",
          normalizedName: "cairo legal corp",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };
      memoryStore.jobs.set(activeJobId, activeJob);

      const prep = await prepareApplicationForJob(activeJobId);
      const approved = await approvePreparedApplication(prep.id);

      expect(approved.preparationStatus).toBe(PreparationStatus.APPROVED);
      expect(approved.freshnessStatus).toBe(FreshnessStatus.ACTIVE);
      expect(approved.provenance.emailSent).toBe(false);
      expect(approved.provenance.applicationSubmitted).toBe(false);
    });

    it("blocks approval and keeps application in PENDING_APPROVAL when job is CLOSED", async () => {
      const closedJobId = "job-freshness-closed-02";
      const closedJob: JobRecord = {
        id: closedJobId,
        companyId: "c-fresh-2",
        jobSourceId: "src-fresh",
        title: "Senior Legal Affairs Specialist",
        description: "Managing corporate contracts, legal research, and regulatory filings in Cairo.",
        location: "Cairo, Egypt",
        employmentType: EmploymentType.FULL_TIME,
        sourceUrl: `${baseUrl}/closed-job-text`,
        canonicalUrl: `${baseUrl}/closed-job-text`,
        categories: ["LEGAL", "COMPLIANCE"],
        status: JobStatus.ACTIVE,
        seenAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        company: {
          id: "c-fresh-2",
          name: "Closed Corp",
          normalizedName: "closed corp",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };
      memoryStore.jobs.set(closedJobId, closedJob);

      const prep = await prepareApplicationForJob(closedJobId);

      await expect(approvePreparedApplication(prep.id)).rejects.toThrow(
        /Application approval blocked: Underlying job posting is not ACTIVE/,
      );

      const updatedPrep = memoryStore.preparedApplications.get(prep.id);
      expect(updatedPrep?.preparationStatus).toBe(PreparationStatus.PENDING_APPROVAL);
      expect(updatedPrep?.freshnessStatus).toBe(FreshnessStatus.CLOSED);
      expect(updatedPrep?.requiresManualFreshnessCheck).toBe(true);
    });

    it("blocks approval and requires manual verification when job is BLOCKED or 404", async () => {
      const blockedJobId = "job-freshness-blocked-03";
      const blockedJob: JobRecord = {
        id: blockedJobId,
        companyId: "c-fresh-3",
        jobSourceId: "src-fresh",
        title: "Corporate Legal Counsel",
        description: "Legal analysis and contract drafting in Cairo.",
        location: "Cairo, Egypt",
        employmentType: EmploymentType.FULL_TIME,
        sourceUrl: `${baseUrl}/bot-blocked-403`,
        canonicalUrl: `${baseUrl}/bot-blocked-403`,
        categories: ["LEGAL"],
        status: JobStatus.ACTIVE,
        seenAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        company: {
          id: "c-fresh-3",
          name: "Secured Corp",
          normalizedName: "secured corp",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };
      memoryStore.jobs.set(blockedJobId, blockedJob);

      const prep = await prepareApplicationForJob(blockedJobId);

      await expect(approvePreparedApplication(prep.id)).rejects.toThrow(
        /Application approval blocked: Underlying job posting is not ACTIVE \(Status: BLOCKED\)/,
      );

      const updatedPrep = memoryStore.preparedApplications.get(prep.id);
      expect(updatedPrep?.preparationStatus).toBe(PreparationStatus.PENDING_APPROVAL);
      expect(updatedPrep?.freshnessStatus).toBe(FreshnessStatus.BLOCKED);
      expect(updatedPrep?.requiresManualFreshnessCheck).toBe(true);
    });
  });
});
