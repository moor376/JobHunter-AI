import { prisma } from "../src/config/prisma.js";
import { evaluateCandidateEligibility } from "../src/services/eligibility-service.js";

async function main() {
  const latestJobs = await prisma.job.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { company: true, jobSource: true },
  });

  console.log(`=== LATEST ${latestJobs.length} JOBS IN POSTGRESQL ===`);
  for (const j of latestJobs) {
    const evalResult = evaluateCandidateEligibility({
      title: j.title,
      description: j.description,
      location: j.location,
    });
    console.log(JSON.stringify({
      id: j.id,
      title: j.title,
      company: j.company?.name,
      location: j.location,
      source: j.jobSource?.name,
      priorityTier: evalResult.priorityTier,
      eligibilityScore: evalResult.eligibilityScore,
      isEligible: evalResult.isEligibleForApplication,
      createdAt: j.createdAt,
    }, null, 2));
  }
  process.exit(0);
}

main().catch(console.error);
