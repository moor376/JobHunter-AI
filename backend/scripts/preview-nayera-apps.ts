import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CANDIDATE_ID = "c1000000-0000-0000-0000-000000000001";

async function previewNayeraApps() {
  console.log("=================================================");
  console.log("🔍 READ-ONLY PREVIEW OF NAYERA TAREK'S APPLICATIONS");
  console.log("=================================================\n");

  const candidate = await prisma.candidate.findUnique({
    where: { id: CANDIDATE_ID },
    include: {
      applications: {
        include: {
          job: { include: { company: true } },
          selectedGeneratedEmail: true,
          emailEvents: { orderBy: { createdAt: "asc" } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!candidate) {
    console.error("Candidate not found!");
    return;
  }

  console.log(`Candidate: ${candidate.firstName} ${candidate.lastName} (${candidate.email})`);
  console.log(`Total Applications: ${candidate.applications.length}\n`);

  const apps = candidate.applications;

  apps.forEach((app, idx) => {
    const jobTitle = app.job?.title || "Unknown Job";
    const companyName = app.job?.company?.name || "Unknown Company";
    const isExplicitTest =
      jobTitle.toLowerCase().includes("test") ||
      companyName.toLowerCase().includes("test") ||
      jobTitle.toLowerCase().includes("verification") ||
      jobTitle.toLowerCase().includes("batch") ||
      app.status === "SENT" ||
      app.status === "REPLIED";

    console.log(`--------------------------------------------------`);
    console.log(`Application #${idx + 1}`);
    console.log(`- Application ID:      ${app.id}`);
    console.log(`- Job Title:           ${jobTitle}`);
    console.log(`- Company:             ${companyName}`);
    console.log(`- Status:              ${app.status}`);
    console.log(`- Channel:             ${app.channel}`);
    console.log(`- Created At:          ${app.createdAt.toISOString()}`);
    console.log(`- Approved At:         ${app.approvedAt ? app.approvedAt.toISOString() : "null"}`);
    console.log(`- Sent At:             ${app.sentAt ? app.sentAt.toISOString() : "null"}`);
    console.log(`- GeneratedEmail ID:   ${app.selectedGeneratedEmailId || "None"}`);
    console.log(`- Email ReviewStatus:  ${app.selectedGeneratedEmail?.reviewStatus || "None"}`);
    console.log(`- Recipient:           ${app.selectedGeneratedEmail?.recipientEmail || "None"}`);
    console.log(`- Subject:             ${app.selectedGeneratedEmail?.subject || "None"}`);
    console.log(`- EmailEvents (${app.emailEvents.length}): ${app.emailEvents.map((e) => e.type).join(" ➔ ") || "None"}`);
    console.log(`- Classification:      ${isExplicitTest ? "⚠️ TEST / VERIFICATION / EPHEMERAL" : "✅ REAL BANKING OPPORTUNITY"}`);
  });

  console.log(`\n=================================================`);
  console.log(`SUMMARY BREAKDOWN`);
  console.log(`=================================================`);

  const realPreservedApps = apps.filter((app) => {
    const jobTitle = app.job?.title || "";
    const companyName = app.job?.company?.name || "";
    const isTest =
      jobTitle.toLowerCase().includes("test") ||
      companyName.toLowerCase().includes("test") ||
      jobTitle.toLowerCase().includes("verification") ||
      jobTitle.toLowerCase().includes("batch");
    return !isTest;
  });

  const testAppsToDelete = apps.filter((app) => {
    const jobTitle = app.job?.title || "";
    const companyName = app.job?.company?.name || "";
    return (
      jobTitle.toLowerCase().includes("test") ||
      companyName.toLowerCase().includes("test") ||
      jobTitle.toLowerCase().includes("verification") ||
      jobTitle.toLowerCase().includes("batch")
    );
  });

  console.log(`Total Applications Before: ${apps.length}`);
  console.log(`Test Applications Proposed for Deletion: ${testAppsToDelete.length}`);
  console.log(`Real Applications Proposed to Preserve: ${realPreservedApps.length}`);

  await prisma.$disconnect();
}

previewNayeraApps().catch(console.error);
