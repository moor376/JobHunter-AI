import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function cleanTestJobsAndApps() {
  console.log("=================================================");
  console.log("🔍 CLEANING TEST JOBS AND TEST APPLICATIONS");
  console.log("=================================================\n");

  // 1. Find all jobs
  const jobs = await prisma.job.findMany({
    include: { company: true },
    orderBy: { createdAt: "asc" },
  });

  console.log("Current Jobs in DB:");
  const testJobIds: string[] = [];

  jobs.forEach((j, i) => {
    const isTest =
      j.title.toLowerCase().includes("test") ||
      j.company.name.toLowerCase().includes("test") ||
      j.title.toLowerCase().includes("verification") ||
      j.title.toLowerCase().includes("batch");

    console.log(`#${i + 1}: ID=${j.id} | "${j.title}" (${j.company.name}) | ${isTest ? "❌ TEST JOB" : "✅ REAL BANK JOB"}`);
    if (isTest) {
      testJobIds.push(j.id);
    }
  });

  console.log(`\nTest Job IDs identified: ${testJobIds.length}`);

  if (testJobIds.length > 0) {
    await prisma.$transaction(async (tx) => {
      // Find all applications for test jobs
      const testApps = await tx.application.findMany({
        where: { jobId: { in: testJobIds } },
        select: { id: true },
      });
      const testAppIds = testApps.map((a) => a.id);

      if (testAppIds.length > 0) {
        // Delete EmailEvents
        await tx.emailEvent.deleteMany({ where: { applicationId: { in: testAppIds } } });
        // Delete GeneratedEmails
        await tx.generatedEmail.deleteMany({ where: { applicationId: { in: testAppIds } } });
        // Delete AuditLogs
        await tx.auditLog.deleteMany({ where: { resourceId: { in: testAppIds } } });
        // Delete Applications
        await tx.application.deleteMany({ where: { id: { in: testAppIds } } });
        console.log(`- Deleted ${testAppIds.length} applications linked to test jobs.`);
      }

      // Delete AIAnalyses for test jobs
      await tx.aIAnalysis.deleteMany({ where: { jobId: { in: testJobIds } } });

      // Delete the test jobs
      await tx.job.deleteMany({ where: { id: { in: testJobIds } } });
      console.log(`- Deleted ${testJobIds.length} test jobs from database.`);
    });
  }

  // Final count of applications for Nayera
  const nayera = await prisma.candidate.findUnique({
    where: { id: "c1000000-0000-0000-0000-000000000001" },
    include: {
      applications: {
        include: {
          job: { include: { company: true } },
          selectedGeneratedEmail: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  console.log("\n=================================================");
  console.log("🔍 FINAL VERIFIED NAYERA APPLICATIONS");
  console.log("=================================================");
  console.log(`Total Applications for Nayera: ${nayera?.applications.length}`);

  nayera?.applications.forEach((app, i) => {
    console.log(
      `#${i + 1} | AppID: ${app.id} | Job: "${app.job?.title}" (${app.job?.company?.name}) | Status: ${app.status} | EmailStatus: ${app.selectedGeneratedEmail?.reviewStatus}`
    );
  });

  await prisma.$disconnect();
}

cleanTestJobsAndApps().catch(console.error);
