export type AutoApprovalPolicy = "MANUAL" | "HIGH_MATCH" | "ALWAYS";

export interface WorkerErrorRecord {
  sourceName?: string;
  sourceId?: string;
  errorCode: string;
  message: string;
  timestamp: Date;
}

export interface WorkerRunStats {
  runId: string;
  triggerSource: "MANUAL" | "SCHEDULED";
  status?: "SUCCESS" | "PARTIAL" | "ERROR";
  applicationMode?: "MANUAL" | "AUTONOMOUS";
  dryRun?: boolean;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  sourcesChecked: number;
  sourcesFailed: number;
  jobsFetched: number;
  jobsDiscovered: number;
  duplicatesSkipped: number;
  duplicatesPrevented?: number;
  duplicateByExternalId?: number;
  duplicateByCanonicalUrl?: number;
  duplicateByContentHash?: number;
  duplicateByNormalizedIdentity?: number;
  foreignJobsRejected?: number;
  queriesExecuted?: number;
  newJobsCreated: number;
  matchesEvaluated: number;
  highPriorityJobs: number;
  goodMatchJobs: number;
  lowMatchJobs: number;
  rejectedJobs: number;
  applicationsCreated: number;
  applicationsPrepared?: number;
  applicationsQueued?: number;
  applicationsSubmitted?: number;
  emailsSent?: number;
  manualActionsRequired?: number;
  blockedByBotProtection?: number;
  failedApplications?: number;
  draftsGenerated: number;
  applicationsApprovedCount: number;
  applicationsSentCount: number;
  errors: WorkerErrorRecord[];
}

export interface WorkerConfiguration {
  isEnabled: boolean;
  intervalMinutes: number;
  matchThreshold: number;
  applicationMode: "MANUAL" | "AUTONOMOUS";
  dryRun: boolean;
  maxConcurrentApplications: number;
  autoApprovalPolicy: AutoApprovalPolicy;
  autoApproveThreshold: number;
  autoSendEnabled: boolean;
  dailySendLimit: number;
  maxBatchSends: number;
}

export interface WorkerStatus extends WorkerConfiguration {
  isRunning: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  lastStats: WorkerRunStats | null;
}
