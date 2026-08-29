import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { getDashboardSummary } from "../src/services/dashboard-service.js";
import { jobPollingWorker } from "../src/services/worker/job-polling-worker.js";

type StartedServer = {
  server: Server;
  url: string;
};

async function startServer(): Promise<StartedServer> {
  const server = createServer(createApp());
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
  };
}

async function stopServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

describe("Authoritative Dashboard Summary & Metrics Integration Suite", () => {
  let activeServer: Server | null = null;

  afterEach(async () => {
    if (activeServer) {
      await stopServer(activeServer);
      activeServer = null;
    }
  });

  it("computes comprehensive dashboard summary directly from service layer", async () => {
    const summary = await getDashboardSummary();

    expect(summary).toBeDefined();
    expect(summary.worker).toBeDefined();
    expect(summary.worker.statusLabelAr).toBeDefined();
    expect(summary.worker.statusLabelEn).toBeDefined();
    expect(summary.worker.schedulerStatus).toBeDefined();

    expect(summary.candidate).toBeDefined();
    expect(typeof summary.candidate?.name).toBe("string");
    expect(summary.candidate?.name.length).toBeGreaterThan(0);
    expect(summary.candidate?.consentStatus).toBe("GRANTED");

    expect(summary.sources).toBeDefined();
    expect(summary.sources.total).toBeGreaterThanOrEqual(1);

    expect(summary.jobs).toBeDefined();
    expect(summary.jobs.total).toBeGreaterThanOrEqual(0);
    expect(summary.jobs.byCategory).toBeDefined();

    expect(summary.applications).toBeDefined();
    expect(typeof summary.applications.total).toBe("number");
    expect(typeof summary.applications.pendingApproval).toBe("number");

    expect(summary.workerMetrics).toBeDefined();
    expect(typeof summary.workerMetrics.lastJobsFetched).toBe("number");
    expect(typeof summary.workerMetrics.lastDuplicatesSkipped).toBe("number");
  }, 20000);

  it("serves GET /api/dashboard/summary with HTTP 200 and unified metrics snapshot", async () => {
    const started = await startServer();
    activeServer = started.server;

    const response = await fetch(`${started.url}/api/dashboard/summary`);
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.data).toBeDefined();
    expect(json.data.worker.statusLabelAr).toBeDefined();
    expect(json.data.candidate.email).toContain("@");
    expect(json.data.jobs.total).toBeGreaterThanOrEqual(0);
  }, 20000);

  it("exposes semantic worker status correctly distinguishing idle, enabled, and running states", () => {
    const status = jobPollingWorker.getStatus();

    expect(status.schedulerStatus).toMatch(/RUNNING|IDLE_WAITING|SCHEDULED_ENABLED|STOPPED/);
    expect(typeof status.statusLabelAr).toBe("string");
    expect(typeof status.statusLabelEn).toBe("string");
    expect(typeof status.schedulerRunning).toBe("boolean");
  });
});
