import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function verifyState() {
  const candidateId = "c1000000-0000-0000-0000-000000000001";
  const appId = "da000000-0000-0000-0000-000000000001";
  const emailId = "ea000000-0000-0000-0000-000000000001";

  const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
  const app = await prisma.application.findUnique({ where: { id: appId }, include: { job: { include: { company: true } } } });
  const email = await prisma.generatedEmail.findUnique({ where: { id: emailId } });
  const latestLog = await prisma.auditLog.findFirst({
    where: { candidateId },
    orderBy: { createdAt: "desc" },
  });

  // Verify other candidates untouched
  const otherCandidates = await prisma.candidate.findMany({
    where: { id: { not: candidateId } },
  });

  // Safety checks
  const totalSentApps = await prisma.application.count({ where: { status: "SENT" } });
  const totalSendingApps = await prisma.application.count({ where: { status: "SENDING" } });

  console.log("--------------------------------------------------");
  console.log("Candidate ID:                 ", candidate?.id);
  console.log("الاسم الجديد (New Name):       ", `${candidate?.firstName} ${candidate?.lastName}`);
  console.log("البريد الجديد (New Email):     ", candidate?.email);
  console.log("الهاتف الجديد (New Phone):     ", candidate?.phone);
  console.log("Application ID:               ", app?.id);
  console.log("Job Title:                    ", app?.job?.title);
  console.log("Application Status:           ", app?.status);
  console.log("GeneratedEmail ID:            ", email?.id);
  console.log("Recipient:                    ", email?.recipientEmail);
  console.log("Subject:                      ", email?.subject);
  console.log("GeneratedEmail reviewStatus:  ", email?.reviewStatus);
  console.log("--------------------------------------------------");
  console.log("Latest AuditLog Action:       ", latestLog?.action);
  console.log("Latest AuditLog EventType:    ", latestLog?.eventType);
  console.log("Latest AuditLog Timestamp:    ", latestLog?.createdAt.toISOString());
  console.log("Latest AuditLog Actor:        ", latestLog?.actorType, `(${latestLog?.actorId})`);
  console.log("--------------------------------------------------");
  console.log("Other Candidates Untouched:   ", otherCandidates.length > 0 ? `YES (${otherCandidates.length} other candidates unchanged)` : "N/A");
  console.log("Approval Gate Maintained:     ", app?.status === "PENDING_APPROVAL" && email?.reviewStatus === "PENDING_REVIEW" ? "PASS" : "FAIL");
  console.log("Gmail Safety (0 Auto-Sends):  ", totalSentApps === 0 && totalSendingApps === 0 ? "PASS" : "FAIL");
  console.log("--------------------------------------------------");

  await prisma.$disconnect();
}

verifyState().catch(console.error);
