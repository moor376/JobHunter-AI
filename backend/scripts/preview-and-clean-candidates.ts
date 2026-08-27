import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRESERVED_CANDIDATE_ID = "c1000000-0000-0000-0000-000000000001";
const PRESERVED_EMAIL = "nona09022@gmail.com";

async function previewAndCleanCandidates() {
  console.log("=================================================");
  console.log("🔍 CANDIDATE CLEANUP INSPECTION & EXECUTION");
  console.log("=================================================\n");

  // 1. Fetch all candidates
  const allCandidates = await prisma.candidate.findMany({
    include: {
      applications: {
        include: {
          generatedEmails: true,
          emailEvents: true,
        },
      },
      resumes: true,
      auditLogs: true,
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Total Candidates before cleanup: ${allCandidates.length}`);

  // 2. Identify candidates to preserve vs delete
  const preservedCandidate = allCandidates.find(
    (c) => c.id === PRESERVED_CANDIDATE_ID || c.email.toLowerCase() === PRESERVED_EMAIL.toLowerCase()
  );

  if (!preservedCandidate) {
    throw new Error("CRITICAL SAFETY HALT: Preserved candidate 'نيرة محمد طارق' was not found!");
  }

  const candidatesToDelete = allCandidates.filter(
    (c) => c.id !== PRESERVED_CANDIDATE_ID && c.email.toLowerCase() !== PRESERVED_EMAIL.toLowerCase()
  );

  console.log(`\n--- PRESERVED CANDIDATE (WILL NOT BE TOUCHED) ---`);
  console.log(`- ID:           ${preservedCandidate.id}`);
  console.log(`- Name:         ${preservedCandidate.firstName} ${preservedCandidate.lastName}`);
  console.log(`- Email:        ${preservedCandidate.email}`);
  console.log(`- Phone:        ${preservedCandidate.phone}`);
  console.log(`- Applications: ${preservedCandidate.applications.length}`);
  console.log(`- Resumes:      ${preservedCandidate.resumes.length}`);
  console.log(`- Audit Logs:   ${preservedCandidate.auditLogs.length}`);

  console.log(`\n--- CANDIDATES TO BE SAFELY DELETED (${candidatesToDelete.length} candidates) ---`);
  candidatesToDelete.forEach((c, idx) => {
    console.log(
      `#${idx + 1} | ID: ${c.id} | Name: ${c.firstName} ${c.lastName} | Email: ${c.email} | Apps: ${c.applications.length} | Resumes: ${c.resumes.length}`
    );
  });

  // Safety Assertion: ensure preserved candidate is NOT in deletion list
  const isPreservedInDeleteList = candidatesToDelete.some(
    (c) => c.id === PRESERVED_CANDIDATE_ID || c.email.toLowerCase() === PRESERVED_EMAIL.toLowerCase()
  );

  if (isPreservedInDeleteList) {
    throw new Error("CRITICAL SAFETY ERROR: Preserved candidate detected in deletion list! Aborting.");
  }

  const deleteIds = candidatesToDelete.map((c) => c.id);
  console.log(`\nVerified safe candidate IDs to delete: ${deleteIds.length}`);

  // 3. Execute Transactional Deletion by exact IDs
  console.log("\nExecuting safe cascade deletion for test candidates...");

  await prisma.$transaction(async (tx) => {
    // A. Collect application IDs and email IDs for test candidates only
    const testApps = await tx.application.findMany({
      where: { candidateId: { in: deleteIds } },
      select: { id: true },
    });
    const testAppIds = testApps.map((a) => a.id);

    const testEmails = await tx.generatedEmail.findMany({
      where: { applicationId: { in: testAppIds } },
      select: { id: true },
    });
    const testEmailIds = testEmails.map((e) => e.id);

    // B. Delete EmailEvents for test apps
    if (testAppIds.length > 0) {
      const deletedEvents = await tx.emailEvent.deleteMany({
        where: { applicationId: { in: testAppIds } },
      });
      console.log(`- Deleted EmailEvents for test candidates: ${deletedEvents.count}`);
    }

    // C. Delete GeneratedEmails for test apps
    if (testAppIds.length > 0) {
      const deletedEmails = await tx.generatedEmail.deleteMany({
        where: { applicationId: { in: testAppIds } },
      });
      console.log(`- Deleted GeneratedEmails for test candidates: ${deletedEmails.count}`);
    }

    // D. Delete Applications for test candidates
    if (deleteIds.length > 0) {
      const deletedApps = await tx.application.deleteMany({
        where: { candidateId: { in: deleteIds } },
      });
      console.log(`- Deleted Applications for test candidates: ${deletedApps.count}`);
    }

    // E. Delete Resumes for test candidates
    if (deleteIds.length > 0) {
      const deletedResumes = await tx.resume.deleteMany({
        where: { candidateId: { in: deleteIds } },
      });
      console.log(`- Deleted Resumes for test candidates: ${deletedResumes.count}`);
    }

    // F. Delete AI Analyses for test candidates
    if (deleteIds.length > 0) {
      const deletedAI = await tx.aIAnalysis.deleteMany({
        where: { candidateId: { in: deleteIds } },
      });
      console.log(`- Deleted AIAnalyses for test candidates: ${deletedAI.count}`);
    }

    // G. Delete AuditLogs for test candidates
    if (deleteIds.length > 0) {
      const deletedLogs = await tx.auditLog.deleteMany({
        where: { candidateId: { in: deleteIds } },
      });
      console.log(`- Deleted AuditLogs for test candidates: ${deletedLogs.count}`);
    }

    // H. Delete Candidate records by explicit IDs
    const deletedCandidates = await tx.candidate.deleteMany({
      where: { id: { in: deleteIds } },
    });
    console.log(`- Deleted Candidate records: ${deletedCandidates.count}`);
  });

  // 4. Post-Deletion Verification
  console.log("\n=================================================");
  console.log("🔍 POST-CLEANUP VERIFICATION");
  console.log("=================================================\n");

  const remainingCandidates = await prisma.candidate.findMany({
    include: {
      applications: {
        include: {
          job: { include: { company: true } },
          selectedGeneratedEmail: true,
        },
      },
      resumes: true,
    },
  });

  console.log(`Total Candidates in DB after cleanup: ${remainingCandidates.length}`);
  remainingCandidates.forEach((c, idx) => {
    console.log(
      `#${idx + 1} | Candidate ID: ${c.id} | Name: ${c.firstName} ${c.lastName} | Email: ${c.email} | Phone: ${c.phone} | Active Apps: ${c.applications.length}`
    );
  });

  // Verify Nayera's records
  const nayera = await prisma.candidate.findUnique({
    where: { id: PRESERVED_CANDIDATE_ID },
    include: {
      applications: {
        include: {
          job: { include: { company: true } },
          selectedGeneratedEmail: true,
        },
      },
      resumes: true,
      auditLogs: { orderBy: { createdAt: "desc" }, take: 3 },
    },
  });

  if (!nayera) {
    throw new Error("FATAL: Nayera not found post cleanup!");
  }

  console.log(`\n✓ Nayera Mohamed Tarek Persistence Check: 100% SUCCESS`);
  console.log(`  Candidate ID:       ${nayera.id}`);
  console.log(`  Candidate Name:     ${nayera.firstName} ${nayera.lastName}`);
  console.log(`  Candidate Email:    ${nayera.email}`);
  console.log(`  Candidate Phone:    ${nayera.phone}`);
  console.log(`  Total Applications: ${nayera.applications.length}`);
  console.log(`  Total Resumes:      ${nayera.resumes.length}`);
  console.log(`  Recent Audit Logs:  ${nayera.auditLogs.length}`);

  nayera.applications.forEach((app, i) => {
    console.log(
      `  App #${i + 1}: ID=${app.id} | Job="${app.job?.title}" (${app.job?.company?.name}) | Status=${app.status} | EmailStatus=${app.selectedGeneratedEmail?.reviewStatus}`
    );
  });

  await prisma.$disconnect();
}

previewAndCleanCandidates().catch(async (e) => {
  console.error("FATAL ERROR IN CANDIDATE CLEANUP:", e);
  await prisma.$disconnect();
  process.exit(1);
});
