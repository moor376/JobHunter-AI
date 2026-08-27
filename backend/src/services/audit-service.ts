import { randomUUID } from "node:crypto";
import { prisma } from "../config/prisma.js";
import {
  AuditActorType,
  type AuditLogRecord,
  isDbConnected,
  memoryStore,
} from "../store/db-store.js";

export interface CreateAuditLogInput {
  candidateId?: string | null;
  actorType?: AuditActorType;
  actorId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  eventType: string;
  correlationId?: string;
  safeMetadata?: any;
  beforeSummary?: any;
  afterSummary?: any;
}

export async function createAuditLog(input: CreateAuditLogInput): Promise<AuditLogRecord> {
  const id = randomUUID();
  const now = new Date();
  const log: AuditLogRecord = {
    id,
    candidateId: input.candidateId || null,
    actorType: input.actorType || AuditActorType.SYSTEM,
    actorId: input.actorId || "system",
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId || null,
    eventType: input.eventType,
    correlationId: input.correlationId || randomUUID(),
    safeMetadata: input.safeMetadata || null,
    beforeSummary: input.beforeSummary || null,
    afterSummary: input.afterSummary || null,
    occurredAt: now,
    createdAt: now,
  };

  if (await isDbConnected()) {
    try {
      await prisma.auditLog.create({
        data: {
          id: log.id,
          candidateId: log.candidateId,
          actorType: log.actorType,
          actorId: log.actorId,
          action: log.action,
          resourceType: log.resourceType,
          resourceId: log.resourceId,
          eventType: log.eventType,
          correlationId: log.correlationId,
          safeMetadata: log.safeMetadata,
          beforeSummary: log.beforeSummary,
          afterSummary: log.afterSummary,
          occurredAt: log.occurredAt,
          createdAt: log.createdAt,
        },
      });
    } catch {
      // Safe fallback
    }
  }

  memoryStore.auditLogs.set(id, log);
  return log;
}

export async function listAuditLogs(candidateId?: string): Promise<AuditLogRecord[]> {
  if (await isDbConnected()) {
    return (await prisma.auditLog.findMany({
      where: candidateId ? { candidateId } : undefined,
      orderBy: { occurredAt: "desc" },
    })) as AuditLogRecord[];
  }
  const logs = Array.from(memoryStore.auditLogs.values());
  if (candidateId) {
    return logs
      .filter((l) => l.candidateId === candidateId)
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  }
  return logs.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
}

