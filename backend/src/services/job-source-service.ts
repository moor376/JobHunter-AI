import { randomUUID } from "node:crypto";
import { prisma } from "../config/prisma.js";
import {
  JobSourceAccessMethod,
  JobSourceHealthStatus,
  JobSourceType,
  type JobSourceRecord,
  isDbConnected,
  isValidUuid,
  memoryStore,
} from "../store/db-store.js";
import { AppError } from "../utils/app-error.js";
import { createAuditLog } from "./audit-service.js";

export interface CreateJobSourceInput {
  accessMethod: JobSourceAccessMethod;
  baseUrl?: string;
  externalSourceId?: string;
  name: string;
  policyMetadata?: any;
  rateLimitPerMinute?: number;
  type: JobSourceType;
}

export async function listJobSources(): Promise<JobSourceRecord[]> {
  if (await isDbConnected()) {
    return (await prisma.jobSource.findMany({
      orderBy: { createdAt: "desc" },
    })) as JobSourceRecord[];
  }
  return Array.from(memoryStore.jobSources.values()).sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
}

export async function getJobSourceById(id: string): Promise<JobSourceRecord> {
  if (isValidUuid(id) && (await isDbConnected())) {
    const source = await prisma.jobSource.findUnique({ where: { id } });
    if (source) return source as JobSourceRecord;
  }
  const source = memoryStore.jobSources.get(id);
  if (!source) {
    throw new AppError(`Job source with ID ${id} not found.`, 404, "JOB_SOURCE_NOT_FOUND");
  }
  return source;
}

export async function createJobSource(input: CreateJobSourceInput): Promise<JobSourceRecord> {
  const id = randomUUID();
  const now = new Date();

  if (await isDbConnected()) {
    const existing = await prisma.jobSource.findFirst({
      where: { name: { equals: input.name, mode: "insensitive" } },
    });
    if (existing) {
      throw new AppError("A job source with this name already exists.", 409, "DUPLICATE_SOURCE");
    }

    const source = (await prisma.jobSource.create({
      data: {
        id,
        name: input.name,
        type: input.type,
        accessMethod: input.accessMethod,
        externalSourceId: input.externalSourceId || null,
        baseUrl: input.baseUrl || null,
        rateLimitPerMinute: input.rateLimitPerMinute || 60,
        healthStatus: JobSourceHealthStatus.HEALTHY,
        isActive: true,
        policyMetadata: input.policyMetadata || null,
        createdAt: now,
        updatedAt: now,
      },
    })) as JobSourceRecord;

    memoryStore.jobSources.set(id, source);

    await createAuditLog({
      action: "JOB_SOURCE_CREATED",
      resourceType: "JobSource",
      resourceId: id,
      eventType: "SOURCE_REGISTERED",
      safeMetadata: { sourceName: source.name, type: source.type },
    });

    return source;
  }

  const existing = Array.from(memoryStore.jobSources.values()).find(
    (s) => s.name.toLowerCase() === input.name.toLowerCase(),
  );
  if (existing) {
    throw new AppError("A job source with this name already exists.", 409, "DUPLICATE_SOURCE");
  }

  const source: JobSourceRecord = {
    id,
    name: input.name,
    type: input.type,
    accessMethod: input.accessMethod,
    externalSourceId: input.externalSourceId || null,
    baseUrl: input.baseUrl || null,
    rateLimitPerMinute: input.rateLimitPerMinute || 60,
    healthStatus: JobSourceHealthStatus.HEALTHY,
    isActive: true,
    policyMetadata: input.policyMetadata || null,
    createdAt: now,
    updatedAt: now,
  };

  memoryStore.jobSources.set(id, source);

  await createAuditLog({
    action: "JOB_SOURCE_CREATED",
    resourceType: "JobSource",
    resourceId: id,
    eventType: "SOURCE_REGISTERED",
    safeMetadata: { sourceName: source.name, type: source.type },
  });

  return source;
}

