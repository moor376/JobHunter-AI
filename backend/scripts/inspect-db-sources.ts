import { listJobSources } from "../src/services/job-source-service.js";
import { prisma } from "../src/config/prisma.js";
import { isDbConnected } from "../src/store/db-store.js";

async function main() {
  const dbStatus = await isDbConnected();
  console.log("isDbConnected:", dbStatus);

  const sources = await listJobSources();
  console.log("Total sources returned by listJobSources:", sources.length);
  for (const s of sources) {
    console.log(JSON.stringify({
      id: s.id,
      name: s.name,
      type: s.type,
      externalSourceId: s.externalSourceId,
      isActive: s.isActive,
      healthStatus: s.healthStatus,
      baseUrl: s.baseUrl,
    }));
  }

  const dbSources = await prisma.jobSource.findMany();
  console.log("Total JobSources in Prisma PostgreSQL:", dbSources.length);
  for (const s of dbSources) {
    console.log(JSON.stringify({
      id: s.id,
      name: s.name,
      type: s.type,
      externalSourceId: s.externalSourceId,
      isActive: s.isActive,
      healthStatus: s.healthStatus,
    }));
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Error inspecting sources:", err);
  process.exit(1);
});
