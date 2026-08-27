import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function inspectNayeraApps() {
  const candidate = await prisma.candidate.findUnique({
    where: { id: "c1000000-0000-0000-0000-000000000001" },
    include: {
      applications: {
        include: {
          job: { include: { company: true } },
          selectedGeneratedEmail: true,
          generatedEmails: true,
        },
      },
    },
  });

  console.log("Candidate:", candidate?.id, candidate?.firstName, candidate?.lastName, candidate?.email);
  console.log("Applications count:", candidate?.applications.length);
  candidate?.applications.forEach((app, idx) => {
    console.log(`\nApp #${idx + 1}: ID=${app.id}, Status=${app.status}, Job="${app.job?.title}"`);
    console.log(`  Selected GeneratedEmail ID: ${app.selectedGeneratedEmailId}`);
    if (app.selectedGeneratedEmail) {
      console.log(`  Recipient: ${app.selectedGeneratedEmail.recipientEmail}`);
      console.log(`  Subject: ${app.selectedGeneratedEmail.subject}`);
      console.log(`  ReviewStatus: ${app.selectedGeneratedEmail.reviewStatus}`);
      console.log(`  Body preview:\n${app.selectedGeneratedEmail.body.slice(0, 300)}...`);
    }
  });

  await prisma.$disconnect();
}

inspectNayeraApps().catch(console.error);
