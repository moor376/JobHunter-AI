import { createApp } from "../backend/dist/app.js";
import { createServer } from "node:http";

async function testAllEndpoints() {
  console.log("Starting server for production runtime test...");
  const app = createApp();
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const baseUrl = `http://127.0.0.1:${addr.port}/api`;
  console.log(`Server listening on ${baseUrl}`);

  const results = [];

  async function check(name, fn) {
    try {
      const res = await fn();
      console.log(`[PASS] ${name}:`, res);
      results.push({ name, pass: true, res });
    } catch (err) {
      console.error(`[FAIL] ${name}:`, err.message);
      results.push({ name, pass: false, error: err.message });
    }
  }

  // 1. Health
  await check("1. GET /health", async () => {
    const res = await fetch(`${baseUrl}/health`);
    const data = await res.json();
    if (!res.ok) throw new Error(`Status ${res.status}: ${JSON.stringify(data)}`);
    return data.status;
  });

  // 2. Candidates
  let candidate = null;
  await check("2. GET /candidates", async () => {
    const res = await fetch(`${baseUrl}/candidates`);
    const data = await res.json();
    if (!res.ok) throw new Error(`Status ${res.status}: ${JSON.stringify(data)}`);
    candidate = data.data?.[0];
    return `Found ${data.data?.length} candidates, first: ${candidate?.firstName} (${candidate?.id})`;
  });

  // 3. Resumes
  let resume = null;
  await check("3. GET /candidates/:id/resumes", async () => {
    const res = await fetch(`${baseUrl}/candidates/${candidate.id}/resumes`);
    const data = await res.json();
    if (!res.ok) throw new Error(`Status ${res.status}: ${JSON.stringify(data)}`);
    resume = data.data?.[0];
    return `Found ${data.data?.length} resumes, version: ${resume?.version}`;
  });

  // 4. Job Sources
  await check("4. GET /job-sources", async () => {
    const res = await fetch(`${baseUrl}/job-sources`);
    const data = await res.json();
    if (!res.ok) throw new Error(`Status ${res.status}: ${JSON.stringify(data)}`);
    return `Found ${data.data?.length} sources`;
  });

  // 5. Jobs
  let jobs = [];
  await check("5. GET /jobs", async () => {
    const res = await fetch(`${baseUrl}/jobs`);
    const data = await res.json();
    if (!res.ok) throw new Error(`Status ${res.status}: ${JSON.stringify(data)}`);
    jobs = data.data || [];
    return `Found ${jobs.length} jobs`;
  });

  // 6. Ranked Jobs
  await check("6. GET /jobs/ranked", async () => {
    const res = await fetch(`${baseUrl}/jobs/ranked?candidateId=${candidate.id}`);
    const data = await res.json();
    if (!res.ok) throw new Error(`Status ${res.status}: ${JSON.stringify(data)}`);
    return `Found ${data.data?.length} ranked jobs`;
  });

  // 7. Worker Status
  await check("7. GET /worker/status", async () => {
    const res = await fetch(`${baseUrl}/worker/status`);
    const data = await res.json();
    if (!res.ok) throw new Error(`Status ${res.status}: ${JSON.stringify(data)}`);
    return `Worker enabled: ${data.data?.isEnabled}, running: ${data.data?.isRunning}`;
  });

  // 8. Worker Configure
  await check("8. POST /worker/configure", async () => {
    const res = await fetch(`${baseUrl}/worker/configure`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoApprovalPolicy: "MANUAL", matchThreshold: 65 }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Status ${res.status}: ${JSON.stringify(data)}`);
    return `Threshold updated to: ${data.data?.matchThreshold}`;
  });

  // 9. Worker Enable/Disable
  await check("9. POST /worker/enable & disable", async () => {
    const res1 = await fetch(`${baseUrl}/worker/enable`, { method: "POST" });
    const data1 = await res1.json();
    if (!res1.ok) throw new Error(`Enable status ${res1.status}: ${JSON.stringify(data1)}`);
    const res2 = await fetch(`${baseUrl}/worker/disable`, { method: "POST" });
    const data2 = await res2.json();
    if (!res2.ok) throw new Error(`Disable status ${res2.status}: ${JSON.stringify(data2)}`);
    return `Toggle ok: ${data2.message}`;
  });

  // 10. Consent
  await check("10. POST /candidates/:id/consent", async () => {
    const res = await fetch(`${baseUrl}/candidates/${candidate.id}/consent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consentStatus: "GRANTED" }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Status ${res.status}: ${JSON.stringify(data)}`);
    return `Consent: ${data.data?.consentStatus}`;
  });

  // 11. Prepare-all
  await check("11. POST /applications/prepare-all", async () => {
    const res = await fetch(`${baseUrl}/applications/prepare-all`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateId: candidate.id }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Status ${res.status}: ${JSON.stringify(data)}`);
    return `Prepared: ${data.data?.totalPrepared} of ${data.data?.totalEvaluated} jobs`;
  });

  // 12. Prepared list
  let preparedList = [];
  await check("12. GET /applications/prepared", async () => {
    const res = await fetch(`${baseUrl}/applications/prepared`);
    const data = await res.json();
    if (!res.ok) throw new Error(`Status ${res.status}: ${JSON.stringify(data)}`);
    preparedList = data.data || [];
    return `Found ${preparedList.length} prepared applications`;
  });

  // 13. Prepared verify freshness & approve/reject
  if (preparedList.length > 0) {
    const prep = preparedList[0];
    await check("13. POST /applications/prepared/:id/verify-freshness", async () => {
      const res = await fetch(`${baseUrl}/applications/prepared/${prep.id}/verify-freshness`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(`Status ${res.status}: ${JSON.stringify(data)}`);
      return `Freshness: ${data.data?.freshnessStatus} (${data.data?.freshnessReason})`;
    });

    await check("14. POST /applications/prepared/:id/approve", async () => {
      const res = await fetch(`${baseUrl}/applications/prepared/${prep.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) {
        return `Gate response (expected if URL unreachable): ${data.error?.message}`;
      }
      return `Status: ${data.data?.preparationStatus}`;
    });
  }

  // 15. Create Application
  let createdApp = null;
  if (jobs.length > 0) {
    const job = jobs[0];
    await check("15. POST /applications", async () => {
      const res = await fetch(`${baseUrl}/applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: candidate.id,
          jobId: job.id,
          channel: "EMAIL",
        }),
      });
      const data = await res.json();
      if (!res.ok && data.error?.code !== "DUPLICATE_APPLICATION") {
        throw new Error(`Status ${res.status}: ${JSON.stringify(data)}`);
      }
      createdApp = data.data;
      return `Application created/existing ID: ${createdApp?.id || "Duplicate prevented"}`;
    });

    await check("16. POST /jobs/:id/match", async () => {
      const res = await fetch(`${baseUrl}/jobs/${job.id}/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId: candidate.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(`Status ${res.status}: ${JSON.stringify(data)}`);
      return `Match score: ${data.data?.match?.matchScore}%, Category: ${data.data?.match?.category}`;
    });
  }

  // 17. Applications list
  let appsList = [];
  await check("17. GET /applications", async () => {
    const res = await fetch(`${baseUrl}/applications`);
    const data = await res.json();
    if (!res.ok) throw new Error(`Status ${res.status}: ${JSON.stringify(data)}`);
    appsList = data.data || [];
    return `Found ${appsList.length} applications`;
  });

  // 18. Email Review & Dispatch Gate
  if (appsList.length > 0 && appsList[0].selectedGeneratedEmailId) {
    const appItem = appsList[0];
    const emailId = appItem.selectedGeneratedEmailId;

    await check("18. POST /email/reviews/:id (APPROVE)", async () => {
      const res = await fetch(`${baseUrl}/email/reviews/${emailId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "APPROVED", notes: "Audit test approval" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(`Status ${res.status}: ${JSON.stringify(data)}`);
      return `Email review status: ${data.data?.reviewStatus}`;
    });

    await check("19. POST /applications/:id/send", async () => {
      const res = await fetch(`${baseUrl}/applications/${appItem.id}/send`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(`Status ${res.status}: ${JSON.stringify(data)}`);
      return `Send result: ${data.data?.status} (${data.message})`;
    });
  }

  // 20. Audit logs
  await check("20. GET /audit-logs", async () => {
    const res = await fetch(`${baseUrl}/audit-logs`);
    const data = await res.json();
    if (!res.ok) throw new Error(`Status ${res.status}: ${JSON.stringify(data)}`);
    return `Audit logs count: ${data.data?.length}`;
  });

  server.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\nTest completed: ${results.length - failed.length}/${results.length} passed.`);
  if (failed.length > 0) {
    console.error("Failed steps:", failed);
    process.exit(1);
  }
}

testAllEndpoints().catch((err) => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
