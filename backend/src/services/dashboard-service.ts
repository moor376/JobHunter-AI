import { prisma } from "../config/prisma.js";
import { isDbConnected, memoryStore } from "../store/db-store.js";
import { listCandidates, listResumes } from "./candidate-service.js";
import { listJobSources } from "./job-source-service.js";
import { listJobs } from "./job-service.js";
import { getRankedJobsForCandidate } from "./ai-matching-service.js";
import { listApplications } from "./application-service.js";
import { listPreparedApplications } from "./application-preparation-service.js";
import { listAuditLogs } from "./audit-service.js";
import { jobPollingWorker } from "./worker/job-polling-worker.js";
import { getAdapterForSource } from "./adapters/adapter-registry.js";
import type { WorkerStatus } from "./worker/types.js";

export interface DashboardSummary {
  worker: WorkerStatus;
  candidate: {
    id: string;
    name: string;
    email: string;
    location: string;
    consentStatus: string;
    resumesCount: number;
    targetRolesCount: number;
  } | null;
  sources: {
    total: number;
    active: number;
    items: Array<{
      id: string;
      name: string;
      type: string;
      externalSourceId?: string | null;
      isActive: boolean;
      healthStatus: string;
      adapterId: string;
      isConfigured: boolean;
    }>;
  };
  jobs: {
    total: number;
    active: number;
    evaluated: number;
    highPriority: number;
    goodMatch: number;
    lowMatch: number;
    rejected: number;
    byCategory: Record<string, number>;
  };
  applications: {
    total: number;
    draft: number;
    pendingApproval: number;
    approved: number;
    sent: number;
    replied: number;
    prepared: number;
    manualActionRequired: number;
    blockedByBot: number;
  };
  workerMetrics: {
    lastRunAt: Date | null;
    nextRunAt: Date | null;
    lastStatus: string;
    lastJobsFetched: number;
    lastJobsDiscovered: number;
    lastDuplicatesSkipped: number;
    lastDuplicatesPrevented: number;
    lastNewJobsCreated: number;
    lastMatchesEvaluated: number;
    lastForeignJobsRejected: number;
    lastQueriesExecuted: number;
    errorsCount: number;
  };
  recentAuditLogs: any[];
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  // 1. Worker status
  const worker = jobPollingWorker.getStatus();

  // 2. Candidate details (Nayera Tarek Mohamed)
  const candidates = await listCandidates();
  const primaryCandidate =
    candidates.find((c) => c.id === "c1000000-0000-0000-0000-000000000001") ||
    candidates[0] ||
    null;

  let candidateSummary: DashboardSummary["candidate"] = null;
  if (primaryCandidate) {
    const resumes = await listResumes(primaryCandidate.id);
    candidateSummary = {
      id: primaryCandidate.id,
      name: `${primaryCandidate.firstName} ${primaryCandidate.lastName}`,
      email: primaryCandidate.email,
      location: primaryCandidate.location || "Cairo, Egypt",
      consentStatus: primaryCandidate.consentStatus,
      resumesCount: resumes.length,
      targetRolesCount: primaryCandidate.targetRoles?.length || 0,
    };
  }

  // 3. Job Sources
  const allSources = await listJobSources();
  const activeSources = allSources.filter((s) => s.isActive);
  const sourceItems = allSources.map((s) => {
    const adapter = getAdapterForSource(s);
    return {
      id: s.id,
      name: s.name,
      type: s.type,
      externalSourceId: s.externalSourceId,
      isActive: s.isActive,
      healthStatus: s.healthStatus,
      adapterId: adapter.id,
      isConfigured: adapter.isConfigured,
    };
  });

  // 4. Jobs & Ranking
  const allJobs = await listJobs();
  let rankedJobs: any[] = [];
  try {
    if (primaryCandidate) {
      rankedJobs = await getRankedJobsForCandidate(primaryCandidate.id);
    }
  } catch {
    // Fallback gracefully
  }

  const byCategory: Record<string, number> = {
    LEGAL: 0,
    COMPLIANCE: 0,
    CONTRACTS: 0,
    BANKING: 0,
    SALES: 0,
    RECRUITMENT: 0,
    HR: 0,
    FINANCE: 0,
  };

  for (const j of allJobs) {
    const cats = (j.categories || []).map((c: string) => c.toUpperCase());
    for (const cat of cats) {
      if (byCategory[cat] !== undefined) {
        byCategory[cat]++;
      }
    }
  }

  let highPriority = 0;
  let goodMatch = 0;
  let lowMatch = 0;
  let rejected = 0;

  for (const r of rankedJobs) {
    if (r.priorityTier === "HIGH_PRIORITY") highPriority++;
    else if (r.priorityTier === "GOOD_MATCH") goodMatch++;
    else if (r.priorityTier === "LOW_MATCH") lowMatch++;
    else if (r.priorityTier === "REJECT") rejected++;
  }

  // 5. Applications & Prepared packages
  const allApps = await listApplications();
  let preparedApps: any[] = [];
  try {
    preparedApps = await listPreparedApplications();
  } catch {
    // Fallback
  }

  let draftCount = 0;
  let pendingCount = 0;
  let approvedCount = 0;
  let sentCount = 0;
  let repliedCount = 0;

  for (const a of allApps) {
    if (a.status === "DRAFT") draftCount++;
    else if (a.status === "PENDING_APPROVAL") pendingCount++;
    else if (a.status === "APPROVED") approvedCount++;
    else if (a.status === "SENT") sentCount++;
    else if (a.status === "REPLIED") repliedCount++;
  }

  let manualActionCount = 0;
  let blockedBotCount = 0;

  for (const p of preparedApps) {
    if (p.requiresManualAction || p.requiresManualFreshnessCheck || p.freshnessStatus === "BLOCKED") {
      manualActionCount++;
    }
    if (p.freshnessStatus === "BLOCKED") {
      blockedBotCount++;
    }
  }

  // 6. Worker metrics
  const lastStats = worker.lastStats;
  const workerMetrics = {
    lastRunAt: worker.lastRunAt,
    nextRunAt: worker.nextRunAt,
    lastStatus: worker.lastStatus || "NEVER_RUN",
    lastJobsFetched: lastStats?.jobsFetched || 0,
    lastJobsDiscovered: lastStats?.jobsDiscovered || 0,
    lastDuplicatesSkipped: lastStats?.duplicatesSkipped || 0,
    lastDuplicatesPrevented: lastStats?.duplicatesPrevented || 0,
    lastNewJobsCreated: lastStats?.newJobsCreated || 0,
    lastMatchesEvaluated: lastStats?.matchesEvaluated || 0,
    lastForeignJobsRejected: lastStats?.foreignJobsRejected || 0,
    lastQueriesExecuted: lastStats?.queriesExecuted || 0,
    errorsCount: lastStats?.errors?.length || 0,
  };

  // 7. Recent Audit Logs
  let recentAuditLogs: any[] = [];
  try {
    recentAuditLogs = (await listAuditLogs()).slice(0, 20);
  } catch {
    // Handled
  }

  return {
    worker,
    candidate: candidateSummary,
    sources: {
      total: allSources.length,
      active: activeSources.length,
      items: sourceItems,
    },
    jobs: {
      total: allJobs.length,
      active: allJobs.filter((j) => j.status === "ACTIVE").length,
      evaluated: rankedJobs.length,
      highPriority,
      goodMatch,
      lowMatch,
      rejected,
      byCategory,
    },
    applications: {
      total: allApps.length,
      draft: draftCount,
      pendingApproval: pendingCount,
      approved: approvedCount,
      sent: sentCount,
      replied: repliedCount,
      prepared: preparedApps.length,
      manualActionRequired: manualActionCount,
      blockedByBot: blockedBotCount,
    },
    workerMetrics,
    recentAuditLogs,
  };
}
