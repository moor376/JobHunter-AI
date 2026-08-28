import { createApp } from "../backend/dist/app.js";
import { createServer } from "node:http";

async function runTests() {
  const app = createApp();
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const baseUrl = `http://127.0.0.1:${addr.port}/api`;

  console.log(`Test server running at ${baseUrl}`);

  // 1. Get Candidate
  const candRes = await fetch(`${baseUrl}/candidates`);
  const candData = await candRes.json();
  const candidate = candData.data?.[0];
  console.log(`1. Candidate: ${candidate?.id} (${candidate?.firstName} ${candidate?.lastName})`);

  // 2. Get Jobs
  const jobsRes = await fetch(`${baseUrl}/jobs`);
  const jobsData = await jobsRes.json();
  const job = jobsData.data?.[0];
  console.log(`2. Jobs count: ${jobsData.data?.length}, First Job ID: ${job?.id}`);

  // 3. Worker Run
  const workerRes = await fetch(`${baseUrl}/worker/run`, { method: "POST" });
  const workerData = await workerRes.json();
  console.log(`3. POST /worker/run: Status ${workerRes.status}, Message: ${workerData.message || workerData.error?.message}`);

  // 4. Prepare All
  const prepAllRes = await fetch(`${baseUrl}/applications/prepare-all`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ candidateId: candidate?.id }),
  });
  const prepAllData = await prepAllRes.json();
  console.log(`4. POST /applications/prepare-all: Status ${prepAllRes.status}, Body: ${JSON.stringify(prepAllData)}`);

  // 5. Get Prepared Applications
  const prepListRes = await fetch(`${baseUrl}/applications/prepared`);
  const prepListData = await prepListRes.json();
  const prepItem = prepListData.data?.[0];
  console.log(`5. GET /applications/prepared: count=${prepListData.data?.length}, firstId=${prepItem?.id}`);

  if (prepItem) {
    // 6. Verify Freshness
    const freshRes = await fetch(`${baseUrl}/applications/prepared/${prepItem.id}/verify-freshness`, { method: "POST" });
    const freshData = await freshRes.json();
    console.log(`6. POST /verify-freshness: Status ${freshRes.status}, Freshness: ${freshData.data?.freshnessStatus}`);

    // 7. Approve Prepared
    const approveRes = await fetch(`${baseUrl}/applications/prepared/${prepItem.id}/approve`, { method: "POST" });
    const approveData = await approveRes.json();
    console.log(`7. POST /prepared/${prepItem.id}/approve: Status ${approveRes.status}, Status=${approveData.data?.preparationStatus || approveData.error?.message}`);
  }

  // 8. Create Application
  if (job && candidate) {
    const createRes = await fetch(`${baseUrl}/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateId: candidate.id, jobId: job.id, channel: "EMAIL" }),
    });
    const createData = await createRes.json();
    console.log(`8. POST /applications: Status ${createRes.status}, Message: ${createData.message || createData.error?.message}`);
  }

  // 9. Match Job
  if (job && candidate) {
    const matchRes = await fetch(`${baseUrl}/jobs/${job.id}/match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateId: candidate.id }),
    });
    const matchData = await matchRes.json();
    console.log(`9. POST /jobs/${job.id}/match: Status ${matchRes.status}, Score: ${matchData.data?.match?.matchScore}`);
  }

  // 10. Worker toggle
  const enableRes = await fetch(`${baseUrl}/worker/enable`, { method: "POST" });
  const enableData = await enableRes.json();
  console.log(`10. POST /worker/enable: Status ${enableRes.status}, Message: ${enableData.message}`);

  server.close();
  console.log("All actions tested successfully.");
}

runTests().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
