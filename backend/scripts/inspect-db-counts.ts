import { prisma } from "../src/config/prisma.js";
import { isDbConnected } from "../src/store/db-store.js";
import { jobPollingWorker } from "../src/services/worker/job-polling-worker.js";

async function main() {
  console.log("=== POSTGRESQL DATABASE COUNTS ===");
  console.log("Connected:", await isDbConnected());

  const candidatesCount = await prisma.candidate.count();
  const resumesCount = await prisma.resume.count();
  const jobSourcesCount = await prisma.jobSource.count();
  const activeSourcesCount = await prisma.jobSource.count({ where: { isActive: true } });
  const companiesCount = await prisma.company.count();
  const jobsCount = await prisma.job.count();
  const activeJobsCount = await prisma.job.count({ where: { status: "ACTIVE" } });
  const applicationsCount = await prisma.application.count();
  const auditLogsCount = await prisma.auditLog.count();

  console.log({
    candidatesCount,
    resumesCount,
    jobSourcesCount,
    activeSourcesCount,
    companiesCount,
    jobsCount,
    activeJobsCount,
    applicationsCount,
    auditLogsCount,
  });

  const workerStatus = jobPollingWorker.getStatus();
  console.log("\n=== BACKEND WORKER STATUS ===");
  console.log(JSON.stringify(workerStatus, null, 2));

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
