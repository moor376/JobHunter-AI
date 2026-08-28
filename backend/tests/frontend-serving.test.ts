import { describe, it, expect, afterEach } from "vitest";
import { createApp } from "../src/app.js";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

describe("Unified Frontend Serving & Production Routing Suite", () => {
  let server: Server | null = null;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = null;
    }
  });

  async function startApp(): Promise<string> {
    const app = createApp();
    server = createServer(app);

    await new Promise<void>((resolve) => {
      server!.listen(0, "127.0.0.1", resolve);
    });

    const addr = server.address() as AddressInfo;
    return `http://127.0.0.1:${addr.port}`;
  }

  it("serves the JobHunter-AI frontend HTML at the root / route", async () => {
    const baseUrl = await startApp();
    const response = await fetch(`${baseUrl}/`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("JobHunter-AI");
    expect(html).toContain("<!DOCTYPE html>");
  });

  it("serves index.html for non-API client routes to support SPA navigation", async () => {
    const baseUrl = await startApp();
    const response = await fetch(`${baseUrl}/dashboard`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("JobHunter-AI");
  });

  it("preserves /api/health and all backend API endpoints", async () => {
    const baseUrl = await startApp();
    const response = await fetch(`${baseUrl}/api/health`);
    const json = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(json.data.service).toBe("jobhunter-ai-backend");
    expect(json.data.status).toBeDefined();
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });

  it("returns JSON 404 for unknown /api/* routes instead of serving HTML", async () => {
    const baseUrl = await startApp();
    const response = await fetch(`${baseUrl}/api/nonexistent-route`);
    const json = (await response.json()) as any;

    expect(response.status).toBe(404);
    expect(json.error.code).toBe("NOT_FOUND");
    expect(json.error.message).toBe("Route not found.");
  });
});
