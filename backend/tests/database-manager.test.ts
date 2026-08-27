import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ensureDatabaseRunning, seedPostgresIfEmpty } from "../src/config/database-manager.js";
import { prisma } from "../src/config/prisma.js";
import { isDbConnected, setDbConnected, resetDbConnectedCache } from "../src/store/db-store.js";
import { createApp } from "../src/app.js";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

describe("Production PostgreSQL Database Manager & Health Suite", () => {
  const originalEnv = process.env.DATABASE_URL;

  beforeEach(() => {
    resetDbConnectedCache();
  });

  afterEach(() => {
    process.env.DATABASE_URL = originalEnv;
    vi.restoreAllMocks();
  });

  it("exclusively tests external PostgreSQL and returns true when DATABASE_URL is valid", async () => {
    process.env.DATABASE_URL = "postgresql://postgres:postgres_password@localhost:5432/jobhunter_ai?schema=public";

    // Mock queryRaw to simulate successful SELECT 1
    const querySpy = vi.spyOn(prisma, "$queryRaw").mockResolvedValue([{ ok: 1 }] as any);
    const candidateCountSpy = vi.spyOn(prisma.candidate, "count").mockResolvedValue(1 as any);

    const result = await ensureDatabaseRunning();

    expect(result).toBe(true);
    expect(querySpy).toHaveBeenCalled();
    expect(await isDbConnected()).toBe(true);
  });

  it("returns false and NEVER attempts embedded-postgres when DATABASE_URL connection fails", async () => {
    process.env.DATABASE_URL = "postgresql://postgres:bad_password@unreachable-host:5432/jobhunter_ai";

    const querySpy = vi.spyOn(prisma, "$queryRaw").mockRejectedValue(new Error("Connection refused to unreachable-host:5432"));

    const result = await ensureDatabaseRunning();

    expect(result).toBe(false);
    expect(querySpy).toHaveBeenCalled();
    expect(await isDbConnected()).toBe(false);
  });

  it("accurately reports connected status in /api/health when database is reachable", async () => {
    vi.spyOn(prisma, "$queryRaw").mockResolvedValue([{ ok: 1 }] as any);
    setDbConnected(true);

    const app = createApp();
    const server = createServer(app);

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });

    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
    const payload = (await response.json()) as any;

    server.close();

    expect(response.status).toBe(200);
    expect(payload.data.database).toBe("connected");
    expect(payload.data.status).toBe("ok");
  });

  it("accurately reports disconnected status in /api/health when database fails in production", async () => {
    const oldNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    vi.spyOn(prisma, "$queryRaw").mockRejectedValue(new Error("Database disconnected"));
    setDbConnected(false);

    const app = createApp();
    const server = createServer(app);

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });

    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
    const payload = (await response.json()) as any;

    server.close();
    process.env.NODE_ENV = oldNodeEnv;

    expect(response.status).toBe(200);
    expect(payload.data.database).toBe("disconnected");
    expect(payload.data.status).toBe("degraded");
  });

  it("preserves idempotent seeding logic without re-seeding if candidate exists", async () => {
    const countSpy = vi.spyOn(prisma.candidate, "count").mockResolvedValue(5 as any);
    const upsertSpy = vi.spyOn(prisma.candidate, "upsert");

    await seedPostgresIfEmpty();

    expect(countSpy).toHaveBeenCalled();
    expect(upsertSpy).not.toHaveBeenCalled();
  });
});
