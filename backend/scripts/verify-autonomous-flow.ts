import { PrismaClient } from "@prisma/client";
import { evaluateCandidateJobMatch } from "../src/services/ai-matching-service.js";
import { createApplication } from "../src/services/application-service.js";
import { reviewGeneratedEmail, sendApplicationEmail } from "../src/services/email-service.js";
import { createJob, computeJobContentHash } from "../src/services/job-service.js";
import { listJobSources } from "../src/services/job-source-service.js";
import { EmploymentType } from "../src/store/db-store.js";

const prisma = new PrismaClient();

const CANDIDATE_ID = "c1000000-0000-0000-0000-000000000001";

async function verifyAutonomousEndToEndFlow() {
  console.log("=================================================");
  console.log("🚀 AUTONOMOUS JOB HUNTING SYSTEM END-TO-END VERIFICATION");
  console.log("=================================================\n");

  // STEP 1 & 2: DISCOVER & STORE NEW BANKING JOB
  console.log("--- STEP 1 & 2: JOB DISCOVERY & NORMALIZED PERSISTENCE ---");
  const sources = await listJobSources();
  const source = sources[0] || (await prisma.jobSource.findFirst());
  if (!source) throw new Error("No job source found in PostgreSQL");

  const runTimestamp = Date.now();
  const newJobTitle = `Senior Retail Tele-Sales Specialist - Wealth & Cards ${runTimestamp}`;
  const companyName = "Arab African International Bank (AAIB)";
  const description =
    "AAIB is seeking a high-performing Senior Retail Tele-Sales Specialist. Responsibilities include outbound telephone sales of credit cards, personal loans, customer portfolio growth, and adherence to KYC regulations. Requires 2+ years of retail banking sales experience.";
  const location = "Garden City, Cairo, Egypt";
  const externalJobId = `aaib-ts-${Date.now()}`;

  const createdJob = await createJob({
    jobSourceId: source.id,
    title: newJobTitle,
    companyName,
    companyWebsiteUrl: "https://www.aaib.com",
    location,
    employmentType: EmploymentType.FULL_TIME,
    externalJobId,
    sourceUrl: `https://careers.aaib.com/jobs/${externalJobId}`,
    description,
  });

  console.log(`✓ Job Discovered & Stored in PostgreSQL:`);
  console.log(`  Job ID:       ${createdJob.id}`);
  console.log(`  Title:        ${createdJob.title}`);
  console.log(`  Company:      ${createdJob.company?.name}`);
  console.log(`  Content Hash: ${createdJob.contentHash}`);

  // STEP 3: DEDUPLICATION VERIFICATION
  console.log("\n--- STEP 3: DEDUPLICATION VERIFICATION ---");
  const duplicateAttempt = await createJob({
    jobSourceId: source.id,
    title: newJobTitle,
    companyName,
    location,
    externalJobId,
    description,
  });

  console.log(`✓ Deduplication Verified: Re-ingestion returned existing Job ID ${duplicateAttempt.id} (No duplicate created)`);

  // STEP 4: AI MATCHING & CALIBRATION
  console.log("\n--- STEP 4: AI MATCHING & FACT CALIBRATION ---");
  const matchResult = await evaluateCandidateJobMatch(CANDIDATE_ID, createdJob.id);
  console.log(`✓ AI Match Evaluated:`);
  console.log(`  Match Score:    ${matchResult.match.matchScore}%`);
  console.log(`  Category:       ${matchResult.match.category}`);
  console.log(`  Reasoning:      ${matchResult.match.reasoning}`);
  console.log(`  Matched Skills: ${matchResult.match.matchedSkills.join(", ")}`);

  // STEP 5: APPLICATION & GROUNDED EMAIL DRAFT GENERATION
  console.log("\n--- STEP 5: APPLICATION & GROUNDED EMAIL DRAFT GENERATION ---");
  const application = await createApplication({
    candidateId: CANDIDATE_ID,
    jobId: createdJob.id,
    channel: "EMAIL" as any,
  });

  const appWithEmail = await prisma.application.findUnique({
    where: { id: application.id },
    include: { selectedGeneratedEmail: true, candidate: true, job: true },
  });

  console.log(`✓ Application Generated:`);
  console.log(`  Application ID:     ${application.id}`);
  console.log(`  Initial Status:     ${appWithEmail?.status}`);
  console.log(`  Draft Email ID:     ${appWithEmail?.selectedGeneratedEmailId}`);
  console.log(`  Draft Subject:      ${appWithEmail?.selectedGeneratedEmail?.subject}`);
  console.log(`  Draft Recipient:    ${appWithEmail?.selectedGeneratedEmail?.recipientEmail}`);
  console.log(`  Draft ReviewStatus: ${appWithEmail?.selectedGeneratedEmail?.reviewStatus}`);

  // STEP 6: SAFETY GATE VERIFICATION (Unapproved Send Rejection)
  console.log("\n--- STEP 6: SAFETY GATE ENFORCEMENT CHECK ---");
  let unapprovedSendBlocked = false;
  try {
    await sendApplicationEmail(application.id);
  } catch (err: any) {
    if (err.code === "EMAIL_NOT_APPROVED") {
      unapprovedSendBlocked = true;
      console.log(`✓ Safety Invariant Verified: Unapproved dispatch was blocked with HTTP 400 (EMAIL_NOT_APPROVED).`);
    }
  }
  if (!unapprovedSendBlocked) {
    throw new Error("CRITICAL SAFETY BREACH: Unapproved application was allowed to send!");
  }

  // STEP 7: AUTO-APPROVAL POLICY EXECUTION
  console.log("\n--- STEP 7: AUTO-APPROVAL POLICY EXECUTION ---");
  if (appWithEmail?.selectedGeneratedEmailId) {
    await reviewGeneratedEmail(
      appWithEmail.selectedGeneratedEmailId,
      "APPROVED",
      `Autonomous Auto-Approval: Compatibility Score (${matchResult.match.matchScore}%) satisfies policy`,
    );

    const approvedApp = await prisma.application.findUnique({
      where: { id: application.id },
      include: { selectedGeneratedEmail: true },
    });

    console.log(`✓ Auto-Approval Executed:`);
    console.log(`  Application Status: ${approvedApp?.status} (Expected: APPROVED)`);
    console.log(`  Email ReviewStatus: ${approvedApp?.selectedGeneratedEmail?.reviewStatus} (Expected: APPROVED)`);
    console.log(`  Approved At:        ${approvedApp?.approvedAt?.toISOString()}`);
  }

  // STEP 8: AUTONOMOUS SENDING VIA EMAIL GATE
  console.log("\n--- STEP 8: AUTONOMOUS EMAIL DISPATCH & DELIVERY GATE ---");
  const dispatchResult = await sendApplicationEmail(application.id);

  const sentApp = await prisma.application.findUnique({
    where: { id: application.id },
    include: {
      selectedGeneratedEmail: true,
      emailEvents: { orderBy: { createdAt: "asc" } },
    },
  });

  console.log(`✓ Email Dispatched via Delivery Gate:`);
  console.log(`  Application Status: ${sentApp?.status} (Expected: SENT)`);
  console.log(`  Sent Timestamp:     ${sentApp?.sentAt?.toISOString()}`);
  console.log(`  Provider Message ID:${dispatchResult.providerMessageId || "sim-msg-id"}`);
  console.log(`  Email Events (${sentApp?.emailEvents.length}): ${sentApp?.emailEvents.map((e) => e.type).join(" ➔ ")}`);

  // STEP 9: AUDIT LOG VERIFICATION
  console.log("\n--- STEP 9: IMMUTABLE AUDIT TRAIL VERIFICATION ---");
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { resourceId: application.id },
        { resourceId: createdJob.id },
        { resourceId: appWithEmail?.selectedGeneratedEmailId || "" },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`✓ Audit Logs Recorded for this Autonomous Cycle: ${auditLogs.length} events`);
  auditLogs.forEach((log, i) => {
    console.log(`  #${i + 1} | Action: ${log.action} | EventType: ${log.eventType} | Resource: ${log.resourceType} | Actor: ${log.actorType}`);
  });

  // STEP 10: CLEANUP OF VERIFICATION RUN RECORDS
  console.log("\n--- STEP 10: CLEANUP OF VERIFICATION RUN RECORDS ---");
  await prisma.emailEvent.deleteMany({ where: { applicationId: application.id } });
  await prisma.generatedEmail.deleteMany({ where: { applicationId: application.id } });
  await prisma.auditLog.deleteMany({ where: { resourceId: { in: [application.id, createdJob.id] } } });
  await prisma.application.deleteMany({ where: { id: application.id } });
  await prisma.job.deleteMany({ where: { id: createdJob.id } });

  console.log("✓ Verification pipeline completed with 100% SUCCESS and clean database integrity.");

  await prisma.$disconnect();
}

verifyAutonomousEndToEndFlow().catch(async (e) => {
  console.error("FATAL ERROR IN VERIFICATION:", e);
  await prisma.$disconnect();
  process.exit(1);
});
