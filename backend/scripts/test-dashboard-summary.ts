import { createApp } from "../src/app.js";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

async function main() {
  const app = createApp();
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  const res = await fetch(`http://127.0.0.1:${addr.port}/api/dashboard/summary`);
  const json = await res.json();
  console.log("HTTP Status:", res.status);
  console.log("Dashboard Summary Result:");
  console.log(JSON.stringify(json, null, 2));

  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
