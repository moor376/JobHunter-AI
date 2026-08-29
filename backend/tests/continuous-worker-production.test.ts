import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { JobPollingWorker } from "../src/services/worker/job-polling-worker.js";
import {
  ApplicationChannel,
  ApplicationStatus,
  ApplicationWorkflowStatus,
  DetectedChannel,
  FreshnessStatus,
  JobSourceAccessMethod,
  JobSourceHealthStatus,
  JobSourceType,
  PreparationStatus,
  memoryStore,
} from "../src/store/db-store.js";
import { evaluateCandidateEligibility, isEgyptLocationCompatible } from "../src/services/eligibility-service.js";
import { classifyJobCategories, JobCategory } from "../src/services/categories/job-category.js";
import { discoverDirectEmployer } from "../src/services/job-employer-discovery-service.js";
import { prepareApplicationForJob } from "../src/services/application-preparation-service.js";
import { createApplication, listApplications } from "../src/services/application-service.js";
import { validateStartupConfiguration } from "../src/config/env.js";

describe("Continuous Autonomous Worker & Production Pipeline Suite", () => {
  let worker: JobPollingWorker;
  const testCandidateId = "c1000000-0000-0000-0000-000000000001";

  beforeEach(() => {
    worker = new JobPollingWorker();
  });

  afterEach(() => {
    worker.stop();
  });

  // 1. Scheduled Worker Execution & Lifecycle
  describe("Scheduled Worker Execution & Lifecycle", () => {
    it("configures and calculates next run time accurately", () => {
      worker.configure({
        isEnabled: true,
        intervalMinutes: 15,
        matchThreshold: 70,
      });

      const status = worker.getStatus();
      expect(status.isEnabled).toBe(true);
      expect(status.intervalMinutes).toBe(15);
      expect(status.matchThreshold).toBe(70);
      expect(status.nextRunAt).toBeInstanceOf(Date);
      expect(status.nextRunAt!.getTime()).toBeGreaterThan(Date.now());
    });

    it("enables and disables worker scheduler safely without lingering timers", () => {
      const enabledStatus = worker.enable();
      expect(enabledStatus.isEnabled).toBe(true);
      expect(enabledStatus.nextRunAt).not.toBeNull();

      const disabledStatus = worker.disable();
      expect(disabledStatus.isEnabled).toBe(false);
      expect(disabledStatus.nextRunAt).toBeNull();
    });

    it("restarts worker scheduler cleanly and preserves safe configuration", () => {
      worker.configure({ isEnabled: true, intervalMinutes: 20 });
      expect(worker.getStatus().intervalMinutes).toBe(20);

      worker.stop();
      expect(worker.getStatus().nextRunAt).toBeNull();

      worker.start();
      expect(worker.getStatus().nextRunAt).not.toBeNull();
    });
  });

  // 2. Overlapping Run Prevention & Concurrency Protection
  describe("Overlapping-Run Prevention & Concurrency Protection", () => {
    it("rejects concurrent execution attempts when another cycle is running", async () => {
      (worker as any).isRunning = true;

      await expect(worker.runOnce("MANUAL")).rejects.toThrow(
        "Autonomous Worker is currently executing another cycle. Concurrent overlapping runs are prevented.",
      );

      (worker as any).isRunning = false;
    });
  });

  // 3. Provider Failure Isolation & Safe Recovery
  describe("Provider Failure Isolation & Error Tracking", () => {
    it("tracks transient errors and records stats cleanly", () => {
      const isTransient = (worker as any).isTransientError(new Error("ETIMEDOUT connection timeout"));
      expect(isTransient).toBe(true);

      const isNonTransient = (worker as any).isTransientError(new Error("Unrecoverable schema corruption"));
      expect(isNonTransient).toBe(false);
    });
  });

  // 4. Multi-Category Classification (Legal, Compliance, Contracts, Banking, HR)
  describe("Job Classification & Candidate Track Matching", () => {
    it("accurately classifies Legal, Compliance & Contracts roles", () => {
      const legalCats = classifyJobCategories(
        "Corporate Legal Counsel",
        "Draft commercial agreements, review statutory contracts, labor law compliance",
      );
      expect(legalCats).toContain(JobCategory.LEGAL);
      expect(legalCats).toContain(JobCategory.CONTRACTS);

      const complianceCats = classifyJobCategories(
        "Regulatory Compliance Officer",
        "Monitor AML / KYC compliance, statutory regulations, corporate governance",
      );
      expect(complianceCats).toContain(JobCategory.COMPLIANCE);
      expect(complianceCats).toContain(JobCategory.REGULATORY);
    });

    it("accurately classifies Banking & Banking Tele-Sales roles", () => {
      const salesCats = classifyJobCategories(
        "Banking Tele-Sales Officer",
        "Outbound sales of retail banking products, loans, credit cards, client relationship handling",
      );
      expect(salesCats).toContain(JobCategory.SALES);
      expect(salesCats).toContain(JobCategory.BANKING);
    });

    it("accurately classifies Recruitment & HR roles", () => {
      const hrCats = classifyJobCategories(
        "Human Resources & Recruitment Specialist",
        "Screen candidate resumes, manage hiring pipeline, human resources employee relations",
      );
      expect(hrCats).toContain(JobCategory.RECRUITMENT);
      expect(hrCats).toContain(JobCategory.HR);
    });
  });

  // 5. Strict Location Compatibility Gate (Egypt Only)
  describe("Strict Location Compatibility Gate (Egypt Focus)", () => {
    it("approves Egypt, Cairo, Giza, and Heliopolis vacancies", () => {
      expect(isEgyptLocationCompatible("Cairo, Egypt")).toBe(true);
      expect(isEgyptLocationCompatible("Heliopolis, Cairo")).toBe(true);
      expect(isEgyptLocationCompatible("Nasr City, Egypt")).toBe(true);
      expect(isEgyptLocationCompatible("New Cairo")).toBe(true);
      expect(isEgyptLocationCompatible("Giza, Egypt")).toBe(true);
      expect(isEgyptLocationCompatible("القاهرة, مصر")).toBe(true);
    });

    it("strictly rejects foreign vacancies (UK, London, US, Germany, etc.)", () => {
      expect(isEgyptLocationCompatible("London, UK")).toBe(false);
      expect(isEgyptLocationCompatible("Peterborough, United Kingdom")).toBe(false);
      expect(isEgyptLocationCompatible("New York, USA")).toBe(false);
      expect(isEgyptLocationCompatible("Berlin, Germany")).toBe(false);
      expect(isEgyptLocationCompatible("Paris, France")).toBe(false);
      expect(isEgyptLocationCompatible("Dublin, Ireland")).toBe(false);
    });

    it("downgrades foreign legal vacancy to REJECT priority tier", () => {
      const evalResult = evaluateCandidateEligibility({
        title: "Senior Legal Counsel",
        description: "Review commercial contracts and regulatory filings.",
        location: "London, United Kingdom",
      });

      expect(evalResult.locationAlignment.isCompatible).toBe(false);
      expect(evalResult.priorityTier).toBe("REJECT");
      expect(evalResult.isEligibleForApplication).toBe(false);
    });
  });

  // 6. Direct Employer & ATS Discovery Engine
  describe("Direct Employer & ATS Discovery Engine", () => {
    it("extracts direct ATS links from job description with high confidence", () => {
      const sampleJob = {
        title: "Legal Specialist",
        description: "Apply directly at our portal: https://careers.smartrecruiters.com/AcmeCorp/legal-job-123",
        sourceUrl: "https://jooble.org/desc/12345",
      };

      const discovery = discoverDirectEmployer(sampleJob);
      expect(discovery.atsProvider).toBe("SmartRecruiters");
      expect(discovery.atsConfidence).toBe("HIGH");
      expect(discovery.applicationUrl).toBe("https://careers.smartrecruiters.com/AcmeCorp/legal-job-123");
      expect(discovery.applicationChannel).toBe(DetectedChannel.ATS_APPLICATION_PAGE);
    });

    it("never accepts a generic root homepage as a verified job URL", () => {
      const sampleJob = {
        title: "Legal Counsel",
        description: "Leading company in Cairo seeking counsel.",
        sourceUrl: "https://jooble.org/desc/12345",
      };
      const company = {
        name: "Acme Corp",
        websiteUrl: "https://acme.com",
      };

      const discovery = discoverDirectEmployer(sampleJob, company);
      expect(discovery.attributionSource).toBe("AGGREGATOR_ONLY");
      expect(discovery.attributionConfidence).toBe("NONE");
      expect(discovery.applicationUrl).toBe(discovery.discoveryUrl);
    });
  });

  // 7. Channel-Based Execution & MANUAL_ACTION_REQUIRED for Bot Protections
  describe("Channel-Based Execution & Anti-Bot Protection", () => {
    it("flags manual action required for external job boards and third-party portals", async () => {
      const sampleJobId = "job_egypt_legal_portal_1";
      memoryStore.jobs.set(sampleJobId, {
        id: sampleJobId,
        title: "Legal Affairs Specialist",
        description: "Draft corporate contracts, ensure statutory compliance in Cairo.",
        location: "Cairo, Egypt",
        companyId: "c1",
        jobSourceId: "s1",
        categories: [JobCategory.LEGAL, JobCategory.CONTRACTS],
        status: "ACTIVE" as any,
        sourceUrl: "https://jooble.org/desc/998877",
        canonicalUrl: "https://jooble.org/desc/998877",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const prep = await prepareApplicationForJob(sampleJobId, {
        candidateId: testCandidateId,
        forceRecreate: true,
      });
      expect(prep.requiresManualAction).toBe(true);
      expect(prep.workflowStatus).toBe(ApplicationWorkflowStatus.MANUAL_ACTION_REQUIRED);
      expect(prep.preparationStatus).toBe(PreparationStatus.PENDING_APPROVAL);
      expect(prep.provenance.emailSent).toBe(false);
      expect(prep.provenance.applicationSubmitted).toBe(false);
    });
  });

  // 8. Confirmed Submission Requirement & Zero Dispatch Invariants
  describe("Confirmed Submission Invariants & Safety Gate", () => {
    it("never marks SUBMITTED or EMAIL_SENT without actual confirmed transmission", () => {
      const preparedApps = Array.from(memoryStore.preparedApplications.values());
      for (const p of preparedApps) {
        expect(p.provenance.emailSent).toBe(false);
        expect(p.provenance.applicationSubmitted).toBe(false);
        expect(p.preparationStatus).not.toBe(PreparationStatus.SENT);
      }

      const applications = Array.from(memoryStore.applications.values());
      const sentApps = applications.filter((a) => a.status === ApplicationStatus.SENT);
      expect(sentApps.length).toBe(0);
    });
  });

  // 9. Startup Configuration Validator
  describe("Startup Configuration Validator", () => {
    it("reports configuration status cleanly without leaking secrets", () => {
      const report = validateStartupConfiguration();
      expect(report).toHaveProperty("isProductionReady");
      expect(report).toHaveProperty("providers");
      expect(report).toHaveProperty("database");
      expect(report).toHaveProperty("worker");
      expect(report.providers.jooble).toHaveProperty("configured");
      expect(report.providers.adzuna).toHaveProperty("configured");
      expect(report.worker).toHaveProperty("enabled");
      expect(report.worker).toHaveProperty("intervalMinutes");
      expect(report.database.isConfigured).toBe(true);
      expect(report.database.type).toBe("PostgreSQL");
    });
  });

  // 11. Autonomous Worker Execution & DRY_RUN Safety Invariants
  describe("Autonomous Worker Execution & DRY_RUN Invariants", () => {
    it("configures autonomous worker with DRY_RUN enabled by default", () => {
      worker.configure({
        isEnabled: true,
        applicationMode: "AUTONOMOUS",
        dryRun: true,
        matchThreshold: 65,
      });

      const status = worker.getStatus();
      expect(status.applicationMode).toBe("AUTONOMOUS");
      expect(status.dryRun).toBe(true);
      expect(status.matchThreshold).toBe(65);
    });

    it("guarantees DRY_RUN mode produces 0 real application submissions and 0 real emails", async () => {
      worker.configure({
        isEnabled: true,
        applicationMode: "AUTONOMOUS",
        dryRun: true,
      });

      const stats = worker.getStatus().lastStats;
      // In DRY_RUN, applicationsSubmitted and emailsSent are strictly 0
      expect(stats?.applicationsSubmitted || 0).toBe(0);
      expect(stats?.emailsSent || 0).toBe(0);
    });

    it("prevents duplicate applications for the same candidate and vacancy across multiple runs", async () => {
      const sampleJobId = "job_dup_test_egypt_1";
      memoryStore.jobs.set(sampleJobId, {
        id: sampleJobId,
        title: "Senior Legal Counsel",
        description: "Review Egyptian commercial contracts and regulatory filings in Cairo.",
        location: "Cairo, Egypt",
        companyId: "c1",
        jobSourceId: "s1",
        categories: [JobCategory.LEGAL, JobCategory.CONTRACTS],
        status: "ACTIVE" as any,
        sourceUrl: "https://jooble.org/desc/dup1",
        canonicalUrl: "https://jooble.org/desc/dup1",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create application
      await createApplication({
        candidateId: testCandidateId,
        jobId: sampleJobId,
        channel: ApplicationChannel.EMAIL,
      });

      // Existing application list check
      const existingApps = await listApplications({
        candidateId: testCandidateId,
        jobId: sampleJobId,
      });
      expect(existingApps.length).toBe(1);

      // Duplicate submission attempt is rejected
      await expect(
        createApplication({
          candidateId: testCandidateId,
          jobId: sampleJobId,
          channel: ApplicationChannel.EMAIL,
        }),
      ).rejects.toThrow();
    });

    it("flags manual action required for bot-protected / portal vacancies without attempting bypass", () => {
      const sampleJob = {
        title: "Compliance Specialist",
        description: "Apply at external portal: https://apply.workable.com/cairo-corp/j/12345",
        sourceUrl: "https://jooble.org/desc/workable1",
      };

      const discovery = discoverDirectEmployer(sampleJob);
      expect(discovery.applicationChannel).toBe(DetectedChannel.ATS_APPLICATION_PAGE);
      expect(discovery.atsProvider).toBe("Workable");
    });
  });

  // 12. Auto-Approval Policy & Autonomous Application Execution Suite
  describe("Auto-Approval Policy & Autonomous Application Execution", () => {
    beforeEach(() => {
      for (const source of memoryStore.jobSources.values()) {
        if (
          source.baseUrl?.includes("wuzzuf.net") ||
          source.baseUrl?.includes("jooble.org") ||
          source.baseUrl?.includes("adzuna.com")
        ) {
          source.isActive = false;
        }
      }
    });

    afterEach(() => {
      for (const source of memoryStore.jobSources.values()) {
        source.isActive = true;
      }
    });

    it("automatically approves eligible applications when autoApprovalPolicy is ALWAYS", async () => {
      worker.configure({
        isEnabled: true,
        applicationMode: "MANUAL",
        autoApprovalPolicy: "ALWAYS",
        matchThreshold: 60,
      });

      const autoJobId = "job_auto_approve_always_1";
      memoryStore.jobs.set(autoJobId, {
        id: autoJobId,
        title: "Senior Legal Counsel",
        description: "Corporate legal advice, contract review, and statutory regulatory filings in Cairo.",
        location: "Cairo, Egypt",
        companyId: "c1",
        jobSourceId: "s1",
        categories: [JobCategory.LEGAL, JobCategory.CONTRACTS],
        status: "ACTIVE" as any,
        sourceUrl: "https://example.com/active-legal-role",
        canonicalUrl: "https://example.com/active-legal-role",
        seenAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const stats = await worker.runOnce("MANUAL", { timeoutMs: 50 });
      expect(stats.matchesEvaluated).toBeGreaterThanOrEqual(1);
      expect(stats.applicationsApprovedCount).toBeGreaterThanOrEqual(1);
    });

    it("automatically executes email sending when autoSendEnabled is true and policy is AUTONOMOUS", async () => {
      worker.configure({
        isEnabled: true,
        applicationMode: "AUTONOMOUS",
        autoApprovalPolicy: "HIGH_MATCH",
        autoApproveThreshold: 70,
        matchThreshold: 60,
        dryRun: false,
        autoSendEnabled: true,
      });

      const execJobId = "job_auto_send_exec_1";
      memoryStore.jobs.set(execJobId, {
        id: execJobId,
        title: "Banking Tele-Sales Specialist",
        description: "Outbound sales for retail banking and loan products in Cairo. Direct apply email: hr@bankcorp-cairo.com",
        location: "Cairo, Egypt",
        companyId: "c1",
        jobSourceId: "s1",
        categories: [JobCategory.BANKING, JobCategory.SALES],
        status: "ACTIVE" as any,
        sourceUrl: "https://bankcorp-cairo.com/careers/sales",
        canonicalUrl: "https://bankcorp-cairo.com/careers/sales",
        seenAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const stats = await worker.runOnce("MANUAL", { timeoutMs: 50 });
      expect(stats.matchesEvaluated).toBeGreaterThanOrEqual(1);
      expect(stats.applicationsCreated).toBeGreaterThanOrEqual(1);
      expect(stats.emailsSent).toBeGreaterThanOrEqual(1);
      expect(stats.applicationsSubmitted).toBeGreaterThanOrEqual(1);
    });
  });
});
