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
    const dbSources = (await prisma.jobSource.findMany({
      orderBy: { createdAt: "desc" },
    })) as JobSourceRecord[];

    const dbSourceIds = new Set(dbSources.map((s) => s.id));
    const memOnlySources = Array.from(memoryStore.jobSources.values()).filter(
      (s) => !dbSourceIds.has(s.id),
    );

    return [...dbSources, ...memOnlySources].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
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

export type UpdateJobSourceInput = Partial<CreateJobSourceInput> & {
  healthStatus?: JobSourceHealthStatus;
  isActive?: boolean;
};

export async function updateJobSource(
  id: string,
  input: UpdateJobSourceInput,
): Promise<JobSourceRecord> {
  const existing = await getJobSourceById(id);
  const now = new Date();

  if (isValidUuid(id) && (await isDbConnected())) {
    const updated = (await prisma.jobSource.update({
      where: { id },
      data: {
        name: input.name !== undefined ? input.name : undefined,
        type: input.type !== undefined ? input.type : undefined,
        accessMethod: input.accessMethod !== undefined ? input.accessMethod : undefined,
        externalSourceId: input.externalSourceId !== undefined ? input.externalSourceId : undefined,
        baseUrl: input.baseUrl !== undefined ? input.baseUrl : undefined,
        rateLimitPerMinute: input.rateLimitPerMinute !== undefined ? input.rateLimitPerMinute : undefined,
        healthStatus: input.healthStatus !== undefined ? input.healthStatus : undefined,
        isActive: input.isActive !== undefined ? input.isActive : undefined,
        policyMetadata: input.policyMetadata !== undefined ? input.policyMetadata : undefined,
        updatedAt: now,
      },
    })) as JobSourceRecord;

    memoryStore.jobSources.set(id, updated);

    await createAuditLog({
      action: "JOB_SOURCE_UPDATED",
      resourceType: "JobSource",
      resourceId: id,
      eventType: "SOURCE_MODIFIED",
      safeMetadata: { sourceName: updated.name, isActive: updated.isActive, healthStatus: updated.healthStatus },
    });

    return updated;
  }

  const updated: JobSourceRecord = {
    ...existing,
    name: input.name !== undefined ? input.name : existing.name,
    type: input.type !== undefined ? input.type : existing.type,
    accessMethod: input.accessMethod !== undefined ? input.accessMethod : existing.accessMethod,
    externalSourceId: input.externalSourceId !== undefined ? input.externalSourceId : existing.externalSourceId,
    baseUrl: input.baseUrl !== undefined ? input.baseUrl : existing.baseUrl,
    rateLimitPerMinute: input.rateLimitPerMinute !== undefined ? input.rateLimitPerMinute : existing.rateLimitPerMinute,
    healthStatus: input.healthStatus !== undefined ? input.healthStatus : existing.healthStatus,
    isActive: input.isActive !== undefined ? input.isActive : existing.isActive,
    policyMetadata: input.policyMetadata !== undefined ? input.policyMetadata : existing.policyMetadata,
    updatedAt: now,
  };

  memoryStore.jobSources.set(id, updated);

  await createAuditLog({
    action: "JOB_SOURCE_UPDATED",
    resourceType: "JobSource",
    resourceId: id,
    eventType: "SOURCE_MODIFIED",
    safeMetadata: { sourceName: updated.name, isActive: updated.isActive, healthStatus: updated.healthStatus },
  });

  return updated;
}

export async function toggleJobSourceActive(id: string, isActive: boolean): Promise<JobSourceRecord> {
  return await updateJobSource(id, { isActive });
}

export async function setAllSourcesActiveStatus(active: boolean, filter?: (s: JobSourceRecord) => boolean): Promise<void> {
  const sources = await listJobSources();
  for (const s of sources) {
    if (!filter || filter(s)) {
      await updateJobSource(s.id, { isActive: active });
    }
  }
}

