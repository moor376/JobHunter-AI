import { describe, expect, it } from "vitest";
import {
  detectApplicationChannel,
  generateJobCoverLetter,
  prepareApplicationForJob,
  selectProfileEmphasis,
  approvePreparedApplication,
  rejectPreparedApplication,
  listPreparedApplications,
} from "../src/services/application-preparation-service.js";
import {
  DetectedChannel,
  EmploymentType,
  JobStatus,
  PreparationStatus,
  memoryStore,
  type JobRecord,
} from "../src/store/db-store.js";
import { NAYERA_VERIFIED_FACTS } from "../src/services/eligibility-service.js";

describe("Application Preparation Pipeline & Human Approval Gate Suite", () => {
  describe("Application Channel Detection", () => {
    it("detects EMAIL channel when direct hiring email is present in vacancy description", () => {
      const emailJob = {
        title: "Legal Specialist",
        description: "Send CV and certificates to careers@cairolegal.com for consideration.",
        sourceUrl: "https://cairolegal.com/jobs/101",
      };
      const res = detectApplicationChannel(emailJob);
      expect(res.channel).toBe(DetectedChannel.EMAIL);
      expect(res.detectedEmail).toBe("careers@cairolegal.com");
      expect(res.requiresManualAction).toBe(false);
    });

    it("detects COMPANY_APPLICATION_PAGE for ATS URLs (Workday, Greenhouse, etc.) requiring candidate action", () => {
      const atsJob = {
        title: "Senior Contracts Specialist",
        description: "Apply through our Workday portal.",
        sourceUrl: "https://alfuttaim.myworkdayjobs.com/en-US/careers/job/Contracts-Specialist_JR100",
      };
      const res = detectApplicationChannel(atsJob);
      expect(res.channel).toBe(DetectedChannel.COMPANY_APPLICATION_PAGE);
      expect(res.requiresManualAction).toBe(true);
    });

    it("detects JOB_BOARD for aggregator URLs (Jooble, Adzuna, LinkedIn, etc.)", () => {
      const joobleJob = {
        title: "Legal Counsel",
        description: "Corporate legal counsel vacancy.",
        sourceUrl: "https://jooble.org/desc/4799014167571342674",
      };
      const res = detectApplicationChannel(joobleJob);
      expect(res.channel).toBe(DetectedChannel.JOB_BOARD);
      expect(res.requiresManualAction).toBe(true);
    });

    it("falls back to UNKNOWN when source URL is missing or empty", () => {
      const unknownJob = {
        title: "Mystery Role",
        description: "No link provided.",
        sourceUrl: "",
      };
      const res = detectApplicationChannel(unknownJob);
      expect(res.channel).toBe(DetectedChannel.UNKNOWN);
      expect(res.requiresManualAction).toBe(true);
    });
  });

  describe("Profile Emphasis Selection", () => {
    it("selects LEGAL / COMPLIANCE / CONTRACTS for legal roles", () => {
      expect(selectProfileEmphasis(["LEGAL"], "Legal Affairs Specialist")).toBe("LEGAL / COMPLIANCE / CONTRACTS");
      expect(selectProfileEmphasis(["COMPLIANCE"], "Senior Compliance Officer")).toBe("LEGAL / COMPLIANCE / CONTRACTS");
      expect(selectProfileEmphasis(["CONTRACTS"], "Contracts Administrator")).toBe("LEGAL / COMPLIANCE / CONTRACTS");
    });

    it("selects RECRUITMENT / HR for recruitment roles", () => {
      expect(selectProfileEmphasis(["RECRUITMENT"], "Talent Acquisition Specialist")).toBe("RECRUITMENT / HR");
      expect(selectProfileEmphasis(["HR"], "Human Resources Specialist")).toBe("RECRUITMENT / HR");
    });

    it("selects BANKING / SALES for banking and telesales roles", () => {
      expect(selectProfileEmphasis(["BANKING"], "Retail Banking Tele-Sales Officer")).toBe("BANKING / SALES");
      expect(selectProfileEmphasis(["SALES"], "Field Sales Representative")).toBe("BANKING / SALES");
    });
  });

  describe("Grounded Cover Letter Generation", () => {
    it("generates legal cover letter referencing verified LL.B, LL.M, Diplomas, and Internships", () => {
      const coverLetter = generateJobCoverLetter(
        { title: "Senior Legal Counsel", companyName: "Egypt Corp", location: "Cairo" },
        "LEGAL / COMPLIANCE / CONTRACTS",
      );
      expect(coverLetter).toContain("Nayera Tarek Mohamed");
      expect(coverLetter).toContain("LL.M of Law from Menoufia University");
      expect(coverLetter).toContain("LL.B of Law from Banha University (2019, Grade: Good)");
      expect(coverLetter).toContain("Diploma of Administrative Sciences");
      expect(coverLetter).toContain("Diploma of Public Law");
      expect(coverLetter).toContain("Dr. Zein El-Abdeen Law Office");
      expect(coverLetter).toContain("tareknayera24@gmail.com");
      expect(coverLetter).toContain("Roxy, Heliopolis, Cairo, Egypt");
    });

    it("generates banking cover letter referencing Attijariwafa, ABK, and ADIB without inventing facts", () => {
      const coverLetter = generateJobCoverLetter(
        { title: "Telesales Executive", companyName: "ADIB Bank", location: "Cairo" },
        "BANKING / SALES",
      );
      expect(coverLetter).toContain("Attijariwafa Bank (May 2022 to September 2022)");
      expect(coverLetter).toContain("Al Ahli Bank of Kuwait (October 2022 to May 2024)");
      expect(coverLetter).toContain("ADIB Bank (June 2024 to September 2025)");
      expect(coverLetter).toContain("Banking courses");
    });
  });

  describe("End-to-End Preparation, Duplicate Protection & Quality Gates", () => {
    const legalJobId = "job-prep-legal-001";
    const legalJob: JobRecord = {
      id: legalJobId,
      companyId: "c-prep-1",
      jobSourceId: "src-jooble",
      title: "Senior Legal Affairs Specialist",
      description: "Managing corporate legal affairs, regulatory research, contract drafting, and statutory filings.",
      location: "Cairo, Egypt",
      employmentType: EmploymentType.FULL_TIME,
      sourceUrl: "https://jooble.org/desc/4799014167571342674",
      canonicalUrl: "https://jooble.org/desc/4799014167571342674",
      categories: ["LEGAL", "CONTRACTS", "COMPLIANCE"],
      status: JobStatus.ACTIVE,
      seenAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      company: {
        id: "c-prep-1",
        name: "Cairo Commercial Corp",
        normalizedName: "cairo commercial corp",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };

    const rejectJobId = "job-prep-reject-002";
    const rejectJob: JobRecord = {
      id: rejectJobId,
      companyId: "c-prep-2",
      jobSourceId: "src-jooble",
      title: "Senior Fullstack React Node.js Developer",
      description: "Building React microservices, Docker, Kubernetes, AWS.",
      location: "Cairo, Egypt",
      employmentType: EmploymentType.FULL_TIME,
      sourceUrl: "https://jooble.org/desc/9999999999999999999",
      canonicalUrl: "https://jooble.org/desc/9999999999999999999",
      categories: ["IT", "SOFTWARE"],
      status: JobStatus.ACTIVE,
      seenAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      company: {
        id: "c-prep-2",
        name: "Tech Corp",
        normalizedName: "tech corp",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };

    memoryStore.jobs.set(legalJobId, legalJob);
    memoryStore.jobs.set(rejectJobId, rejectJob);

    it("prepares application record in PENDING_APPROVAL state without sending anything", async () => {
      const prep = await prepareApplicationForJob(legalJobId);
      expect(prep).toBeDefined();
      expect(prep.jobId).toBe(legalJobId);
      expect(prep.priorityTier).toBe("HIGH_PRIORITY");
      expect(prep.eligibilityScore).toBeGreaterThanOrEqual(85);
      expect(prep.preparationStatus).toBe(PreparationStatus.PENDING_APPROVAL);
      expect(prep.provenance.emailSent).toBe(false);
      expect(prep.provenance.applicationSubmitted).toBe(false);
      expect(prep.preparedEmail?.subject).toContain("Senior Legal Affairs Specialist");
      expect(prep.coverLetterDraft).toContain("LL.M of Law");
    });

    it("enforces duplicate preparation protection for the same candidate and job", async () => {
      const prep1 = await prepareApplicationForJob(legalJobId);
      const prep2 = await prepareApplicationForJob(legalJobId);
      expect(prep1.id).toBe(prep2.id);

      const allPreps = await listPreparedApplications({ candidateId: prep1.candidateId });
      const matchingJobs = allPreps.filter((p) => p.jobId === legalJobId);
      expect(matchingJobs).toHaveLength(1);
    });

    it("rejects application preparation for REJECT and LOW_MATCH jobs", async () => {
      await expect(prepareApplicationForJob(rejectJobId)).rejects.toThrow(
        /Job is not eligible for application preparation/,
      );
    });

    it("rejects application preparation when usable source URL is missing", async () => {
      const badJobId = "job-no-url-003";
      memoryStore.jobs.set(badJobId, {
        ...legalJob,
        id: badJobId,
        sourceUrl: null,
        canonicalUrl: null,
      });

      await expect(prepareApplicationForJob(badJobId)).rejects.toThrow(
        /Job is missing a valid usable source URL/,
      );
    });

    it("allows human user approval transition without automatic dispatch", async () => {
      const prep = await prepareApplicationForJob(legalJobId);
      const approved = await approvePreparedApplication(prep.id, { skipFreshnessCheck: true });
      expect(approved.preparationStatus).toBe(PreparationStatus.APPROVED);
      expect(approved.provenance.emailSent).toBe(false);
      expect(approved.provenance.applicationSubmitted).toBe(false);
    });

    it("allows human user rejection transition", async () => {
      const prep = await prepareApplicationForJob(legalJobId);
      const rejected = await rejectPreparedApplication(prep.id, "Candidate not interested");
      expect(rejected.preparationStatus).toBe(PreparationStatus.REJECTED);
      expect(rejected.manualActionNotes).toBe("Candidate not interested");
    });
  });
});
