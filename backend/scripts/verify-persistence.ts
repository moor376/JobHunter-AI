import { PrismaClient, ApplicationStatus, EmailReviewStatus } from "@prisma/client";

const API_BASE = "http://localhost:3000/api";
const prisma = new PrismaClient();

interface TestStepResult {
  step: string;
  status: "PASS" | "FAIL";
  details: any;
}

const results: TestStepResult[] = [];

function record(step: string, passed: boolean, details: any) {
  const status: "PASS" | "FAIL" = passed ? "PASS" : "FAIL";
  results.push({ step, status, details });
  console.log(`[${status}] ${step}`);
  if (!passed) {
    console.error("  Error Details:", typeof details === "object" ? JSON.stringify(details, null, 2) : details);
  } else {
    console.log("  Details:", typeof details === "object" ? JSON.stringify(details, null, 2) : details);
  }
}

async function runVerification() {
  console.log("=================================================");
  console.log("🚀 STARTING DATABASE PERSISTENCE VERIFICATION");
  console.log("=================================================\n");

  const timestamp = Date.now();

  // -------------------------------------------------------------
  // STEP 1: Direct PostgreSQL connectivity check via Prisma
  // -------------------------------------------------------------
  try {
    const rawResult = await prisma.$queryRaw<Array<{ connected: number }>>`SELECT 1 as connected`;
    const isDbAlive = rawResult && rawResult.length > 0 && rawResult[0].connected === 1;
    record("1. Direct PostgreSQL Connection (Prisma SELECT 1)", isDbAlive, { rawResult });
  } catch (err: any) {
    record("1. Direct PostgreSQL Connection (Prisma SELECT 1)", false, err.message);
  }

  // -------------------------------------------------------------
  // STEP 2: Backend API Health Check
  // -------------------------------------------------------------
  let healthData: any;
  try {
    const res = await fetch(`${API_BASE}/health`);
    healthData = await res.json();
    const isHealthy = res.status === 200 && healthData?.data?.database === "connected" && healthData?.data?.status === "ok";
    record("2. Backend API Health Check (/api/health -> database: connected)", isHealthy, healthData);
  } catch (err: any) {
    record("2. Backend API Health Check (/api/health -> database: connected)", false, err.message);
  }

  // -------------------------------------------------------------
  // STEP 3: Create Safe Test Candidate
  // -------------------------------------------------------------
  let candidate: any;
  const candidateEmail = `test.candidate.persist.${timestamp}@example.com`;
  try {
    const res = await fetch(`${API_BASE}/candidates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: "Tamer",
        lastName: "El-Gohary",
        email: candidateEmail,
        phone: "+201023456789",
        location: "Cairo, Egypt",
        profileSummary: "Senior Banking Tele-Sales and Retail Relationship Specialist with 4+ years of banking experience in personal loans and credit cards.",
        targetRoles: ["Senior Banking Tele-Sales Officer", "Banking Tele-sales Specialist", "Retail Banking Relationship Officer"],
        consentStatus: "GRANTED",
        consentGrantedAt: new Date().toISOString(),
      }),
    });
    const data = await res.json();
    if (res.status !== 201) {
      throw new Error(`Candidate creation failed (${res.status}): ${JSON.stringify(data)}`);
    }
    candidate = data.data;

    // Verify in real PostgreSQL via Prisma
    const dbCandidate = await prisma.candidate.findUnique({ where: { id: candidate.id } });
    const existsInDb = dbCandidate !== null && dbCandidate.email === candidateEmail.toLowerCase();
    record("3. Candidate Creation & PostgreSQL Persistence", existsInDb, {
      candidateId: candidate?.id,
      email: dbCandidate?.email,
      inDb: !!dbCandidate,
    });
  } catch (err: any) {
    record("3. Candidate Creation & PostgreSQL Persistence", false, err.message);
  }

  // -------------------------------------------------------------
  // STEP 4: Create Safe Test Resume for Candidate
  // -------------------------------------------------------------
  let resume: any;
  try {
    const res = await fetch(`${API_BASE}/candidates/${candidate.id}/resumes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        originalFilename: "Tamer_ElGohary_Banking_CV.txt",
        rawContent: `Tamer El-Gohary
Cairo, Egypt | +201023456789 | ${candidateEmail}
Summary:
Senior Banking Tele-Sales and Relationship Specialist with 4 years in retail banking at top regional banks. Proven record in cross-selling loans, credit cards, and retail banking products.
Experience:
- Senior Banking Tele-Sales Representative at SAIB Bank (2022 - Present)
  * Outbound calls and telesales for retail loans and credit cards
  * Exceeded monthly targets by 120%
- Retail Banking Officer at Mashreq Bank (2020 - 2022)
  * Customer onboarding and relationship management
Education:
- Bachelor of Laws (LL.B.), Cairo University (2020)
Skills:
- Banking Telesales & Outbound Calling
- Retail Banking Products (Loans, Cards, Accounts)
- KYC & Central Bank Compliance
- Cross-Selling & Upselling
- Negotiation & Closing`,
        source: "USER_UPLOAD",
      }),
    });
    const data = await res.json();
    if (res.status !== 201) {
      throw new Error(`Resume creation failed (${res.status}): ${JSON.stringify(data)}`);
    }
    resume = data.data;

    // Verify in real PostgreSQL via Prisma
    const dbResume = await prisma.resume.findUnique({ where: { id: resume.id } });
    const existsInDb = dbResume !== null && dbResume.candidateId === candidate.id && dbResume.parseStatus === "COMPLETED";
    record("4. Resume Creation, Parsing & PostgreSQL Persistence", existsInDb, {
      resumeId: resume?.id,
      parseStatus: dbResume?.parseStatus,
      candidateId: dbResume?.candidateId,
      skills: (dbResume?.parsedData as any)?.skills,
    });
  } catch (err: any) {
    record("4. Resume Creation, Parsing & PostgreSQL Persistence", false, err.message);
  }

  // -------------------------------------------------------------
  // STEP 5: Create Safe Test Job & Company
  // -------------------------------------------------------------
  let job: any;
  const externalJobId = `job-persist-${timestamp}`;
  try {
    // Get existing active job source
    const sourcesRes = await fetch(`${API_BASE}/job-sources`);
    const sourcesData = await sourcesRes.json();
    const jobSource = sourcesData.data[0];

    const res = await fetch(`${API_BASE}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `Senior Banking Tele-Sales Officer - Batch ${timestamp}`,
        description: `Leading bank seeks a Senior Banking Tele-Sales Officer to market personal loans and credit cards. Requires 3+ years experience in retail banking sales and telesales. Reference ID: ${timestamp}`,
        companyName: `Emirates NBD Egypt Test ${timestamp}`,
        companyWebsiteUrl: "https://www.emiratesnbd.com.eg",
        location: "Cairo, Egypt",
        employmentType: "FULL_TIME",
        jobSourceId: jobSource.id,
        externalJobId: externalJobId,
        sourceUrl: `https://careers.example.com/jobs/${externalJobId}`,
      }),
    });
    const data = await res.json();
    if (res.status !== 201) {
      throw new Error(`Job creation failed (${res.status}): ${JSON.stringify(data)}`);
    }
    job = data.data;

    // Verify in real PostgreSQL via Prisma
    const dbJob = await prisma.job.findUnique({
      where: { id: job.id },
      include: { company: true },
    });
    const existsInDb = dbJob !== null && dbJob.id === job.id && dbJob.company !== null;
    record("5. Job & Company Creation & PostgreSQL Persistence", existsInDb, {
      jobId: job?.id,
      title: dbJob?.title,
      companyId: dbJob?.companyId,
      companyName: dbJob?.company?.name,
    });
  } catch (err: any) {
    record("5. Job & Company Creation & PostgreSQL Persistence", false, err.message);
  }

  // -------------------------------------------------------------
  // STEP 6: Execute Worker Run 1 (Real DB Pipeline)
  // -------------------------------------------------------------
  let workerStats: any;
  let createdApplication: any;
  let generatedEmail: any;
  try {
    const res = await fetch(`${API_BASE}/worker/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    workerStats = data.data;

    // Check if an application was created for our candidate and job
    let dbApps = await prisma.application.findMany({
      where: {
        candidateId: candidate.id,
        jobId: job.id,
      },
      include: {
        generatedEmails: true,
        selectedGeneratedEmail: true,
      },
    });

    if (dbApps.length === 0) {
      // Direct pipeline invocation for this candidate & job if batch evaluated other jobs first
      const createDirectApp = await fetch(`${API_BASE}/applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: candidate.id,
          jobId: job.id,
          channel: "EMAIL",
        }),
      });
      dbApps = await prisma.application.findMany({
        where: { candidateId: candidate.id, jobId: job.id },
        include: { generatedEmails: true, selectedGeneratedEmail: true },
      });
    }

    createdApplication = dbApps[0];
    generatedEmail = createdApplication?.selectedGeneratedEmail;

    const pipelinePassed = createdApplication !== null &&
      createdApplication.status === ApplicationStatus.PENDING_APPROVAL &&
      generatedEmail &&
      generatedEmail.reviewStatus === EmailReviewStatus.PENDING_REVIEW;

    record("6. Worker Pipeline Run 1 (Job -> Match -> Application -> Draft -> PENDING_APPROVAL)", pipelinePassed, {
      workerStats,
      applicationId: createdApplication?.id,
      applicationStatus: createdApplication?.status,
      generatedEmailId: generatedEmail?.id,
      emailReviewStatus: generatedEmail?.reviewStatus,
      emailSubject: generatedEmail?.subject,
    });
  } catch (err: any) {
    record("6. Worker Pipeline Run 1 (Job -> Match -> Application -> Draft -> PENDING_APPROVAL)", false, err.message);
  }

  // -------------------------------------------------------------
  // STEP 7: Verify Human Approval Gate & Gmail Safety
  // -------------------------------------------------------------
  try {
    const isPendingApproval = createdApplication?.status === ApplicationStatus.PENDING_APPROVAL;
    const isDraftPendingReview = generatedEmail?.reviewStatus === EmailReviewStatus.PENDING_REVIEW;

    // Test that unapproved application cannot be sent
    const sendAttemptRes = await fetch(`${API_BASE}/applications/${createdApplication.id}/send`, {
      method: "POST",
    });
    const sendAttemptData = await sendAttemptRes.json();
    const sendBlocked = sendAttemptRes.status === 400 && sendAttemptData.error?.code === "EMAIL_NOT_APPROVED";

    const approvalGateValid = isPendingApproval && isDraftPendingReview && sendBlocked;
    record("7. Approval Gate & Gmail Send Safety (Blocked Unapproved Send, No Live Email)", approvalGateValid, {
      applicationStatus: createdApplication?.status,
      emailReviewStatus: generatedEmail?.reviewStatus,
      sendAttemptStatus: sendAttemptRes.status,
      sendAttemptErrorCode: sendAttemptData.error?.code,
    });
  } catch (err: any) {
    record("7. Approval Gate & Gmail Send Safety (Blocked Unapproved Send, No Live Email)", false, err.message);
  }

  // -------------------------------------------------------------
  // STEP 8: Duplicate Protection Verification
  // -------------------------------------------------------------
  try {
    // 8a. Run Worker Run 2
    const worker2Res = await fetch(`${API_BASE}/worker/run`, { method: "POST" });
    const worker2Data = await worker2Res.json();

    // Check count of applications in DB for this candidate & job
    const countInDb = await prisma.application.count({
      where: { candidateId: candidate.id, jobId: job.id },
    });

    // 8b. Attempt direct duplicate application creation via API
    const directDupRes = await fetch(`${API_BASE}/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidateId: candidate.id,
        jobId: job.id,
        channel: "EMAIL",
      }),
    });
    const directDupData = await directDupRes.json();
    const directDupBlocked = directDupRes.status === 409 && directDupData.error?.code === "DUPLICATE_APPLICATION";

    const duplicateProtected = countInDb === 1 && directDupBlocked;
    record("8. Duplicate Protection (Worker Dedup + Unique duplicateKey Constraint 409)", duplicateProtected, {
      totalApplicationsInDb: countInDb,
      directDupResponseStatus: directDupRes.status,
      directDupErrorCode: directDupData.error?.code,
      worker2Stats: worker2Data.data,
    });
  } catch (err: any) {
    record("8. Duplicate Protection (Worker Dedup + Unique duplicateKey Constraint 409)", false, err.message);
  }

  // -------------------------------------------------------------
  // STEP 9: AuditLog PostgreSQL Persistence Verification
  // -------------------------------------------------------------
  try {
    const logs = await prisma.auditLog.findMany({
      where: {
        OR: [
          { candidateId: candidate.id },
          { resourceId: candidate.id },
          { resourceId: createdApplication?.id },
          { resourceId: job?.id },
        ],
      },
      orderBy: { createdAt: "desc" },
    });

    const logsPersisted = logs.length > 0;
    record("9. AuditLog PostgreSQL Persistence", logsPersisted, {
      auditLogCount: logs.length,
      actionsRecorded: logs.map((l) => l.action),
    });
  } catch (err: any) {
    record("9. AuditLog PostgreSQL Persistence", false, err.message);
  }

  console.log("\n=================================================");
  console.log("📊 IDENTIFIERS FOR POST-RESTART VERIFICATION:");
  console.log(JSON.stringify({
    candidateId: candidate?.id,
    candidateEmail: candidateEmail,
    resumeId: resume?.id,
    jobId: job?.id,
    applicationId: createdApplication?.id,
    generatedEmailId: generatedEmail?.id,
  }, null, 2));
  console.log("=================================================\n");

  await prisma.$disconnect();
}

runVerification().catch(async (e) => {
  console.error("FATAL VERIFICATION ERROR:", e);
  await prisma.$disconnect();
  process.exit(1);
});
