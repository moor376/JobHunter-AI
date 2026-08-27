import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CANDIDATE_ID = "c1000000-0000-0000-0000-000000000001";
const TARGET_DELETE_APP_IDS = [
  "0c08f3d2-a251-4acf-8d5c-ba5449708498", // Emirates NBD Egypt Test / Batch 1787528120668
  "ed528979-7d6c-4e91-b7ed-98c22e1f3316", // Emirates NBD Egypt Test / Verification Run
];

async function deleteTestApplications() {
  console.log("=================================================");
  console.log("🗑️ SAFE TARGETED DELETION OF TEST APPLICATIONS");
  console.log("=================================================\n");

  // 1. Initial State
  const initialApps = await prisma.application.findMany({
    where: { candidateId: CANDIDATE_ID },
    include: {
      job: { include: { company: true } },
      selectedGeneratedEmail: true,
      emailEvents: true,
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Total Applications before deletion: ${initialApps.length}`);

  // Safety Assertion: ensure none of the protected applications are in the delete list
  const protectedAppId = "da000000-0000-0000-0000-000000000001";
  const mashreqAppId = "da447a22-0a7b-4873-8c54-6825f35b8e65";

  if (TARGET_DELETE_APP_IDS.includes(protectedAppId) || TARGET_DELETE_APP_IDS.includes(mashreqAppId)) {
    throw new Error("CRITICAL SAFETY VIOLATION: Protected application detected in delete list!");
  }

  // 2. Perform Transactional Cascade Deletion for TARGET_DELETE_APP_IDS only
  console.log(`\nDeleting test applications: ${JSON.stringify(TARGET_DELETE_APP_IDS)}...`);

  await prisma.$transaction(async (tx) => {
    // A. Delete EmailEvents for target apps
    const deletedEvents = await tx.emailEvent.deleteMany({
      where: { applicationId: { in: TARGET_DELETE_APP_IDS } },
    });
    console.log(`- Deleted EmailEvents: ${deletedEvents.count}`);

    // B. Delete GeneratedEmails for target apps
    const deletedEmails = await tx.generatedEmail.deleteMany({
      where: { applicationId: { in: TARGET_DELETE_APP_IDS } },
    });
    console.log(`- Deleted GeneratedEmails: ${deletedEmails.count}`);

    // C. Delete AuditLogs specifically for these applications
    const deletedLogs = await tx.auditLog.deleteMany({
      where: { resourceId: { in: TARGET_DELETE_APP_IDS } },
    });
    console.log(`- Deleted Application AuditLogs: ${deletedLogs.count}`);

    // D. Delete the target applications themselves
    const deletedApps = await tx.application.deleteMany({
      where: {
        id: { in: TARGET_DELETE_APP_IDS },
        candidateId: CANDIDATE_ID, // extra safety filter
      },
    });
    console.log(`- Deleted Applications: ${deletedApps.count}`);
  });

  // 3. Post-Deletion Verification
  console.log("\n=================================================");
  console.log("🔍 POST-DELETION VERIFICATION FROM POSTGRESQL");
  console.log("=================================================\n");

  const remainingApps = await prisma.application.findMany({
    where: { candidateId: CANDIDATE_ID },
    include: {
      job: { include: { company: true } },
      selectedGeneratedEmail: true,
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Total Applications after deletion: ${remainingApps.length}`);

  remainingApps.forEach((app, idx) => {
    console.log(
      `#${idx + 1} | ID: ${app.id} | Job: "${app.job?.title}" (${app.job?.company?.name}) | Status: ${app.status} | EmailStatus: ${app.selectedGeneratedEmail?.reviewStatus}`
    );
  });

  // Verify Candidate intact
  const candidate = await prisma.candidate.findUnique({
    where: { id: CANDIDATE_ID },
    include: { resumes: true },
  });

  console.log("\n--- CANDIDATE PERSISTENCE ---");
  console.log(`Candidate ID:    ${candidate?.id}`);
  console.log(`Candidate Name:  ${candidate?.firstName} ${candidate?.lastName}`);
  console.log(`Candidate Email: ${candidate?.email}`);
  console.log(`Candidate Phone: ${candidate?.phone}`);
  console.log(`CVs preserved:   ${candidate?.resumes.length}`);

  await prisma.$disconnect();
}

deleteTestApplications().catch(async (e) => {
  console.error("FATAL ERROR IN DELETION:", e);
  await prisma.$disconnect();
  process.exit(1);
});
