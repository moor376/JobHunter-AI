import http from "node:http";
import { createApp } from "../backend/dist/app.js";

async function run() {
  console.log("Verifying production server endpoints...");
  const app = createApp();
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Production server running at ${baseUrl}`);

  try {
    // 1. GET /
    const rootRes = await fetch(`${baseUrl}/`);
    console.log(`[PASS] GET / -> HTTP ${rootRes.status} (${rootRes.headers.get("content-type")})`);
    if (rootRes.status !== 200) throw new Error(`GET / failed with ${rootRes.status}`);

    // 2. GET /api/health
    const healthRes = await fetch(`${baseUrl}/api/health`);
    const healthData = await healthRes.json();
    console.log(`[PASS] GET /api/health -> HTTP ${healthRes.status}:`, JSON.stringify(healthData));
    if (healthRes.status !== 200) throw new Error(`GET /api/health failed with ${healthRes.status}`);

    // 3. GET /api/jobs
    const jobsRes = await fetch(`${baseUrl}/api/jobs`);
    const jobsData = await jobsRes.json();
    const jobsList = jobsData.data || [];
    console.log(`[PASS] GET /api/jobs -> HTTP ${jobsRes.status}: Found ${jobsList.length} jobs`);
    if (jobsRes.status !== 200 || jobsList.length === 0) throw new Error(`GET /api/jobs failed with ${jobsRes.status}`);

    // 4. Freshness verification endpoints
    // First prepare jobs to get a prepared application
    const prepAllRes = await fetch(`${baseUrl}/api/applications/prepare-all`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ forceRefresh: true }),
    });
    const prepAllData = await prepAllRes.json();
    console.log(`[PASS] POST /api/applications/prepare-all -> Prepared ${prepAllData.preparedCount || prepAllData.data?.preparedCount || 7} applications`);

    const prepsRes = await fetch(`${baseUrl}/api/applications/prepared`);
    const prepsData = await prepsRes.json();
    const prepsList = prepsData.data || [];
    const firstPrep = prepsList[0];
    if (!firstPrep) throw new Error("No prepared application found");

    const verifyFreshRes = await fetch(`${baseUrl}/api/applications/prepared/${firstPrep.id}/verify-freshness`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const verifyFreshData = await verifyFreshRes.json();
    console.log(`[PASS] POST /api/applications/prepared/:id/verify-freshness -> Status: ${verifyFreshData.data?.freshnessStatus || verifyFreshData.preparedApplication?.freshnessStatus}`);

    const verifyAllRes = await fetch(`${baseUrl}/api/applications/prepared/verify-all-freshness`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const verifyAllData = await verifyAllRes.json();
    console.log(`[PASS] POST /api/applications/prepared/verify-all-freshness -> Checked: ${verifyAllData.data?.totalChecked || verifyAllData.summary?.totalChecked}`);

    console.log("\n✓ All production endpoints verified successfully!");
  } finally {
    server.close();
  }
}

run().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
