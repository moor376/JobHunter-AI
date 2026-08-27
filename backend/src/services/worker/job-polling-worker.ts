import { randomUUID } from "node:crypto";
import { loadEnvironment } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import {
  ApplicationChannel,
  ApplicationStatus,
  ApplicationWorkflowStatus,
  DetectedChannel,
  PreparationStatus,
  type JobRecord,
  isDbConnected,
  memoryStore,
} from "../../store/db-store.js";
import { AppError } from "../../utils/app-error.js";
import { evaluateCandidateJobMatch } from "../ai-matching-service.js";
import { evaluateCandidateEligibility } from "../eligibility-service.js";
import { createApplication, listApplications } from "../application-service.js";
import { prepareApplicationForJob } from "../application-preparation-service.js";
import { createAuditLog } from "../audit-service.js";
import { listCandidates, listResumes } from "../candidate-service.js";
import { reviewGeneratedEmail, sendApplicationEmail } from "../email-service.js";
import { ingestJobsFromSource, listJobs } from "../job-service.js";
import { listJobSources } from "../job-source-service.js";
import { discoverDirectEmployer } from "../job-employer-discovery-service.js";
import type {
  AutoApprovalPolicy,
  WorkerConfiguration,
  WorkerErrorRecord,
  WorkerRunStats,
  WorkerStatus,
} from "./types.js";

export class JobPollingWorker {
  private isRunning = false;
  private isEnabled = false;
  private intervalMinutes = 30;
  private matchThreshold = 60;
  private applicationMode: "MANUAL" | "AUTONOMOUS" = "MANUAL";
  private dryRun = true;
  private maxConcurrentApplications = 3;
  private autoApprovalPolicy: AutoApprovalPolicy = "MANUAL";
  private autoApproveThreshold = 75;
  private autoSendEnabled = false;
  private dailySendLimit = 10;
  private maxBatchSends = 5;

  private timer: NodeJS.Timeout | null = null;
  private lastStats: WorkerRunStats | null = null;
  private lastRunAt: Date | null = null;
  private nextRunAt: Date | null = null;

  constructor() {
    this.loadConfiguration();
  }

  private loadConfiguration(): void {
    try {
      const env = loadEnvironment();
      this.isEnabled = env.JOB_WORKER_ENABLED ?? false;
      this.intervalMinutes = env.JOB_WORKER_INTERVAL_MINUTES || 30;
      this.matchThreshold = env.JOB_WORKER_MATCH_THRESHOLD || 60;
      this.applicationMode = env.APPLICATION_MODE || "MANUAL";
      this.dryRun = env.DRY_RUN ?? true;
      this.maxConcurrentApplications = env.MAX_CONCURRENT_APPLICATIONS || 3;
    } catch {
      this.isEnabled = false;
      this.intervalMinutes = 30;
      this.matchThreshold = 60;
      this.applicationMode = "MANUAL";
      this.dryRun = true;
      this.maxConcurrentApplications = 3;
    }
  }

  public start(): void {
    this.stop(); // Clear any existing timer

    if (this.isEnabled) {
      this.scheduleNextRun();
    }
  }

  public stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.nextRunAt = null;
  }

  public enable(): WorkerStatus {
    this.isEnabled = true;
    this.start();
    return this.getStatus();
  }

  public disable(): WorkerStatus {
    this.isEnabled = false;
    this.stop();
    return this.getStatus();
  }

  public configure(config: Partial<WorkerConfiguration>): WorkerStatus {
    if (config.isEnabled !== undefined) this.isEnabled = config.isEnabled;
    if (config.intervalMinutes !== undefined) this.intervalMinutes = Math.max(1, config.intervalMinutes);
    if (config.matchThreshold !== undefined) this.matchThreshold = Math.min(100, Math.max(0, config.matchThreshold));
    if (config.applicationMode !== undefined) this.applicationMode = config.applicationMode;
    if (config.dryRun !== undefined) this.dryRun = config.dryRun;
    if (config.maxConcurrentApplications !== undefined) this.maxConcurrentApplications = Math.max(1, config.maxConcurrentApplications);
    if (config.autoApprovalPolicy !== undefined) this.autoApprovalPolicy = config.autoApprovalPolicy;
    if (config.autoApproveThreshold !== undefined) this.autoApproveThreshold = Math.min(100, Math.max(0, config.autoApproveThreshold));
    if (config.autoSendEnabled !== undefined) this.autoSendEnabled = config.autoSendEnabled;
    if (config.dailySendLimit !== undefined) this.dailySendLimit = Math.max(1, config.dailySendLimit);
    if (config.maxBatchSends !== undefined) this.maxBatchSends = Math.max(1, config.maxBatchSends);

    if (this.isEnabled) {
      this.start();
    } else {
      this.stop();
    }

    return this.getStatus();
  }

  private scheduleNextRun(): void {
    if (!this.isEnabled) return;

    const delayMs = this.intervalMinutes * 60 * 1000;
    this.nextRunAt = new Date(Date.now() + delayMs);

    this.timer = setTimeout(async () => {
      try {
        await this.runOnce("SCHEDULED");
      } catch {
        // Safe catch for background scheduled runs
      } finally {
        this.scheduleNextRun();
      }
    }, delayMs);
  }

  public getStatus(): WorkerStatus {
    return {
      isRunning: this.isRunning,
      isEnabled: this.isEnabled,
      intervalMinutes: this.intervalMinutes,
      matchThreshold: this.matchThreshold,
      applicationMode: this.applicationMode,
      dryRun: this.dryRun,
      maxConcurrentApplications: this.maxConcurrentApplications,
      autoApprovalPolicy: this.autoApprovalPolicy,
      autoApproveThreshold: this.autoApproveThreshold,
      autoSendEnabled: this.autoSendEnabled,
      dailySendLimit: this.dailySendLimit,
      maxBatchSends: this.maxBatchSends,
      lastRunAt: this.lastRunAt,
      nextRunAt: this.nextRunAt,
      lastStats: this.lastStats,
    };
  }

  private isTransientError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    const msg = err.message.toLowerCase();
    return (
      msg.includes("timeout") ||
      msg.includes("network") ||
      msg.includes("econnreset") ||
      msg.includes("502") ||
      msg.includes("503") ||
      msg.includes("504") ||
      msg.includes("rate limit")
    );
  }

  private async executeWithTransientRetry<T>(
    operation: () => Promise<T>,
    maxRetries = 2,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (err: unknown) {
        lastError = err;
        if (!this.isTransientError(err) || attempt === maxRetries) {
          throw err;
        }
        const delayMs = 50 * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw lastError;
  }

  public async runOnce(
    triggerSource: "MANUAL" | "SCHEDULED" = "MANUAL",
    options?: { timeoutMs?: number },
  ): Promise<WorkerRunStats> {
    // 1. Concurrency Protection
    if (this.isRunning) {
      throw new AppError(
        "Autonomous Worker is currently executing another cycle. Concurrent overlapping runs are prevented.",
        409,
        "WORKER_CONCURRENT_RUN_BLOCKED",
      );
    }

    this.isRunning = true;
    const startedAt = new Date();
    const runId = `run_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const errors: WorkerErrorRecord[] = [];

    const stats: WorkerRunStats = {
      runId,
      triggerSource,
      status: "SUCCESS",
      applicationMode: this.applicationMode,
      dryRun: this.dryRun,
      startedAt,
      sourcesChecked: 0,
      sourcesFailed: 0,
      jobsFetched: 0,
      jobsDiscovered: 0,
      duplicatesSkipped: 0,
      duplicatesPrevented: 0,
      newJobsCreated: 0,
      matchesEvaluated: 0,
      highPriorityJobs: 0,
      goodMatchJobs: 0,
      lowMatchJobs: 0,
      rejectedJobs: 0,
      applicationsCreated: 0,
      applicationsPrepared: 0,
      applicationsQueued: 0,
      applicationsSubmitted: 0,
      emailsSent: 0,
      manualActionsRequired: 0,
      blockedByBotProtection: 0,
      failedApplications: 0,
      draftsGenerated: 0,
      applicationsApprovedCount: 0,
      applicationsSentCount: 0,
      errors,
    };

    await createAuditLog({
      action: "WORKER_RUN_STARTED",
      resourceType: "Worker",
      resourceId: runId,
      eventType: "AUTONOMOUS_CYCLE_INITIATED",
      correlationId: runId,
      safeMetadata: {
        triggerSource,
        startedAt: startedAt.toISOString(),
        applicationMode: this.applicationMode,
        dryRun: this.dryRun,
        autoApprovalPolicy: this.autoApprovalPolicy,
        autoSendEnabled: this.autoSendEnabled,
      },
    });

    try {
      // 2. Fetch Active Job Sources & Discover/Ingest Jobs
      const allSources = await listJobSources();
      const activeSources = allSources.filter((s) => s.isActive);
      stats.sourcesChecked = activeSources.length;

      const newJobs: JobRecord[] = [];

      for (const source of activeSources) {
        try {
          const ingestionResult = await this.executeWithTransientRetry(async () => {
            return await ingestJobsFromSource(source.id, options);
          });

          if (ingestionResult.status === "SOURCE_NOT_CONFIGURED") {
            errors.push({
              sourceName: source.name,
              sourceId: source.id,
              errorCode: "SOURCE_NOT_CONFIGURED",
              message: ingestionResult.errorMessage || "Source requires API credentials.",
              timestamp: new Date(),
            });
            continue;
          }

          if (ingestionResult.status !== "SUCCESS") {
            stats.sourcesFailed++;
            errors.push({
              sourceName: source.name,
              sourceId: source.id,
              errorCode: ingestionResult.status,
              message: ingestionResult.errorMessage || "Source ingestion failed.",
              timestamp: new Date(),
            });

            await createAuditLog({
              action: "WORKER_SOURCE_FAILED",
              resourceType: "JobSource",
              resourceId: source.id,
              eventType: "SOURCE_POLL_ERROR",
              correlationId: runId,
              safeMetadata: {
                sourceName: source.name,
                errorCode: ingestionResult.status,
                error: ingestionResult.errorMessage || "Source ingestion failed.",
              },
            });
            continue;
          }

          const rawFetched =
            ingestionResult.rawCount ??
            (ingestionResult.jobs.length + ingestionResult.duplicatesSkipped);

          stats.jobsFetched += rawFetched;
          stats.jobsDiscovered += ingestionResult.jobs.length + ingestionResult.duplicatesSkipped;
          stats.duplicatesSkipped += ingestionResult.duplicatesSkipped;
          stats.newJobsCreated += ingestionResult.ingestedCount;
          newJobs.push(...ingestionResult.jobs);

          await createAuditLog({
            action: "WORKER_SOURCE_PROCESSED",
            resourceType: "JobSource",
            resourceId: source.id,
            eventType: "SOURCE_POLL_SUCCESS",
            correlationId: runId,
            safeMetadata: {
              sourceName: source.name,
              jobsFetched: rawFetched,
              newJobsCount: ingestionResult.ingestedCount,
              duplicatesSkipped: ingestionResult.duplicatesSkipped,
            },
          });
        } catch (err: unknown) {
          stats.sourcesFailed++;
          const errorMessage = err instanceof Error ? err.message : "Unknown ingestion failure";
          const errorCode = err instanceof AppError ? err.code : "SOURCE_INGESTION_FAILED";

          errors.push({
            sourceName: source.name,
            sourceId: source.id,
            errorCode,
            message: errorMessage,
            timestamp: new Date(),
          });

          await createAuditLog({
            action: "WORKER_SOURCE_FAILED",
            resourceType: "JobSource",
            resourceId: source.id,
            eventType: "SOURCE_POLL_ERROR",
            correlationId: runId,
            safeMetadata: {
              sourceName: source.name,
              errorCode,
              error: errorMessage,
            },
          });
        }
      }

      // 3. Match against Registered Candidates & Policy Evaluation
      const candidates = await listCandidates();
      const activeCandidates = candidates.filter((c) => c.isActive && c.consentStatus === "GRANTED");

      const jobsToEvaluate =
        newJobs.length > 0
          ? newJobs
          : (await listJobs({ status: "ACTIVE" as any })).slice(0, 20);

      for (const candidate of activeCandidates) {
        const resumes = await listResumes(candidate.id);
        if (resumes.length === 0) continue;

        for (const job of jobsToEvaluate) {
          try {
            // Quality Gate: Evaluate Eligibility & Priority Tier against Nayera's Verified Profile
            const eligibility = evaluateCandidateEligibility({
              title: job.title,
              description: job.description,
              location: job.location,
              categories: job.categories,
            });

            if (eligibility.priorityTier === "HIGH_PRIORITY") {
              stats.highPriorityJobs++;
            } else if (eligibility.priorityTier === "GOOD_MATCH") {
              stats.goodMatchJobs++;
            } else if (eligibility.priorityTier === "LOW_MATCH") {
              stats.lowMatchJobs++;
            } else if (eligibility.priorityTier === "REJECT") {
              stats.rejectedJobs++;
            }

            // Check duplicate application across stored history
            const existingApps = await listApplications({
              candidateId: candidate.id,
              jobId: job.id,
            });

            if (existingApps.length > 0) {
              stats.duplicatesPrevented = (stats.duplicatesPrevented || 0) + 1;
              continue;
            }

            // AI Matching Engine for Nayera
            const matchEval = await evaluateCandidateJobMatch(candidate.id, job.id);
            stats.matchesEvaluated++;

            // QUALITY GATE: Only process HIGH_PRIORITY or GOOD_MATCH (Eligibility >= 70)
            if (eligibility.isEligibleForApplication && matchEval.match.matchScore >= this.matchThreshold) {
              const application = await createApplication({
                candidateId: candidate.id,
                jobId: job.id,
                channel: ApplicationChannel.EMAIL,
              });

              stats.applicationsCreated++;
              if (application.selectedGeneratedEmailId) {
                stats.draftsGenerated++;
              }

              // Assemble full prepared application record (with direct ATS/employer discovery)
              let prep: any = null;
              try {
                prep = await prepareApplicationForJob(job.id, {
                  candidateId: candidate.id,
                  forceRecreate: true,
                });
                stats.applicationsPrepared = (stats.applicationsPrepared || 0) + 1;
              } catch {
                // Handled gracefully
              }

              // Detect Channel & Evaluate Autonomous Execution Rules
              if (this.applicationMode === "AUTONOMOUS") {
                const channel = prep?.applicationChannel || DetectedChannel.UNKNOWN;

                if (channel === DetectedChannel.EMAIL) {
                  const targetEmail = prep?.originalEmployerUrl?.replace("mailto:", "") || prep?.employerUrl?.replace("mailto:", "");
                  
                  if (targetEmail && targetEmail.includes("@")) {
                    if (this.dryRun) {
                      stats.applicationsQueued = (stats.applicationsQueued || 0) + 1;
                      await createAuditLog({
                        candidateId: candidate.id,
                        action: "WORKER_EMAIL_QUEUED_DRY_RUN",
                        resourceType: "Application",
                        resourceId: application.id,
                        eventType: "AUTONOMOUS_EMAIL_VALIDATED_DRY_RUN",
                        correlationId: runId,
                        safeMetadata: {
                          jobTitle: job.title,
                          recipient: targetEmail,
                          mode: "AUTONOMOUS_DRY_RUN",
                          note: "Grounded email application validated. Zero transmission in DRY_RUN mode.",
                        },
                      });
                    } else if (this.autoSendEnabled && application.selectedGeneratedEmailId) {
                      try {
                        await reviewGeneratedEmail(
                          application.selectedGeneratedEmailId,
                          "APPROVED",
                          "Autonomous Approved for Direct Recruitment Email",
                        );
                        await sendApplicationEmail(application.id);
                        stats.emailsSent = (stats.emailsSent || 0) + 1;
                        stats.applicationsSubmitted = (stats.applicationsSubmitted || 0) + 1;
                      } catch (err: any) {
                        stats.failedApplications = (stats.failedApplications || 0) + 1;
                      }
                    }
                  } else {
                    stats.manualActionsRequired = (stats.manualActionsRequired || 0) + 1;
                  }
                } else if (
                  channel === DetectedChannel.ATS_APPLICATION_PAGE ||
                  channel === DetectedChannel.COMPANY_APPLICATION_PAGE ||
                  channel === DetectedChannel.JOB_BOARD
                ) {
                  // Portal requires human navigation (CAPTCHA, Cloudflare, login restrictions)
                  stats.manualActionsRequired = (stats.manualActionsRequired || 0) + 1;
                  stats.blockedByBotProtection = (stats.blockedByBotProtection || 0) + 1;

                  await createAuditLog({
                    candidateId: candidate.id,
                    action: "WORKER_MANUAL_ACTION_REQUIRED",
                    resourceType: "Application",
                    resourceId: application.id,
                    eventType: "PORTAL_MANUAL_ACTION_FLAGGED",
                    correlationId: runId,
                    safeMetadata: {
                      jobTitle: job.title,
                      channel,
                      reason: "Application page requires interactive user portal login or anti-bot verification.",
                      bypassAttempted: false,
                    },
                  });
                }
              } else {
                // Manual Mode: Retain Human Approval Gate
                if (prep?.requiresManualAction) {
                  stats.manualActionsRequired = (stats.manualActionsRequired || 0) + 1;
                }
              }
            }
          } catch (err: unknown) {
            const matchError = err instanceof Error ? err.message : "Matching error";
            errors.push({
              sourceName: `Job Match: ${job.title}`,
              errorCode: "MATCH_EVALUATION_ERROR",
              message: matchError,
              timestamp: new Date(),
            });
          }
        }
      }
    } finally {
      const completedAt = new Date();
      stats.completedAt = completedAt;
      stats.durationMs = completedAt.getTime() - startedAt.getTime();

      if (stats.sourcesFailed === 0 && errors.length === 0) {
        stats.status = "SUCCESS";
      } else if (stats.jobsFetched > 0) {
        stats.status = "PARTIAL";
      } else {
        stats.status = "ERROR";
      }

      this.lastStats = stats;
      this.lastRunAt = completedAt;
      this.isRunning = false;

      await createAuditLog({
        action: "WORKER_RUN_COMPLETED",
        resourceType: "Worker",
        resourceId: runId,
        eventType: "AUTONOMOUS_CYCLE_FINISHED",
        correlationId: runId,
        safeMetadata: {
          durationMs: stats.durationMs,
          sourcesChecked: stats.sourcesChecked,
          sourcesFailed: stats.sourcesFailed,
          jobsFetched: stats.jobsFetched,
          jobsDiscovered: stats.jobsDiscovered,
          duplicatesSkipped: stats.duplicatesSkipped,
          duplicatesPrevented: stats.duplicatesPrevented || 0,
          newJobsCreated: stats.newJobsCreated,
          matchesEvaluated: stats.matchesEvaluated,
          applicationsCreated: stats.applicationsCreated,
          applicationsPrepared: stats.applicationsPrepared || 0,
          applicationsQueued: stats.applicationsQueued || 0,
          applicationsSubmitted: stats.applicationsSubmitted || 0,
          emailsSent: stats.emailsSent || 0,
          manualActionsRequired: stats.manualActionsRequired || 0,
          blockedByBotProtection: stats.blockedByBotProtection || 0,
          errorsCount: errors.length,
        },
      });
    }

    return stats;
  }
}

export const jobPollingWorker = new JobPollingWorker();
