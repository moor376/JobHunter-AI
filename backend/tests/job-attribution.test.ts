import { describe, expect, it } from "vitest";
import {
  attributeJobSource,
  extractAtsUrlsFromText,
  extractRecruitmentEmailFromText,
  extractDomain,
  isAggregatorDomain,
  isAtsDomain,
} from "../src/services/job-attribution-service.js";
import {
  DetectedChannel,
  EmploymentType,
  JobStatus,
  type JobRecord,
} from "../src/store/db-store.js";

describe("Job Source Attribution & Original Employer URL Engine", () => {
  describe("Helper domain & URL extraction utilities", () => {
    it("extracts clean host domain without www prefix", () => {
      expect(extractDomain("https://www.mastercard.com/careers/job123")).toBe("mastercard.com");
      expect(extractDomain("http://flynn.wd1.myworkdayjobs.com/careers")).toBe("flynn.wd1.myworkdayjobs.com");
      expect(extractDomain(null)).toBeNull();
    });

    it("identifies aggregator domains correctly", () => {
      expect(isAggregatorDomain("jooble.org")).toBe(true);
      expect(isAggregatorDomain("egypt.jooble.org")).toBe(true);
      expect(isAggregatorDomain("adzuna.com")).toBe(true);
      expect(isAggregatorDomain("mastercard.com")).toBe(false);
      expect(isAggregatorDomain("greenhouse.io")).toBe(false);
    });

    it("identifies known ATS platforms correctly", () => {
      expect(isAtsDomain("myworkdayjobs.com")).toBe(true);
      expect(isAtsDomain("company.wd3.myworkdayjobs.com")).toBe(true);
      expect(isAtsDomain("boards.greenhouse.io")).toBe(true);
      expect(isAtsDomain("jobs.lever.co")).toBe(true);
      expect(isAtsDomain("breezy.hr")).toBe(true);
      expect(isAtsDomain("jooble.org")).toBe(false);
    });

    it("extracts ATS links from job description text without fabricating", () => {
      const text = "Please apply directly through our portal at https://robu.st/careers/senior-manager or email us.";
      const urls = extractAtsUrlsFromText(text);
      expect(urls).toHaveLength(1);
      expect(urls[0]).toBe("https://robu.st/careers/senior-manager");
    });

    it("extracts recruitment email from text", () => {
      const text = "Send your CV to careers@vodafone.com for consideration.";
      const email = extractRecruitmentEmailFromText(text);
      expect(email).toBe("careers@vodafone.com");
    });
  });

  describe("Job Source Attribution Scenarios & Confidence Levels", () => {
    it("attributes HIGH confidence when direct employer link exists in API raw metadata", () => {
      const job: Partial<JobRecord> = {
        title: "Senior Legal Counsel",
        sourceUrl: "https://jooble.org/desc/123456",
        canonicalUrl: "https://jooble.org/desc/123456",
        rawReferenceMetadata: {
          original_link: "https://careers.mastercard.com/job/senior-legal-counsel-cairo",
          source: "Mastercard Careers",
        },
      };

      const attribution = attributeJobSource(job, { name: "Mastercard" });
      expect(attribution.attributionConfidence).toBe("HIGH");
      expect(attribution.originalEmployerUrl).toBe("https://careers.mastercard.com/job/senior-legal-counsel-cairo");
      expect(attribution.originalEmployerDomain).toBe("careers.mastercard.com");
      expect(attribution.discoveryUrl).toBe("https://jooble.org/desc/123456");
      expect(attribution.applyUrl).toBe("https://careers.mastercard.com/job/senior-legal-counsel-cairo");
      expect(attribution.applicationChannel).toBe(DetectedChannel.EXTERNAL_APPLICATION);
    });

    it("attributes HIGH confidence when ATS application URL is embedded in vacancy description", () => {
      const job: Partial<JobRecord> = {
        title: "Compliance Officer",
        description: "Submit your official application on Workday: https://adib.wd3.myworkdayjobs.com/careers/compliance-officer",
        sourceUrl: "https://jooble.org/desc/987654",
        canonicalUrl: "https://jooble.org/desc/987654",
      };

      const attribution = attributeJobSource(job, { name: "ADIB Bank" });
      expect(attribution.attributionConfidence).toBe("HIGH");
      expect(attribution.originalEmployerUrl).toBe("https://adib.wd3.myworkdayjobs.com/careers/compliance-officer");
      expect(attribution.originalEmployerDomain).toBe("adib.wd3.myworkdayjobs.com");
      expect(attribution.applicationChannel).toBe(DetectedChannel.COMPANY_APPLICATION_PAGE);
      expect(attribution.attributionSource).toBe("DESCRIPTION_ATS_LINK");
    });

    it("attributes HIGH confidence when direct recruitment email is in description", () => {
      const job: Partial<JobRecord> = {
        title: "HR Specialist",
        description: "Qualified candidates should send their resumes directly to recruitment@blackstone-eit.com.",
        sourceUrl: "https://jooble.org/desc/456789",
        canonicalUrl: "https://jooble.org/desc/456789",
      };

      const attribution = attributeJobSource(job, { name: "Blackstone eIT" });
      expect(attribution.attributionConfidence).toBe("HIGH");
      expect(attribution.originalEmployerUrl).toBe("mailto:recruitment@blackstone-eit.com");
      expect(attribution.applicationChannel).toBe(DetectedChannel.EMAIL);
      expect(attribution.attributionSource).toBe("DESCRIPTION_EMAIL");
    });

    it("attributes MEDIUM confidence when company profile has verified website portal", () => {
      const job: Partial<JobRecord> = {
        title: "Corporate Lawyer",
        description: "Seeking experienced corporate lawyer.",
        sourceUrl: "https://jooble.org/desc/777888",
        canonicalUrl: "https://jooble.org/desc/777888",
      };

      const attribution = attributeJobSource(job, {
        name: "Oyster HR",
        websiteUrl: "https://oysterhr.com/careers",
      });

      expect(attribution.attributionConfidence).toBe("MEDIUM");
      expect(attribution.originalEmployerUrl).toBe("https://oysterhr.com/careers");
      expect(attribution.originalEmployerDomain).toBe("oysterhr.com");
      expect(attribution.applicationChannel).toBe(DetectedChannel.COMPANY_APPLICATION_PAGE);
      expect(attribution.attributionSource).toBe("VERIFIED_COMPANY_CAREERS");
    });

    it("attributes NONE confidence when job is Jooble-only with no employer URL (Never guesses or fabricates)", () => {
      const job: Partial<JobRecord> = {
        title: "Tele-Sales Representative",
        description: "Banking telesales representative in Cairo. Commission based.",
        sourceUrl: "https://jooble.org/desc/999111",
        canonicalUrl: "https://jooble.org/desc/999111",
      };

      const attribution = attributeJobSource(job, { name: "Unknown Banking Agency" });
      expect(attribution.attributionConfidence).toBe("NONE");
      expect(attribution.originalEmployerUrl).toBeNull();
      expect(attribution.originalEmployerDomain).toBe("jooble.org");
      expect(attribution.discoveryUrl).toBe("https://jooble.org/desc/999111");
      expect(attribution.applyUrl).toBe("https://jooble.org/desc/999111");
      expect(attribution.applicationChannel).toBe(DetectedChannel.JOB_BOARD);
      expect(attribution.attributionSource).toBe("AGGREGATOR_ONLY");
    });

    it("never invents or guesses a fake careers URL", () => {
      const job: Partial<JobRecord> = {
        title: "Legal Advisor",
        description: "Join our legal team.",
        sourceUrl: "https://jooble.org/desc/333222",
      };

      const attribution = attributeJobSource(job, { name: "Random Corp Without Website" });
      expect(attribution.originalEmployerUrl).toBeNull();
      expect(attribution.applyUrl).toBe("https://jooble.org/desc/333222");
    });
  });
});
