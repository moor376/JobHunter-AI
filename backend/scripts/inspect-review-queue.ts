import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function inspectReviewQueue() {
  console.log("=================================================");
  console.log("🔍 REAL POSTGRESQL REVIEW QUEUE INSPECTION");
  console.log("=================================================\n");

  // 1. Jobs Inspection
  const allJobs = await prisma.job.findMany({
    include: { company: true, jobSource: true },
    orderBy: { createdAt: "asc" },
  });

  const uniqueJobIds = new Set(allJobs.map((j) => j.id));

  // Check duplicate jobs by externalJobId (where externalJobId is present)
  const externalJobIdMap = new Map<string, string[]>();
  const contentHashMap = new Map<string, string[]>();

  for (const job of allJobs) {
    if (job.externalJobId) {
      const existing = externalJobIdMap.get(job.externalJobId) || [];
      existing.push(job.id);
      externalJobIdMap.set(job.externalJobId, existing);
    }
    if (job.contentHash) {
      const existing = contentHashMap.get(job.contentHash) || [];
      existing.push(job.id);
      contentHashMap.set(job.contentHash, existing);
    }
  }

  const dupExternalJobIds = Array.from(externalJobIdMap.entries()).filter(([_, ids]) => ids.length > 1);
  const dupContentHashes = Array.from(contentHashMap.entries()).filter(([_, ids]) => ids.length > 1);

  // 2. Applications Inspection
  const allApps = await prisma.application.findMany({
    include: {
      candidate: true,
      job: { include: { company: true } },
      selectedGeneratedEmail: true,
      generatedEmails: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const appStatusCounts: Record<string, number> = {};
  for (const app of allApps) {
    appStatusCounts[app.status] = (appStatusCounts[app.status] || 0) + 1;
  }

  // Applications per Job
  const appsPerJobMap = new Map<string, { jobTitle: string; companyName: string; count: number; appIds: string[] }>();
  for (const app of allApps) {
    const key = app.jobId;
    const existing = appsPerJobMap.get(key) || {
      jobTitle: app.job?.title || "Unknown Job",
      companyName: app.job?.company?.name || "Unknown Company",
      count: 0,
      appIds: [],
    };
    existing.count++;
    existing.appIds.push(app.id);
    appsPerJobMap.set(key, existing);
  }

  // 3. Duplicate Applications Check (candidateId + jobId + channel / duplicateKey)
  const dupKeyMap = new Map<string, string[]>();
  for (const app of allApps) {
    const key = app.duplicateKey || `${app.candidateId}:${app.jobId}:${app.channel}`;
    const existing = dupKeyMap.get(key) || [];
    existing.push(app.id);
    dupKeyMap.set(key, existing);
  }
  const dupApplications = Array.from(dupKeyMap.entries()).filter(([_, ids]) => ids.length > 1);

  // 4. GeneratedEmails Inspection
  const allEmails = await prisma.generatedEmail.findMany({
    orderBy: { createdAt: "asc" },
  });

  const emailReviewStatusCounts: Record<string, number> = {};
  for (const email of allEmails) {
    emailReviewStatusCounts[email.reviewStatus] = (emailReviewStatusCounts[email.reviewStatus] || 0) + 1;
  }

  // Check 1-to-1 relationship and orphans for GeneratedEmail
  const emailsPerAppMap = new Map<string, string[]>();
  const orphanEmails: string[] = [];
  for (const email of allEmails) {
    const appExists = allApps.some((a) => a.id === email.applicationId);
    if (!appExists) {
      orphanEmails.push(email.id);
    }
    const existing = emailsPerAppMap.get(email.applicationId) || [];
    existing.push(email.id);
    emailsPerAppMap.set(email.applicationId, existing);
  }

  // Apps with multiple emails
  const multipleEmailsPerApp = Array.from(emailsPerAppMap.entries()).filter(([_, ids]) => ids.length > 1);

  // 5. Orphan Applications Check
  const allCandidates = await prisma.candidate.findMany();
  const candidateIdSet = new Set(allCandidates.map((c) => c.id));
  const orphanApps = allApps.filter((a) => !candidateIdSet.has(a.candidateId) || !uniqueJobIds.has(a.jobId));

  // 6. Review Queue Items Status Check
  const pendingApprovalApps = allApps.filter((a) => a.status === "PENDING_APPROVAL");
  const reviewQueueStatusAudit = pendingApprovalApps.map((app) => {
    const emailStatus = app.selectedGeneratedEmail?.reviewStatus || "NO_EMAIL";
    const isValid = app.status === "PENDING_APPROVAL" && emailStatus === "PENDING_REVIEW";
    return {
      appId: app.id,
      candidateEmail: app.candidate?.email,
      jobTitle: app.job?.title,
      company: app.job?.company?.name,
      appStatus: app.status,
      emailId: app.selectedGeneratedEmailId,
      emailStatus,
      isValid,
    };
  });

  const nonCompliantReviewQueueItems = reviewQueueStatusAudit.filter((item) => !item.isValid);

  // OUTPUT RESULTS
  console.log("--- 1. JOBS SUMMARY ---");
  console.log(`Total Jobs in DB: ${allJobs.length}`);
  console.log(`Unique Job IDs: ${uniqueJobIds.size}`);
  console.log(`Duplicate externalJobId occurrences: ${dupExternalJobIds.length}`);
  if (dupExternalJobIds.length > 0) {
    console.log("Duplicate externalJobIds found:", JSON.stringify(dupExternalJobIds, null, 2));
  }
  console.log(`Duplicate contentHash occurrences: ${dupContentHashes.length}`);
  if (dupContentHashes.length > 0) {
    console.log("Duplicate contentHashes found:", JSON.stringify(dupContentHashes, null, 2));
  }

  console.log("\n--- 2. APPLICATIONS SUMMARY ---");
  console.log(`Total Applications in DB: ${allApps.length}`);
  console.log("Applications by Status:", JSON.stringify(appStatusCounts, null, 2));

  console.log("\n--- 3. APPLICATIONS PER JOB BREAKDOWN ---");
  appsPerJobMap.forEach((val, jobId) => {
    console.log(`- Job [${jobId}] "${val.jobTitle}" (${val.companyName}): ${val.count} application(s)`);
  });

  console.log("\n--- 4. DUPLICATE APPLICATIONS CHECK (candidateId + jobId + channel) ---");
  console.log(`Duplicate Applications Count: ${dupApplications.length}`);
  if (dupApplications.length > 0) {
    console.log("DUPLICATES FOUND:", JSON.stringify(dupApplications, null, 2));
  } else {
    console.log("✓ No duplicate applications found (all duplicateKeys are 100% unique).");
  }

  console.log("\n--- 5. GENERATED EMAILS & ORPHANS CHECK ---");
  console.log(`Total Generated Emails in DB: ${allEmails.length}`);
  console.log("Generated Emails by Review Status:", JSON.stringify(emailReviewStatusCounts, null, 2));
  console.log(`Orphan Generated Emails (missing application): ${orphanEmails.length}`);
  console.log(`Applications with multiple GeneratedEmails: ${multipleEmailsPerApp.length}`);
  console.log(`Orphan Applications (missing candidate or job): ${orphanApps.length}`);

  console.log("\n--- 6. REVIEW QUEUE COMPLIANCE AUDIT ---");
  console.log(`Total Applications in PENDING_APPROVAL: ${pendingApprovalApps.length}`);
  console.log(`Review Queue items non-compliant (not PENDING_APPROVAL + PENDING_REVIEW): ${nonCompliantReviewQueueItems.length}`);

  console.log("\n--- 7. DETAILED INVENTORY OF ALL APPLICATIONS & RELATIONS ---");
  allApps.forEach((app, idx) => {
    console.log(
      `#${idx + 1} | AppID: ${app.id} | Candidate: ${app.candidate?.firstName} ${app.candidate?.lastName} (${app.candidate?.email}) | Job: "${app.job?.title}" (${app.job?.company?.name}) | Channel: ${app.channel} | Status: ${app.status} | EmailID: ${app.selectedGeneratedEmailId || "None"} | EmailStatus: ${app.selectedGeneratedEmail?.reviewStatus || "None"} | DuplicateKey: ${app.duplicateKey}`
    );
  });

  await prisma.$disconnect();
}

inspectReviewQueue().catch(async (e) => {
  console.error("FATAL ERROR DURING INSPECTION:", e);
  await prisma.$disconnect();
  process.exit(1);
});
