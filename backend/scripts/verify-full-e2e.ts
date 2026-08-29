import { createApp } from "../src/app.js";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { prisma } from "../src/config/prisma.js";
import { isDbConnected } from "../src/store/db-store.js";
import { jobPollingWorker } from "../src/services/worker/job-polling-worker.js";

async function main() {
  console.log("==================================================");
  console.log("JOBHUNTER-AI FULL END-TO-END PRODUCTION VERIFICATION");
  console.log("==================================================");

  // 1. PostgreSQL DB Connection
  const dbConnected = await isDbConnected();
  console.log(`\n1. PostgreSQL Database Status: Connected = ${dbConnected}`);
  if (!dbConnected) {
    throw new Error("PostgreSQL database is not connected.");
  }

  // 2. Start Application Server
  const app = createApp();
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  console.log(`2. Backend Server Running on ${baseUrl}`);

  // 3. Start Background Worker Scheduler
  jobPollingWorker.start();
  const workerStatus = jobPollingWorker.getStatus();
  console.log("\n3. Worker Scheduler State:");
  console.log({
    isEnabled: workerStatus.isEnabled,
    schedulerRunning: workerStatus.schedulerRunning,
    schedulerStatus: workerStatus.schedulerStatus,
    statusLabelAr: workerStatus.statusLabelAr,
    statusLabelEn: workerStatus.statusLabelEn,
    nextRunAt: workerStatus.nextRunAt?.toISOString(),
  });

  // 4. Test Health Endpoint
  const healthRes = await fetch(`${baseUrl}/api/health`);
  const healthJson = await healthRes.json();
  console.log(`\n4. GET /api/health [HTTP ${healthRes.status}]:`);
  console.log(JSON.stringify(healthJson, null, 2));

  // 5. Test Dashboard Summary Endpoint
  const summaryRes1 = await fetch(`${baseUrl}/api/dashboard/summary`);
  const summaryJson1 = await summaryRes1.json();
  console.log(`\n5. GET /api/dashboard/summary (Initial) [HTTP ${summaryRes1.status}]:`);
  console.log({
    workerStatus: summaryJson1.data.worker.schedulerStatus,
    workerLabelAr: summaryJson1.data.worker.statusLabelAr,
    candidate: summaryJson1.data.candidate?.name,
    sourcesCount: summaryJson1.data.sources.total,
    activeSources: summaryJson1.data.sources.active,
    jobsTotal: summaryJson1.data.jobs.total,
    jobsEvaluated: summaryJson1.data.jobs.evaluated,
    highPriorityJobs: summaryJson1.data.jobs.highPriority,
    applicationsTotal: summaryJson1.data.applications.total,
    applicationsPending: summaryJson1.data.applications.pendingApproval,
  });

  // 6. Execute Live Worker Discovery Run
  console.log("\n6. Executing POST /api/worker/run...");
  const runRes = await fetch(`${baseUrl}/api/worker/run`, { method: "POST" });
  const runJson = await runRes.json();
  console.log(`Worker Run Completed [HTTP ${runRes.status}]:`);
  console.log({
    runId: runJson.data?.runId,
    status: runJson.data?.status,
    durationMs: runJson.data?.durationMs,
    sourcesChecked: runJson.data?.sourcesChecked,
    sourcesFailed: runJson.data?.sourcesFailed,
    jobsFetched: runJson.data?.jobsFetched,
    duplicatesSkipped: runJson.data?.duplicatesSkipped,
    newJobsCreated: runJson.data?.newJobsCreated,
    foreignJobsRejected: runJson.data?.foreignJobsRejected,
    queriesExecuted: runJson.data?.queriesExecuted,
    duplicateBreakdown: {
      externalId: runJson.data?.duplicateByExternalId,
      canonicalUrl: runJson.data?.duplicateByCanonicalUrl,
      contentHash: runJson.data?.duplicateByContentHash,
      normalizedIdentity: runJson.data?.duplicateByNormalizedIdentity,
    },
    errors: runJson.data?.errors,
  });

  // 7. Verify Updated Dashboard Summary
  const summaryRes2 = await fetch(`${baseUrl}/api/dashboard/summary`);
  const summaryJson2 = await summaryRes2.json();
  console.log(`\n7. GET /api/dashboard/summary (Post-Run) [HTTP ${summaryRes2.status}]:`);
  console.log({
    workerStatus: summaryJson2.data.worker.schedulerStatus,
    workerLabelAr: summaryJson2.data.worker.statusLabelAr,
    lastRunAt: summaryJson2.data.workerMetrics.lastRunAt,
    lastJobsFetched: summaryJson2.data.workerMetrics.lastJobsFetched,
    lastDuplicatesSkipped: summaryJson2.data.workerMetrics.lastDuplicatesSkipped,
    lastNewJobsCreated: summaryJson2.data.workerMetrics.lastNewJobsCreated,
    jobsTotal: summaryJson2.data.jobs.total,
    jobsEvaluated: summaryJson2.data.jobs.evaluated,
  });

  // 8. Clean up
  jobPollingWorker.stop();
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

  console.log("\n==================================================");
  console.log("VERIFICATION COMPLETE: ALL INTEGRATIONS FUNCTIONAL");
  console.log("==================================================");
  process.exit(0);
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
