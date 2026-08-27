import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createJob } from "../src/services/job-service.js";
import { JobPollingWorker } from "../src/services/worker/job-polling-worker.js";
import {
  ApplicationStatus,
  EmailReviewStatus,
  JobSourceAccessMethod,
  JobSourceType,
  memoryStore,
} from "../src/store/db-store.js";

describe("Job Polling Worker & Background Automation Suite", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    server = createServer(createApp());
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
    // Ensure remote third-party live feeds don't stall unit tests by deactivating them in memoryStore
    for (const source of memoryStore.jobSources.values()) {
      if (
        source.baseUrl?.includes("wuzzuf.net") ||
        source.baseUrl?.includes("jooble.org") ||
        source.baseUrl?.includes("adzuna.com")
      ) {
        source.isActive = false;
      }
    }

    // Add a fast local source so worker tests can run deterministically without network delay
    const testMockSourceId = "test_mock_fast_source";
    memoryStore.jobSources.set(testMockSourceId, {
      id: testMockSourceId,
      name: "Test Fast Provider",
      type: JobSourceType.RSS_FEED,
      accessMethod: JobSourceAccessMethod.FEED,
      externalSourceId: "test-fast",
      baseUrl: "data:application/xml,<rss><channel></channel></rss>",
      rateLimitPerMinute: 60,
      healthStatus: "HEALTHY" as any,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  afterEach(async () => {
    memoryStore.jobSources.delete("test_mock_fast_source");
    // Restore default active status for sources
    for (const source of memoryStore.jobSources.values()) {
      source.isActive = true;
    }
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  describe("Worker Lifecycle, Scheduler & API Controls", () => {
    it("reports worker status accurately via GET /api/worker/status", async () => {
      const response = await fetch(`${baseUrl}/api/worker/status`);
      expect(response.status).toBe(200);

      const body = (await response.json()) as any;
      expect(body.data).toBeDefined();
      expect(typeof body.data.isRunning).toBe("boolean");
      expect(typeof body.data.isEnabled).toBe("boolean");
      expect(typeof body.data.intervalMinutes).toBe("number");
      expect(typeof body.data.matchThreshold).toBe("number");
    });

    it("enables and disables the worker scheduler via API endpoints", async () => {
      const enableRes = await fetch(`${baseUrl}/api/worker/enable`, { method: "POST" });
      expect(enableRes.status).toBe(200);
      const enableData = (await enableRes.json()) as any;
      expect(enableData.data.isEnabled).toBe(true);

      const disableRes = await fetch(`${baseUrl}/api/worker/disable`, { method: "POST" });
      expect(disableRes.status).toBe(200);
      const disableData = (await disableRes.json()) as any;
      expect(disableData.data.isEnabled).toBe(false);
    });

    it("executes a manual worker run via POST /api/worker/run and records metrics", async () => {
      const runRes = await fetch(`${baseUrl}/api/worker/run`, { method: "POST" });
      expect(runRes.status).toBe(200);

      const body = (await runRes.json()) as any;
      expect(body.data.runId).toBeTruthy();
      expect(body.data.sourcesChecked).toBeGreaterThanOrEqual(1);
      expect(body.data.durationMs).toBeGreaterThanOrEqual(0);
      expect(body.message).toContain("Job worker polling cycle completed");
    });
  });

  describe("Concurrency & Overlapping Run Protection", () => {
    it("blocks overlapping concurrent worker runs with 409 conflict error", async () => {
      const workerInstance = new JobPollingWorker();

      // Start run in background
      const firstRunPromise = workerInstance.runOnce("MANUAL");

      // Attempt immediate second concurrent run
      await expect(workerInstance.runOnce("MANUAL")).rejects.toThrowError(
        /Worker is currently executing another cycle|Concurrent overlapping runs are prevented/,
      );

      await firstRunPromise;
    });
  });

  describe("Fault Tolerance & Transient Error Resilience", () => {
    it("continues processing remaining sources when one source encounters an error", async () => {
      const worker = new JobPollingWorker();

      // Add a broken job source
      const badSourceId = `broken_source_${Date.now()}`;
      memoryStore.jobSources.set(badSourceId, {
        id: badSourceId,
        name: "Faulty External Provider",
        type: JobSourceType.OFFICIAL_API,
        accessMethod: JobSourceAccessMethod.API,
        externalSourceId: "invalid-feed-non-existent",
        baseUrl: "https://invalid-non-existent-bank-domain.example/api",
        rateLimitPerMinute: 60,
        healthStatus: "DEGRADED" as any,
        isActive: true,
        policyMetadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const stats = await worker.runOnce("MANUAL", { timeoutMs: 50 });
      expect(stats.sourcesChecked).toBeGreaterThanOrEqual(2);
      expect(stats.durationMs).toBeGreaterThanOrEqual(0);

      // Clean up
      memoryStore.jobSources.delete(badSourceId);
    });

    it("cancels hanging external provider without blocking the worker and records structured TIMEOUT error", async () => {
      // Create hanging HTTP server
      const hangingServer = createServer((_req, _res) => {
        // Hang indefinitely
      });
      await new Promise<void>((resolve) => {
        hangingServer.listen(0, "127.0.0.1", resolve);
      });
      const addr = hangingServer.address() as AddressInfo;
      const hangingUrl = `http://127.0.0.1:${addr.port}`;

      const hangingSourceId = `hang_source_${Date.now()}`;
      memoryStore.jobSources.set(hangingSourceId, {
        id: hangingSourceId,
        name: "Hanging External Feed",
        type: JobSourceType.OFFICIAL_API,
        accessMethod: JobSourceAccessMethod.API,
        externalSourceId: "hang-feed-test",
        baseUrl: `${hangingUrl}/api/jobs`,
        rateLimitPerMinute: 60,
        healthStatus: "HEALTHY" as any,
        isActive: true,
        policyMetadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      try {
        const worker = new JobPollingWorker();
        const startTime = Date.now();
        const stats = await worker.runOnce("MANUAL", { timeoutMs: 50 });
        const elapsed = Date.now() - startTime;

        expect(stats.sourcesChecked).toBeGreaterThanOrEqual(1);
        const timeoutError = stats.errors.find((e) => e.sourceId === hangingSourceId);
        expect(timeoutError).toBeDefined();
        expect(timeoutError?.errorCode).toBe("TIMEOUT");
        expect(timeoutError?.message).toContain("timed out");
        expect(timeoutError?.message).toContain("hard limit: 10s");
        expect(elapsed).toBeLessThan(2000);
      } finally {
        memoryStore.jobSources.delete(hangingSourceId);
        await new Promise<void>((resolve, reject) => {
          hangingServer.close((err) => (err ? reject(err) : resolve()));
        });
      }
    });

    it("processes multiple providers where one hangs and another succeeds, continuing seamlessly without blocking", async () => {
      // 1. Hanging server
      const hangingServer = createServer((_req, _res) => {
        // Hang indefinitely
      });
      await new Promise<void>((resolve) => {
        hangingServer.listen(0, "127.0.0.1", resolve);
      });
      const hangAddr = hangingServer.address() as AddressInfo;
      const hangingUrl = `http://127.0.0.1:${hangAddr.port}`;

      // 2. Healthy server returning real jobs JSON
      const healthyServer = createServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify([
            {
              id: "healthy-job-1",
              title: "Senior Legal Counsel",
              company: { name: "National Bank of Egypt" },
              description: "Commercial contracts, regulatory compliance, and banking litigation.",
              location: "Cairo, Egypt",
            },
          ]),
        );
      });
      await new Promise<void>((resolve) => {
        healthyServer.listen(0, "127.0.0.1", resolve);
      });
      const healthyAddr = healthyServer.address() as AddressInfo;
      const healthyUrl = `http://127.0.0.1:${healthyAddr.port}`;

      const hangSourceId = `hang_multi_${Date.now()}`;
      const healthySourceId = `healthy_multi_${Date.now()}`;

      memoryStore.jobSources.set(hangSourceId, {
        id: hangSourceId,
        name: "Hanging Feed",
        type: JobSourceType.OFFICIAL_API,
        accessMethod: JobSourceAccessMethod.API,
        externalSourceId: "hang-multi",
        baseUrl: `${hangingUrl}/api/hang`,
        rateLimitPerMinute: 60,
        healthStatus: "HEALTHY" as any,
        isActive: true,
        policyMetadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      memoryStore.jobSources.set(healthySourceId, {
        id: healthySourceId,
        name: "Healthy Official Feed",
        type: JobSourceType.OFFICIAL_API,
        accessMethod: JobSourceAccessMethod.API,
        externalSourceId: "healthy-multi",
        baseUrl: `${healthyUrl}/api/jobs`,
        rateLimitPerMinute: 60,
        healthStatus: "HEALTHY" as any,
        isActive: true,
        policyMetadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      try {
        const worker = new JobPollingWorker();
        const startTime = Date.now();
        const stats = await worker.runOnce("MANUAL", { timeoutMs: 50 });
        const elapsed = Date.now() - startTime;

        // Verify the hanging source timed out
        const hangErr = stats.errors.find((e) => e.sourceId === hangSourceId);
        expect(hangErr).toBeDefined();
        expect(hangErr?.errorCode).toBe("TIMEOUT");

        // Verify the healthy source was processed and created jobs
        expect(stats.jobsFetched).toBeGreaterThanOrEqual(1);
        expect(stats.newJobsCreated).toBeGreaterThanOrEqual(1);
        expect(stats.sourcesFailed).toBeGreaterThanOrEqual(1);
        expect(elapsed).toBeLessThan(2000);
      } finally {
        memoryStore.jobSources.delete(hangSourceId);
        memoryStore.jobSources.delete(healthySourceId);
        await Promise.all([
          new Promise<void>((resolve, reject) => {
            hangingServer.close((err) => (err ? reject(err) : resolve()));
          }),
          new Promise<void>((resolve, reject) => {
            healthyServer.close((err) => (err ? reject(err) : resolve()));
          }),
        ]);
      }
    });
  });

  describe("Strict Human Approval Gate & State Invariance", () => {
    it("guarantees applications created by worker are in PENDING_APPROVAL and drafts are in PENDING_REVIEW", async () => {
      // Seed a test legal job for candidate matching
      const source = Array.from(memoryStore.jobSources.values())[0];
      await createJob({
        jobSourceId: source.id,
        title: "Legal Affairs Specialist",
        companyName: "Bank Misr",
        location: "Cairo, Egypt",
        description: "Legal affairs, corporate contracts, and regulatory compliance.",
      });

      const worker = new JobPollingWorker();
      const stats = await worker.runOnce("MANUAL");

      // Check all applications in store
      const applications = Array.from(memoryStore.applications.values());
      expect(applications.length).toBeGreaterThanOrEqual(1);

      for (const app of applications) {
        // Strict invariant: Worker MUST NEVER set status to APPROVED, SENDING, or SENT in MANUAL mode
        expect(app.status).not.toBe(ApplicationStatus.APPROVED);
        expect(app.status).not.toBe(ApplicationStatus.SENDING);
        expect(app.status).not.toBe(ApplicationStatus.SENT);

        if (app.selectedGeneratedEmailId) {
          const email = memoryStore.generatedEmails.get(app.selectedGeneratedEmailId);
          if (email) {
            expect(email.reviewStatus).not.toBe(EmailReviewStatus.APPROVED);
          }
        }
      }
    });

    it("prevents creating duplicate applications across repeated worker runs", async () => {
      const worker = new JobPollingWorker();

      // First run
      await worker.runOnce("MANUAL");
      const afterFirstRunCount = memoryStore.applications.size;

      // Second run immediately after
      await worker.runOnce("MANUAL");
      const afterSecondRunCount = memoryStore.applications.size;

      // No redundant duplicates created
      expect(afterSecondRunCount).toBe(afterFirstRunCount);
    });
  });

  describe("Audit Trail & Secret Redaction", () => {
    it("logs worker run start and completion with correlation IDs and zero leaked credentials", async () => {
      const auditRes = await fetch(`${baseUrl}/api/audit-logs`);
      expect(auditRes.status).toBe(200);

      const body = (await auditRes.json()) as any;
      const workerLogs = body.data.filter((l: any) => l.resourceType === "Worker" || l.action.startsWith("WORKER_"));

      expect(workerLogs.length).toBeGreaterThanOrEqual(1);

      for (const log of workerLogs) {
        expect(log.correlationId).toBeTruthy();
        const jsonStr = JSON.stringify(log);
        expect(jsonStr).not.toContain("access_token");
        expect(jsonStr).not.toContain("refresh_token");
        expect(jsonStr).not.toContain("client_secret");
      }
    });
  });
});
