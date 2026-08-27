import { PrismaClient, ApplicationStatus, EmailReviewStatus } from "@prisma/client";

const API_BASE = "http://localhost:3000/api";
const prisma = new PrismaClient();

const candidateId = process.argv[2];
const resumeId = process.argv[3];
const jobId = process.argv[4];
const applicationId = process.argv[5];
const generatedEmailId = process.argv[6];

if (!candidateId || !resumeId || !jobId || !applicationId || !generatedEmailId) {
  console.error("Missing required arguments for restart verification.");
  console.error("Usage: tsx verify-restart-persistence.ts <candidateId> <resumeId> <jobId> <applicationId> <generatedEmailId>");
  process.exit(1);
}

function record(step: string, passed: boolean, details: any) {
  const status: "PASS" | "FAIL" = passed ? "PASS" : "FAIL";
  console.log(`[${status}] ${step}`);
  if (!passed) {
    console.error("  Error Details:", details);
  } else {
    console.log("  Details:", typeof details === "object" ? JSON.stringify(details, null, 2) : details);
  }
}

async function verifyAfterRestart() {
  console.log("=================================================");
  console.log("🔄 VERIFYING PERSISTENCE AFTER BACKEND RESTART");
  console.log("=================================================\n");

  // 1. Health check on new backend process
  try {
    const res = await fetch(`${API_BASE}/health`);
    const data = await res.json();
    const isHealthy = res.status === 200 && data.data?.database === "connected";
    record("10. Restarted Backend Connected to PostgreSQL (/api/health -> connected)", isHealthy, data);
  } catch (err: any) {
    record("10. Restarted Backend Connected to PostgreSQL (/api/health -> connected)", false, err.message);
  }

  // 2. Candidate persistence
  try {
    const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
    const apiRes = await fetch(`${API_BASE}/candidates/${candidateId}`);
    const apiData = await apiRes.json();
    const candidateValid = candidate !== null && apiData.data?.id === candidateId;
    record("11. Candidate Persistence After Restart", candidateValid, {
      candidateInDb: !!candidate,
      email: candidate?.email,
      firstName: candidate?.firstName,
      lastName: candidate?.lastName,
    });
  } catch (err: any) {
    record("11. Candidate Persistence After Restart", false, err.message);
  }

  // 3. Resume persistence
  try {
    const resume = await prisma.resume.findUnique({ where: { id: resumeId } });
    const apiRes = await fetch(`${API_BASE}/candidates/${candidateId}/resumes/${resumeId}`);
    const apiData = await apiRes.json();
    const resumeValid = resume !== null && apiData.data?.id === resumeId && resume.parseStatus === "COMPLETED";
    record("12. Resume Persistence After Restart", resumeValid, {
      resumeInDb: !!resume,
      parseStatus: resume?.parseStatus,
      candidateId: resume?.candidateId,
    });
  } catch (err: any) {
    record("12. Resume Persistence After Restart", false, err.message);
  }

  // 4. Job persistence
  try {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: { company: true },
    });
    const apiRes = await fetch(`${API_BASE}/jobs/${jobId}`);
    const apiData = await apiRes.json();
    const jobValid = job !== null && apiData.data?.id === jobId && job.company !== null;
    record("13. Job & Company Persistence After Restart", jobValid, {
      jobInDb: !!job,
      title: job?.title,
      company: job?.company?.name,
    });
  } catch (err: any) {
    record("13. Job & Company Persistence After Restart", false, err.message);
  }

  // 5. Application persistence
  try {
    const app = await prisma.application.findUnique({
      where: { id: applicationId },
      include: { selectedGeneratedEmail: true, candidate: true, job: true },
    });
    const apiRes = await fetch(`${API_BASE}/applications/${applicationId}`);
    const apiData = await apiRes.json();
    const appValid = app !== null &&
      apiData.data?.id === applicationId &&
      app.status === ApplicationStatus.PENDING_APPROVAL &&
      app.duplicateKey === `${candidateId}:${jobId}:EMAIL`;

    record("14. Application Persistence After Restart (PENDING_APPROVAL)", appValid, {
      appInDb: !!app,
      status: app?.status,
      duplicateKey: app?.duplicateKey,
      candidate: app?.candidate?.email,
      job: app?.job?.title,
    });
  } catch (err: any) {
    record("14. Application Persistence After Restart (PENDING_APPROVAL)", false, err.message);
  }

  // 6. GeneratedEmail persistence
  try {
    const email = await prisma.generatedEmail.findUnique({ where: { id: generatedEmailId } });
    const emailValid = email !== null &&
      email.applicationId === applicationId &&
      email.reviewStatus === EmailReviewStatus.PENDING_REVIEW;

    record("15. GeneratedEmail Persistence After Restart (PENDING_REVIEW)", emailValid, {
      emailInDb: !!email,
      reviewStatus: email?.reviewStatus,
      subject: email?.subject,
      recipientEmail: email?.recipientEmail,
    });
  } catch (err: any) {
    record("15. GeneratedEmail Persistence After Restart (PENDING_REVIEW)", false, err.message);
  }

  // 7. AuditLog persistence
  try {
    const logs = await prisma.auditLog.findMany({
      where: {
        OR: [
          { candidateId },
          { resourceId: candidateId },
          { resourceId: applicationId },
          { resourceId: jobId },
        ],
      },
      orderBy: { createdAt: "asc" },
    });

    const logsValid = logs.length >= 3;
    record("16. AuditLog Persistence After Restart", logsValid, {
      count: logs.length,
      actions: logs.map((l) => `${l.action} (${l.eventType})`),
    });
  } catch (err: any) {
    record("16. AuditLog Persistence After Restart", false, err.message);
  }

  console.log("\n=================================================");
  console.log("✅ ALL POST-RESTART PERSISTENCE CHECKS COMPLETED");
  console.log("=================================================\n");

  await prisma.$disconnect();
}

verifyAfterRestart().catch(async (e) => {
  console.error("FATAL POST-RESTART VERIFICATION ERROR:", e);
  await prisma.$disconnect();
  process.exit(1);
});
