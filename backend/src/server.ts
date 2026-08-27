import { loadEnvironment, validateStartupConfiguration } from "./config/env.js";
import { createApp } from "./app.js";
import { prisma } from "./config/prisma.js";
import { jobPollingWorker } from "./services/worker/job-polling-worker.js";
import { ensureDatabaseRunning, stopDatabase } from "./config/database-manager.js";

const environment = loadEnvironment();
const startupReport = validateStartupConfiguration(environment);
const app = createApp();

console.info(
  JSON.stringify({
    event: "startup_configuration",
    isProductionReady: startupReport.isProductionReady,
    providers: startupReport.providers,
    database: startupReport.database,
    worker: startupReport.worker,
    missingVariables: startupReport.missingRequiredVariables,
  }),
);

// Ensure persistent PostgreSQL is running and connected
const dbOk = await ensureDatabaseRunning();
console.info(
  JSON.stringify({
    event: "database_initialized",
    connected: dbOk,
    target: startupReport.database.type,
  }),
);

const server = app.listen(environment.PORT, environment.HOST, () => {
  console.info(
    JSON.stringify({
      event: "server_started",
      host: environment.HOST,
      port: environment.PORT,
      workerEnabled: startupReport.worker.enabled,
    }),
  );

  // Initialize and run autonomous background worker if enabled
  if (startupReport.worker.enabled) {
    console.info(
      JSON.stringify({
        event: "worker_scheduler_started",
        intervalMinutes: startupReport.worker.intervalMinutes,
      }),
    );
    jobPollingWorker.start();
  }
});

async function shutDown(signal: string): Promise<void> {
  console.info(JSON.stringify({ event: "server_stopping", signal }));

  jobPollingWorker.stop();

  server.close(async () => {
    try {
      await prisma.$disconnect();
    } catch {}
    try {
      await stopDatabase();
    } catch {}
    process.exit(0);
  });
}

process.once("SIGINT", () => void shutDown("SIGINT"));
process.once("SIGTERM", () => void shutDown("SIGTERM"));
