async function verify() {
  console.log("Testing live server endpoints...");
  
  // 1. Root / route
  const rootRes = await fetch("http://localhost:3000/");
  const rootText = await rootRes.text();
  console.log(`GET / : Status ${rootRes.status}, Content-Type: ${rootRes.headers.get("content-type")}, Length: ${rootText.length}`);
  if (rootRes.status === 200 && rootText.includes("JobHunter-AI")) {
    console.log("✓ Root / route serves JobHunter-AI frontend successfully!");
  } else {
    console.error("✕ Root / route failed!");
  }

  // 2. /api/health
  const healthRes = await fetch("http://localhost:3000/api/health");
  const healthJson = await healthRes.json();
  console.log(`GET /api/health : Status ${healthRes.status}, Body: ${JSON.stringify(healthJson)}`);
  if (healthRes.status === 200 && healthJson.data?.service === "jobhunter-ai-backend") {
    console.log("✓ /api/health works correctly!");
  } else {
    console.error("✕ /api/health failed!");
  }

  // 3. /api/candidates
  const candRes = await fetch("http://localhost:3000/api/candidates");
  const candJson = await candRes.json();
  console.log(`GET /api/candidates : Status ${candRes.status}, Candidates found: ${candJson.data?.length}`);
  if (candRes.status === 200 && Array.isArray(candJson.data)) {
    console.log("✓ /api/candidates works correctly!");
  } else {
    console.error("✕ /api/candidates failed!");
  }

  // 4. /api/unknown-route
  const notFoundRes = await fetch("http://localhost:3000/api/unknown-route");
  const notFoundJson = await notFoundRes.json();
  console.log(`GET /api/unknown-route : Status ${notFoundRes.status}, Body: ${JSON.stringify(notFoundJson)}`);
  if (notFoundRes.status === 404 && notFoundJson.error?.code === "NOT_FOUND") {
    console.log("✓ /api/unknown-route returns 404 JSON error as expected!");
  } else {
    console.error("✕ /api/unknown-route failed!");
  }
}

verify().catch(console.error);
