import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function inspectLastApprovedApplication() {
  console.log("=================================================");
  console.log("🔍 INSPECTING LAST APPROVED APPLICATION IN POSTGRESQL (READ-ONLY)");
  console.log("=================================================\n");

  // 1. Fetch applications that have approvedAt not null OR status = APPROVED
  const approvedApps = await prisma.application.findMany({
    where: {
      OR: [
        { status: "APPROVED" },
        { approvedAt: { not: null } },
      ],
    },
    include: {
      candidate: true,
      job: { include: { company: true } },
      selectedGeneratedEmail: true,
      emailEvents: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { approvedAt: "desc" },
  });

  console.log(`Total Applications with Approval record: ${approvedApps.length}\n`);

  if (approvedApps.length === 0) {
    console.log("No applications found with status APPROVED or approvedAt set.");
    return;
  }

  // Target the latest approved application
  const lastApproved = approvedApps[0];

  console.log("1. CANDIDATE INFO:");
  console.log(`- Candidate Name:  ${lastApproved.candidate?.firstName} ${lastApproved.candidate?.lastName}`);
  console.log(`- Candidate Email: ${lastApproved.candidate?.email}`);
  console.log(`- Candidate Phone: ${lastApproved.candidate?.phone}\n`);

  console.log("2. APPLICATION DETAILS:");
  console.log(`- Application ID:     ${lastApproved.id}`);
  console.log(`- Target Job:         "${lastApproved.job?.title}" at ${lastApproved.job?.company?.name}`);
  console.log(`- Application Status: ${lastApproved.status}`);
  console.log(`- Channel:            ${lastApproved.channel}`);
  console.log(`- Duplicate Key:      ${lastApproved.duplicateKey}`);
  console.log(`- Created At:         ${lastApproved.createdAt.toISOString()}`);
  console.log(`- Approved At:        ${lastApproved.approvedAt ? lastApproved.approvedAt.toISOString() : "null"}`);
  console.log(`- Sent At:            ${lastApproved.sentAt ? lastApproved.sentAt.toISOString() : "null (NOT SENT)"}\n`);

  console.log("3. LINKED GENERATED EMAIL DRAFT:");
  const email = lastApproved.selectedGeneratedEmail;
  if (email) {
    console.log(`- GeneratedEmail ID:            ${email.id}`);
    console.log(`- Recipient:                    ${email.recipientEmail}`);
    console.log(`- Subject:                      ${email.subject}`);
    console.log(`- GeneratedEmail reviewStatus:  ${email.reviewStatus}`);
    console.log(`- Approved At (Email):          ${email.approvedAt ? email.approvedAt.toISOString() : "null"}`);
    console.log(`- Reviewed At (Email):          ${email.reviewedAt ? email.reviewedAt.toISOString() : "null"}`);
    console.log(`- Content Hash:                 ${email.contentHash}`);
  } else {
    console.log("- No GeneratedEmail record attached!");
  }

  console.log("\n4. EMAIL EVENTS FOR THIS APPLICATION:");
  console.log(`- Total EmailEvents for this application: ${lastApproved.emailEvents.length}`);
  const hasSending = lastApproved.emailEvents.some((e) => (e.type as string) === "SENDING" || e.type === "SEND_ATTEMPTED");
  const hasSent = lastApproved.emailEvents.some((e) => e.type === "SENT");

  console.log(`- Is there any SENDING / SEND_ATTEMPTED event? ${hasSending ? "YES" : "NO"}`);
  console.log(`- Is there any SENT event?                      ${hasSent ? "YES" : "NO"}`);
  lastApproved.emailEvents.forEach((ev, idx) => {
    console.log(`  Event #${idx + 1}: Type=${ev.type} | Time=${ev.createdAt.toISOString()} | ErrorCode=${ev.errorCode || "None"}`);
  });

  console.log("\n5. AUDIT LOGS FOR THIS APPLICATION:");
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { resourceId: lastApproved.id },
        { resourceId: email?.id },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  console.log(`- AuditLogs found: ${auditLogs.length}`);
  auditLogs.forEach((log, idx) => {
    console.log(`  #${idx + 1} | Action: ${log.action} | EventType: ${log.eventType} | Actor: ${log.actorType} (${log.actorId}) | Timestamp: ${log.createdAt.toISOString()} | CorrelationId: ${log.correlationId}`);
  });

  // Also check if there are other applications with status APPROVED across entire DB
  const currentApprovedApps = await prisma.application.findMany({
    where: { status: "APPROVED" },
    include: {
      candidate: true,
      job: { include: { company: true } },
      selectedGeneratedEmail: true,
    },
  });

  console.log(`\n6. ALL APPLICATIONS CURRENTLY IN 'APPROVED' STATE (Pending manual send): ${currentApprovedApps.length}`);
  currentApprovedApps.forEach((a, i) => {
    console.log(`  #${i + 1} | AppID: ${a.id} | Candidate: ${a.candidate?.firstName} ${a.candidate?.lastName} (${a.candidate?.email}) | Job: "${a.job?.title}" | EmailReviewStatus: ${a.selectedGeneratedEmail?.reviewStatus} | SentAt: ${a.sentAt || "null"}`);
  });

  await prisma.$disconnect();
}

inspectLastApprovedApplication().catch(console.error);
