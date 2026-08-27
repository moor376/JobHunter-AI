import EmbeddedPostgres from "embedded-postgres";
import path from "node:path";
import fs from "node:fs";
import net from "node:net";
import { prisma } from "./prisma.js";
import { memoryStore } from "../store/db-store.js";
import { logInfo, logError } from "../utils/logger.js";

let pgInstance: any = null;
let isStarting = false;

/**
 * Fast TCP check to see if PostgreSQL port is open.
 */
export function isPortReachable(port = 5432, host = "127.0.0.1", timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isResolved = false;

    socket.setTimeout(timeoutMs);

    socket.on("connect", () => {
      if (!isResolved) {
        isResolved = true;
        socket.destroy();
        resolve(true);
      }
    });

    socket.on("timeout", () => {
      if (!isResolved) {
        isResolved = true;
        socket.destroy();
        resolve(false);
      }
    });

    socket.on("error", () => {
      if (!isResolved) {
        isResolved = true;
        socket.destroy();
        resolve(false);
      }
    });

    socket.connect(port, host);
  });
}

/**
 * Ensures persistent PostgreSQL is running and available.
 */
export async function ensureDatabaseRunning(): Promise<boolean> {
  // 1. Check if Postgres is already running on port 5432
  const isPortOpen = await isPortReachable(5432, "127.0.0.1", 500);
  if (isPortOpen) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      await seedPostgresIfEmpty();
      return true;
    } catch {
      // Port open but database connection pending
    }
  }

  if (isStarting) {
    // Wait for in-flight startup
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 200));
      if (await isPortReachable(5432, "127.0.0.1", 300)) {
        try {
          await prisma.$queryRaw`SELECT 1`;
          await seedPostgresIfEmpty();
          return true;
        } catch {}
      }
    }
  }

  isStarting = true;

  try {
    const dataDir = path.resolve(process.cwd(), "data/postgres");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    pgInstance = new (EmbeddedPostgres as any)({
      databaseDir: dataDir,
      port: 5432,
      user: "postgres",
      password: "postgres_password",
      persistent: true,
    });

    try {
      await pgInstance.initialise();
    } catch {
      // Already initialized
    }

    await pgInstance.start();

    try {
      await pgInstance.createDatabase("jobhunter_ai");
    } catch {
      // Database already exists
    }

    // Verify connection via Prisma
    await prisma.$queryRaw`SELECT 1`;
    await seedPostgresIfEmpty();

    logInfo({
      event: "postgres_database_ready",
      database: "jobhunter_ai",
      port: 5432,
      persistentDataDir: dataDir,
    });

    return true;
  } catch (err: any) {
    logError({
      event: "postgres_startup_warning",
      message: err?.message || (err ? String(err) : "Failed to start local PostgreSQL instance"),
    });
    return false;
  } finally {
    isStarting = false;
  }
}

/**
 * Seeds PostgreSQL tables with Nayera Tarek Mohamed profile and active job sources.
 */
export async function seedPostgresIfEmpty(): Promise<void> {
  try {
    const candidateCount = await prisma.candidate.count();
    if (candidateCount === 0) {
      for (const c of memoryStore.candidates.values()) {
        await prisma.candidate.upsert({
          where: { id: c.id },
          create: {
            id: c.id,
            email: c.email,
            firstName: c.firstName,
            lastName: c.lastName,
            phone: c.phone,
            location: c.location,
            profileSummary: c.profileSummary,
            targetRoles: c.targetRoles,
            consentStatus: c.consentStatus,
            consentGrantedAt: c.consentGrantedAt,
            isActive: c.isActive,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
          },
          update: {},
        });
      }

      for (const r of memoryStore.resumes.values()) {
        await prisma.resume.upsert({
          where: { id: r.id },
          create: {
            id: r.id,
            candidateId: r.candidateId,
            version: r.version,
            privateStorageKey: r.privateStorageKey,
            checksum: r.checksum,
            originalFilename: r.originalFilename,
            source: r.source as any,
            parseStatus: r.parseStatus as any,
            parsedData: r.parsedData,
            sourceMetadata: r.sourceMetadata,
            parsedAt: r.parsedAt,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
          },
          update: {},
        });
      }

      for (const s of memoryStore.jobSources.values()) {
        await prisma.jobSource.upsert({
          where: { id: s.id },
          create: {
            id: s.id,
            name: s.name,
            type: s.type,
            accessMethod: s.accessMethod,
            externalSourceId: s.externalSourceId,
            baseUrl: s.baseUrl,
            rateLimitPerMinute: s.rateLimitPerMinute,
            healthStatus: s.healthStatus,
            isActive: s.isActive,
            policyMetadata: s.policyMetadata,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
          },
          update: {},
        });
      }
    }
  } catch (err: any) {
    // Non-fatal if seeding is already satisfied
  }
}

/**
 * Stops local PostgreSQL process gracefully.
 */
export async function stopDatabase(): Promise<void> {
  if (pgInstance) {
    try {
      await pgInstance.stop();
      pgInstance = null;
    } catch {}
  }
}
