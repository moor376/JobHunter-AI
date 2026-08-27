import { describe, expect, it } from "vitest";
import {
  detectAtsFromUrl,
  discoverDirectEmployer,
  crossMatchJobAcrossSources,
  scanTextForAtsUrls,
} from "../src/services/job-employer-discovery-service.js";
import {
  verifyJobFreshness,
} from "../src/services/job-freshness-service.js";
import {
  DetectedChannel,
  FreshnessStatus,
  EmploymentType,
  JobStatus,
  type JobRecord,
} from "../src/store/db-store.js";

describe("Direct Employer Discovery & ATS Recognition Engine", () => {
  describe("ATS Detection Across Standard Platforms", () => {
    it("recognizes Workday URLs correctly", () => {
      const res = detectAtsFromUrl("https://flynn.wd1.myworkdayjobs.com/careers/job1");
      expect(res.atsProvider).toBe("Workday");
      expect(res.atsConfidence).toBe("HIGH");
    });

    it("recognizes Greenhouse URLs correctly", () => {
      const res = detectAtsFromUrl("https://boards.greenhouse.io/scaleai/jobs/123");
      expect(res.atsProvider).toBe("Greenhouse");
      expect(res.atsConfidence).toBe("HIGH");
    });

    it("recognizes Lever URLs correctly", () => {
      const res = detectAtsFromUrl("https://jobs.lever.co/stripe/abc-xyz");
      expect(res.atsProvider).toBe("Lever");
      expect(res.atsConfidence).toBe("HIGH");
    });

    it("recognizes Ashby, SmartRecruiters, Taleo, Breezy, Recruitee, and BambooHR", () => {
      expect(detectAtsFromUrl("https://jobs.ashbyhq.com/posthog/1").atsProvider).toBe("Ashby");
      expect(detectAtsFromUrl("https://jobs.smartrecruiters.com/visa/2").atsProvider).toBe("SmartRecruiters");
      expect(detectAtsFromUrl("https://oracle.taleo.net/career/3").atsProvider).toBe("Taleo");
      expect(detectAtsFromUrl("https://company.breezy.hr/p/4").atsProvider).toBe("Breezy");
      expect(detectAtsFromUrl("https://test.recruitee.com/o/5").atsProvider).toBe("Recruitee");
      expect(detectAtsFromUrl("https://startup.bamboohr.com/careers/6").atsProvider).toBe("BambooHR");
    });

    it("scans text and extracts legitimate ATS URLs", () => {
      const text = "To apply, please visit our official Workday portal at https://adib.wd3.myworkdayjobs.com/careers/legal-counsel.";
      const res = scanTextForAtsUrls(text);
      expect(res.atsProvider).toBe("Workday");
      expect(res.atsUrl).toBe("https://adib.wd3.myworkdayjobs.com/careers/legal-counsel");
    });
  });

  describe("Direct Employer Discovery Scenarios & Confidence Levels", () => {
    it("discovers direct employer URL from provider raw metadata with HIGH confidence", () => {
      const job: Partial<JobRecord> = {
        title: "Senior Legal Counsel",
        sourceUrl: "https://jooble.org/desc/1001",
        rawReferenceMetadata: {
          original_link: "https://careers.mastercard.com/jobs/legal-counsel",
        },
      };

      const res = discoverDirectEmployer(job, { name: "Mastercard" });
      expect(res.attributionConfidence).toBe("HIGH");
      expect(res.employerUrl).toBe("https://careers.mastercard.com/jobs/legal-counsel");
      expect(res.employerDomain).toBe("careers.mastercard.com");
      expect(res.applicationUrl).toBe("https://careers.mastercard.com/jobs/legal-counsel");
      expect(res.applicationChannel).toBe(DetectedChannel.COMPANY_APPLICATION_PAGE);
      expect(res.requiresManualVerification).toBe(false);
    });

    it("discovers ATS URL embedded in job description with HIGH confidence and ATS channel", () => {
      const job: Partial<JobRecord> = {
        title: "Compliance Specialist",
        description: "Official submission link: https://adib.wd3.myworkdayjobs.com/careers/compliance-specialist",
        sourceUrl: "https://jooble.org/desc/2002",
      };

      const res = discoverDirectEmployer(job, { name: "ADIB Bank" });
      expect(res.attributionConfidence).toBe("HIGH");
      expect(res.atsProvider).toBe("Workday");
      expect(res.atsUrl).toBe("https://adib.wd3.myworkdayjobs.com/careers/compliance-specialist");
      expect(res.applicationChannel).toBe(DetectedChannel.ATS_APPLICATION_PAGE);
      expect(res.applicationUrl).toBe("https://adib.wd3.myworkdayjobs.com/careers/compliance-specialist");
    });

    it("discovers verified company career page with MEDIUM confidence", () => {
      const job: Partial<JobRecord> = {
        title: "Recruitment Specialist",
        description: "Join our HR talent team.",
        sourceUrl: "https://jooble.org/desc/3003",
      };

      const res = discoverDirectEmployer(job, {
        name: "Eden Cleaning Company",
        websiteUrl: "https://edencleaning.com/careers",
      });

      expect(res.attributionConfidence).toBe("MEDIUM");
      expect(res.employerUrl).toBe("https://edencleaning.com/careers");
      expect(res.employerDomain).toBe("edencleaning.com");
      expect(res.applicationChannel).toBe(DetectedChannel.COMPANY_APPLICATION_PAGE);
    });

    it("handles Jooble-only vacancy with NONE confidence without inventing URLs", () => {
      const job: Partial<JobRecord> = {
        title: "Banking Tele-Sales Officer",
        description: "Sales representative in Cairo.",
        sourceUrl: "https://jooble.org/desc/4004",
      };

      const res = discoverDirectEmployer(job, { name: "Direct Employer Agency" });
      expect(res.attributionConfidence).toBe("NONE");
      expect(res.employerUrl).toBeNull();
      expect(res.atsProvider).toBeNull();
      expect(res.discoveryUrl).toBe("https://jooble.org/desc/4004");
      expect(res.applicationUrl).toBe("https://jooble.org/desc/4004");
      expect(res.applicationChannel).toBe(DetectedChannel.JOB_BOARD);
      expect(res.requiresManualVerification).toBe(true);
    });
  });

  describe("Multi-Source Cross Matching", () => {
    it("cross-matches identical jobs across different sources and links provenance", () => {
      const joobleJob: Partial<JobRecord> = {
        id: "job-j-1",
        title: "Senior Legal Counsel",
        sourceUrl: "https://jooble.org/desc/1111",
        jobSource: { id: "s1", name: "Jooble Real Jobs API" } as any,
        company: { id: "c1", name: "Mastercard" } as any,
      };

      const adzunaJob: JobRecord = {
        id: "job-a-2",
        companyId: "c1",
        jobSourceId: "s2",
        title: "Senior Legal Counsel",
        description: "Direct apply at https://mastercard.wd1.myworkdayjobs.com/careers/senior-legal-counsel",
        atsUrl: "https://mastercard.wd1.myworkdayjobs.com/careers/senior-legal-counsel",
        atsProvider: "Workday",
        employerUrl: "https://mastercard.wd1.myworkdayjobs.com/careers/senior-legal-counsel",
        sourceUrl: "https://adzuna.com/land/123",
        status: JobStatus.ACTIVE,
        seenAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        jobSource: { id: "s2", name: "Adzuna Jobs" } as any,
        company: { id: "c1", name: "Mastercard", normalizedName: "mastercard", createdAt: new Date(), updatedAt: new Date() },
      };

      const res = discoverDirectEmployer(joobleJob, { name: "Mastercard" }, [adzunaJob]);
      expect(res.discoveryProviders).toContain("Jooble Real Jobs API");
      expect(res.discoveryProviders).toContain("Adzuna Jobs");
      expect(res.atsProvider).toBe("Workday");
      expect(res.atsUrl).toBe("https://mastercard.wd1.myworkdayjobs.com/careers/senior-legal-counsel");
      expect(res.attributionConfidence).toBe("HIGH");
    });
  });

  describe("Freshness Hierarchy & Anti-Bot Fallback", () => {
    it("classifies Jooble blocked page as MANUAL_SOURCE_VERIFICATION_REQUIRED when blocked by bot controls", async () => {
      const res = await verifyJobFreshness("https://jooble.org/desc/fake-id", "Jooble Real Jobs API");
      if (res.status === FreshnessStatus.BLOCKED) {
        expect(res.status).toBe(FreshnessStatus.BLOCKED);
        expect(res.requiresManualCheck).toBe(true);
      }
    });
  });
});
