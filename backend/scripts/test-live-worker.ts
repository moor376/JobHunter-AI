import { JobPollingWorker } from "../src/services/worker/job-polling-worker.js";
import { isDbConnected } from "../src/store/db-store.js";
import { listJobSources } from "../src/services/job-source-service.js";

async function main() {
  console.log("=== LIVE WORKER DISCOVERY TEST ===");
  console.log("Database connected:", await isDbConnected());

  const sources = await listJobSources();
  const activeSources = sources.filter((s) => s.isActive);
  console.log(`Active sources count: ${activeSources.length}`);
  for (const s of activeSources) {
    console.log(`- Active: ${s.name} (${s.id}, ${s.externalSourceId})`);
  }

  const worker = new JobPollingWorker();
  console.log("\nStarting worker.runOnce('MANUAL')...");
  const startTime = Date.now();
  const stats = await worker.runOnce("MANUAL");
  const elapsed = Date.now() - startTime;

  console.log("\n=== REAL WORKER RUN METRICS ===");
  console.log({
    runId: stats.runId,
    status: stats.status,
    applicationMode: stats.applicationMode,
    dryRun: stats.dryRun,
    durationMs: stats.durationMs || elapsed,
    sourcesChecked: stats.sourcesChecked,
    sourcesFailed: stats.sourcesFailed,
    jobsFetched: stats.jobsFetched,
    jobsDiscovered: stats.jobsDiscovered,
    duplicatesSkipped: stats.duplicatesSkipped,
    duplicatesPrevented: stats.duplicatesPrevented,
    newJobsCreated: stats.newJobsCreated,
    matchesEvaluated: stats.matchesEvaluated,
    highPriorityJobs: stats.highPriorityJobs,
    goodMatchJobs: stats.goodMatchJobs,
    rejectedJobs: stats.rejectedJobs,
    applicationsCreated: stats.applicationsCreated,
    applicationsPrepared: stats.applicationsPrepared,
    draftsGenerated: stats.draftsGenerated,
    errorsCount: stats.errors.length,
    errors: stats.errors,
  });

  process.exit(0);
}

main().catch((err) => {
  console.error("Worker execution error:", err);
  process.exit(1);
});
