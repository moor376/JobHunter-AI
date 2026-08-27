import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function showAuditLog() {
  const log = await prisma.auditLog.findFirst({
    where: {
      action: "CANDIDATE_CONTACT_INFO_UPDATED",
      candidateId: "c1000000-0000-0000-0000-000000000001",
    },
    orderBy: { createdAt: "desc" },
  });

  console.log("Audit Log Details:", JSON.stringify(log, null, 2));
  await prisma.$disconnect();
}

showAuditLog().catch(console.error);
