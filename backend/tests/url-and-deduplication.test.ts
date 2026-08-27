import { describe, expect, it } from "vitest";
import {
  normalizeUrl,
  extractExternalJobId,
  checkJobDuplicate,
  computeJobContentHash,
  tokenSimilarity,
} from "../src/services/deduplication-service.js";
import { EmploymentType, JobStatus, type JobRecord } from "../src/store/db-store.js";

describe("Job URL Normalization & Deduplication Engine", () => {
  describe("URL Normalization & Tracking Parameter Stripping", () => {
    it("strips standard UTM and analytics tracking parameters", () => {
      const urlWithUtm =
        "https://example.com/jobs/legal-officer?utm_source=linkedin&utm_medium=cpc&utm_campaign=spring2026&gclid=12345&fbclid=abcdef";
      const normalized = normalizeUrl(urlWithUtm);
      expect(normalized).toBe("https://example.com/jobs/legal-officer");
    });

    it("strips Jooble-specific search context and tracking parameters", () => {
      const joobleUrlWithQuery =
        "https://jooble.org/desc/4799014167571342674?ckey=Legal+Affairs&rgn=55150&pos=1&groupId=2095223534&elckey=5528090963028495353&p=1&aq=8386809692217797962&cid=18553&jobAge=8031&brelb=100&bscr=37.15725&scr=37.15725";
      const normalized = normalizeUrl(joobleUrlWithQuery);
      expect(normalized).toBe("https://jooble.org/desc/4799014167571342674");
    });

    it("normalizes Jooble country subdomains and www to canonical jooble.org", () => {
      const egJoobleUrl =
        "https://eg.jooble.org/desc/6451636184988553018?ckey=Compliance&rgn=55150";
      const wwwJoobleUrl =
        "http://www.jooble.org/desc/6451636184988553018";
      expect(normalizeUrl(egJoobleUrl)).toBe("https://jooble.org/desc/6451636184988553018");
      expect(normalizeUrl(wwwJoobleUrl)).toBe("https://jooble.org/desc/6451636184988553018");
    });

    it("resolves Jooble /away/{id} redirect URLs to canonical /desc/{id}", () => {
      const awayUrl =
        "https://jooble.org/away/5165700726857672159?p=1&pos=10&rgn=55150&cid=18553&ckey=%d8%b4%d8%a4%d9%88%d9%86+%d9%82%d8%a7%d9%86%d9%8a%d8%a9";
      const descUrl =
        "https://jooble.org/desc/5165700726857672159";
      expect(normalizeUrl(awayUrl)).toBe(normalizeUrl(descUrl));
      expect(normalizeUrl(awayUrl)).toBe("https://jooble.org/desc/5165700726857672159");
    });

    it("correctly extracts external job IDs from URLs and IDs", () => {
      expect(extractExternalJobId("4799014167571342674")).toBe("4799014167571342674");
      expect(extractExternalJobId("-7796802985949748935")).toBe("-7796802985949748935");
      expect(extractExternalJobId("https://jooble.org/away/-7796802985949748935?pos=1")).toBe("-7796802985949748935");
      expect(extractExternalJobId("https://jooble.org/desc/123456789")).toBe("123456789");
      expect(extractExternalJobId("https://adzuna.co.uk/details/99887766")).toBe("99887766");
    });
  });

  describe("Duplicate Detection Across Scenarios", () => {
    const baseExistingJob: JobRecord = {
      id: "j1000000-0000-0000-0000-000000000001",
      companyId: "comp-1",
      jobSourceId: "jooble-source-1",
      title: "Senior Legal Affairs Specialist",
      description: "Managing company corporate contracts, labor law compliance, and statutory filings.",
      location: "Cairo, Egypt",
      employmentType: EmploymentType.FULL_TIME,
      sourceUrl: "https://jooble.org/desc/4799014167571342674?ckey=Legal+Affairs",
      canonicalUrl: "https://jooble.org/desc/4799014167571342674",
      externalJobId: "4799014167571342674",
      contentHash: computeJobContentHash(
        "Senior Legal Affairs Specialist",
        "Cairo Commercial Corp",
        "Managing company corporate contracts, labor law compliance, and statutory filings.",
        "Cairo, Egypt",
      ),
      status: JobStatus.ACTIVE,
      postedAt: new Date(),
      seenAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      company: {
        id: "comp-1",
        name: "Cairo Commercial Corp",
        normalizedName: "cairo commercial corp",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };

    it("detects same job discovered under different search queries (ckey variation)", () => {
      const candidateFromDifferentQuery = {
        jobSourceId: "jooble-source-1",
        title: "Senior Legal Affairs Specialist",
        companyName: "Cairo Commercial Corp",
        description: "Managing company corporate contracts, labor law compliance, and statutory filings.",
        location: "Cairo, Egypt",
        sourceUrl: "https://jooble.org/desc/4799014167571342674?ckey=Corporate+Lawyer&pos=5",
        canonicalUrl: "https://jooble.org/desc/4799014167571342674",
        externalJobId: "4799014167571342674",
      };

      const result = checkJobDuplicate(candidateFromDifferentQuery, [baseExistingJob]);
      expect(result.isDuplicate).toBe(true);
    });

    it("detects same job discovered with Jooble /away/ URL form vs stored /desc/ form", () => {
      const candidateWithAwayUrl = {
        jobSourceId: "jooble-source-1",
        title: "Senior Legal Affairs Specialist",
        companyName: "Cairo Commercial Corp",
        description: "Managing company corporate contracts, labor law compliance, and statutory filings.",
        location: "Cairo, Egypt",
        sourceUrl: "https://jooble.org/away/4799014167571342674?p=1&pos=10&ckey=Contracts",
        canonicalUrl: "https://jooble.org/away/4799014167571342674",
        externalJobId: "4799014167571342674",
      };

      const result = checkJobDuplicate(candidateWithAwayUrl, [baseExistingJob]);
      expect(result.isDuplicate).toBe(true);
    });

    it("detects same job with identical content hash across different sources", () => {
      const crossSourceCandidate = {
        jobSourceId: "different-source-2",
        title: "Senior Legal Affairs Specialist",
        companyName: "Cairo Commercial Corp",
        description: "Managing company corporate contracts, labor law compliance, and statutory filings.",
        location: "Cairo, Egypt",
        sourceUrl: "https://careers.cairocorp.com/jobs/101",
      };

      const result = checkJobDuplicate(crossSourceCandidate, [baseExistingJob]);
      expect(result.isDuplicate).toBe(true);
    });

    it("preserves genuinely different legitimate vacancies from the same company", () => {
      const distinctVacancy1 = {
        jobSourceId: "jooble-source-1",
        title: "Field Sales Representative",
        companyName: "Cairo Commercial Corp",
        description: "Outbound B2B field sales across commercial retail territories in Cairo.",
        location: "Cairo, Egypt",
        sourceUrl: "https://jooble.org/desc/8888888888888888888",
        canonicalUrl: "https://jooble.org/desc/8888888888888888888",
        externalJobId: "8888888888888888888",
      };

      const distinctVacancy2 = {
        jobSourceId: "jooble-source-1",
        title: "Recruitment Specialist & Talent Acquisition",
        companyName: "Cairo Commercial Corp",
        description: "Managing recruitment workflows, candidate sourcing, and interviewing.",
        location: "Cairo, Egypt",
        sourceUrl: "https://jooble.org/desc/9999999999999999999",
        canonicalUrl: "https://jooble.org/desc/9999999999999999999",
        externalJobId: "9999999999999999999",
      };

      const result1 = checkJobDuplicate(distinctVacancy1, [baseExistingJob]);
      const result2 = checkJobDuplicate(distinctVacancy2, [baseExistingJob]);

      expect(result1.isDuplicate).toBe(false);
      expect(result2.isDuplicate).toBe(false);
    });
  });
});
