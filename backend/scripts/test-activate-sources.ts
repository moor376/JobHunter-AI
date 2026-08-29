import { prisma } from "../src/config/prisma.js";
import { listJobSources, getJobSourceById, updateJobSource } from "../src/services/job-source-service.js";
import { getAdapterForSource } from "../src/services/adapters/adapter-registry.js";
import { JobPollingWorker } from "../src/services/worker/job-polling-worker.js";

async function main() {
  console.log("=== STEP 1: Inspecting All Sources in DB ===");
  const allSources = await prisma.jobSource.findMany();
  console.log(`Found ${allSources.length} total sources in PostgreSQL.`);

  // Find Jooble and Adzuna in DB
  const joobleSource = allSources.find((s) => s.externalSourceId?.includes("jooble") || s.name.toLowerCase().includes("jooble") || s.baseUrl?.includes("jooble"));
  const adzunaSource = allSources.find((s) => s.externalSourceId?.includes("adzuna") || s.name.toLowerCase().includes("adzuna") || s.baseUrl?.includes("adzuna"));

  console.log("Jooble source in DB:", joobleSource);
  console.log("Adzuna source in DB:", adzunaSource);

  if (joobleSource) {
    await prisma.jobSource.update({
      where: { id: joobleSource.id },
      data: { isActive: true, healthStatus: "HEALTHY" as any },
    });
    console.log(`Activated Jooble source (${joobleSource.id}) in DB.`);
  }

  if (adzunaSource) {
    await prisma.jobSource.update({
      where: { id: adzunaSource.id },
      data: { isActive: true, healthStatus: "HEALTHY" as any },
    });
    console.log(`Activated Adzuna source (${adzunaSource.id}) in DB.`);
  }

  console.log("\n=== STEP 2: Checking listJobSources() ===");
  const activeSources = (await listJobSources()).filter((s) => s.isActive);
  console.log(`Active sources count: ${activeSources.length}`);
  for (const s of activeSources) {
    const adapter = getAdapterForSource(s);
    console.log(`- ${s.name} (ID: ${s.id}, ExtID: ${s.externalSourceId}, Adapter: ${adapter.id}, IsConfigured: ${adapter.isConfigured})`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
