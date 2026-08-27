import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function inspectNayeraApplication() {
  console.log("=================================================");
  console.log("🔍 COMPREHENSIVE APPLICATION VERIFICATION (READ-ONLY)");
  console.log("=================================================\n");

  const candidateId = "c1000000-0000-0000-0000-000000000001";

  // 1. Fetch Candidate
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    include: {
      applications: {
        include: {
          job: { include: { company: true } },
          selectedGeneratedEmail: true,
          emailEvents: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!candidate) {
    console.error("Candidate not found!");
    return;
  }

  console.log("1. CANDIDATE DETAILS:");
  console.log(`- Candidate ID:    ${candidate.id}`);
  console.log(`- Candidate Name:  ${candidate.firstName} ${candidate.lastName}`);
  console.log(`- Candidate Email: ${candidate.email}`);
  console.log(`- Candidate Phone: ${candidate.phone}`);
  console.log(`- Total Applications for Candidate: ${candidate.applications.length}\n`);

  // Target primary open application: da000000-0000-0000-0000-000000000001
  const primaryApp = candidate.applications.find((a) => a.id === "da000000-0000-0000-0000-000000000001") || candidate.applications[0];

  console.log("2. PRIMARY APPLICATION DETAILS:");
  console.log(`- Application ID:               ${primaryApp.id}`);
  console.log(`- Target Job:                   "${primaryApp.job?.title}" at ${primaryApp.job?.company?.name}`);
  console.log(`- Application Status:           ${primaryApp.status}`);
  console.log(`- Channel:                      ${primaryApp.channel}`);
  console.log(`- Duplicate Key:                ${primaryApp.duplicateKey}`);
  console.log(`- Created At:                   ${primaryApp.createdAt.toISOString()}`);
  console.log(`- Approved At:                  ${primaryApp.approvedAt ? primaryApp.approvedAt.toISOString() : "null (NOT APPROVED)"}`);
  console.log(`- Sent At:                      ${primaryApp.sentAt ? primaryApp.sentAt.toISOString() : "null (NOT SENT)"}\n`);

  console.log("3. LINKED GENERATED EMAIL DRAFT:");
  const email = primaryApp.selectedGeneratedEmail;
  if (email) {
    console.log(`- GeneratedEmail ID:            ${email.id}`);
    console.log(`- Recipient (Employer/HR):      ${email.recipientEmail}`);
    console.log(`- Subject:                      ${email.subject}`);
    console.log(`- GeneratedEmail reviewStatus:  ${email.reviewStatus}`);
    console.log(`- Reviewed At:                  ${email.reviewedAt ? email.reviewedAt.toISOString() : "null (PENDING REVIEW)"}`);
    console.log(`- Approved At:                  ${email.approvedAt ? email.approvedAt.toISOString() : "null (NOT APPROVED)"}`);
    console.log(`- Content Hash:                 ${email.contentHash}`);
  } else {
    console.log("- No GeneratedEmail linked!");
  }

  console.log("\n4. EMAIL EVENTS AUDIT (Check for SENDING / SENT):");
  const allEventsForCandidate = await prisma.emailEvent.findMany({
    where: {
      applicationId: {
        in: candidate.applications.map((a) => a.id),
      },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`- Total EmailEvents for this candidate: ${allEventsForCandidate.length}`);
  const sendingEvents = allEventsForCandidate.filter((e) => (e.type as string) === "SENDING" || e.type === "SEND_ATTEMPTED");
  const sentEvents = allEventsForCandidate.filter((e) => e.type === "SENT");
  const deliveredEvents = allEventsForCandidate.filter((e) => e.type === "DELIVERED");

  console.log(`- SENDING / SEND_ATTEMPTED Events count: ${sendingEvents.length}`);
  console.log(`- SENT Events count:                      ${sentEvents.length}`);
  console.log(`- DELIVERED Events count:                 ${deliveredEvents.length}`);
  allEventsForCandidate.forEach((ev, i) => {
    console.log(`  Event #${i + 1}: Type=${ev.type} | AppID=${ev.applicationId} | Time=${ev.createdAt.toISOString()} | Error=${ev.errorCode || "None"}`);
  });

  console.log("\n5. AUDIT LOGS FOR THIS APPLICATION:");
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { resourceId: primaryApp.id },
        { resourceId: candidateId },
        { candidateId: candidateId },
        { resourceId: email?.id },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  console.log(`- Recent AuditLogs count: ${auditLogs.length}`);
  auditLogs.forEach((log, i) => {
    console.log(`  #${i + 1} | Action: ${log.action} | EventType: ${log.eventType} | Resource: ${log.resourceType} (${log.resourceId}) | Actor: ${log.actorType} | Timestamp: ${log.createdAt.toISOString()}`);
  });

  console.log("\n6. GLOBAL GMAIL SEND VERIFICATION:");
  const globalSentApplications = await prisma.application.count({
    where: {
      status: "SENT",
    },
  });
  const globalSendingApplications = await prisma.application.count({
    where: {
      status: "SENDING",
    },
  });
  const liveSentEvents = await prisma.emailEvent.count({
    where: {
      type: "SENT",
    },
  });

  console.log(`- Applications in SENT state across entire DB:    ${globalSentApplications}`);
  console.log(`- Applications in SENDING state across entire DB: ${globalSendingApplications}`);
  console.log(`- Total SENT EmailEvents across entire DB:        ${liveSentEvents}`);

  await prisma.$disconnect();
}

inspectNayeraApplication().catch(console.error);
