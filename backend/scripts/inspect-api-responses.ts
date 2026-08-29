import { createApp } from "../src/app.js";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

async function main() {
  const app = createApp();
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  console.log("=== TESTING BACKEND API ENDPOINTS ===");

  const endpoints = [
    "/api/health",
    "/api/worker/status",
    "/api/job-sources",
    "/api/jobs",
    "/api/jobs/ranked",
    "/api/applications",
    "/api/applications/prepared",
    "/api/audit-logs",
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(`${baseUrl}${ep}`);
      const json = await res.json();
      console.log(`\n--- ${ep} [HTTP ${res.status}] ---`);
      if (Array.isArray(json.data)) {
        console.log(`Count: ${json.data.length}`);
        if (json.data.length > 0) {
          console.log("First item:", JSON.stringify(json.data[0]).slice(0, 120) + "...");
        }
      } else {
        console.log("Data:", JSON.stringify(json.data, null, 2));
      }
    } catch (err: any) {
      console.error(`Error on ${ep}:`, err.message);
    }
  }

  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  process.exit(0);
}

main().catch(console.error);
