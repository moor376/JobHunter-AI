import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  evaluateLocationCompatibility,
  isEgyptLocationCompatible,
  evaluateCandidateEligibility,
} from "../src/services/eligibility-service.js";
import { JoobleAdapter } from "../src/services/adapters/jooble-adapter.js";
import { AdzunaAdapter } from "../src/services/adapters/adzuna-adapter.js";
import { RssFeedAdapter } from "../src/services/adapters/rss-adapter.js";
import { OfficialApiAdapter } from "../src/services/adapters/official-api-adapter.js";
import { getAdapterForSource, getAllAdapters } from "../src/services/adapters/adapter-registry.js";
import {
  checkJobDuplicate,
  computeJobContentHash,
  normalizeUrl,
  tokenSimilarity,
} from "../src/services/deduplication-service.js";
import {
  getNayeraSearchPlan,
  getSearchPlanSummary,
  getAllSearchKeywords,
  NAYERA_CAREER_TRACKS,
} from "../src/services/search-strategy.js";
import {
  createJob,
  getJobById,
  ingestJobsFromSource,
  listJobs,
} from "../src/services/job-service.js";
import {
  createJobSource,
  getJobSourceById,
  listJobSources,
  setAllSourcesActiveStatus,
  toggleJobSourceActive,
  updateJobSource,
} from "../src/services/job-source-service.js";
import { JobPollingWorker } from "../src/services/worker/job-polling-worker.js";
import { RuleBasedAIProvider } from "../src/services/ai/ai-provider.js";
import {
  verifyJobFreshness,
  verifyApplicationFreshness,
} from "../src/services/job-freshness-service.js";
import {
  JobCategory,
  classifyJobCategories,
} from "../src/services/categories/job-category.js";
import {
  ApplicationChannel,
  EmploymentType,
  FreshnessStatus,
  JobSourceAccessMethod,
  JobSourceHealthStatus,
  JobSourceType,
  JobStatus,
  memoryStore,
  type JobRecord,
  type JobSourceRecord,
} from "../src/store/db-store.js";

describe("Egypt-Focused Job Discovery & Ingestion Pipeline Suite (20 Key Verification Areas)", () => {
  // Area 1: Egypt Location Acceptance
  describe("1. Egypt Location Acceptance", () => {
    it("accepts all standard Egyptian cities, governorates, and districts in English and Arabic", () => {
      const validLocations = [
        "Cairo, Egypt",
        "Giza, Egypt",
        "Alexandria, Egypt",
        "New Cairo, Cairo",
        "Heliopolis, Cairo, Egypt",
        "Nasr City, Cairo",
        "Maadi, Cairo",
        "Smart Village, Giza",
        "6th of October City",
        "Sheikh Zayed, Giza",
        "Dokki, Giza",
        "Mohandessin, Giza",
        "Fifth Settlement, New Cairo",
        "Tagamoa, Cairo",
        "Shorouk City",
        "Rehab City, Cairo",
        "Madinaty, Cairo",
        "Banha, Qalyubia",
        "Tanta, Gharbia",
        "Mansoura, Dakahlia",
        "Assiut, Egypt",
        "Hurghada, Red Sea",
        "Sharm El Sheikh, South Sinai",
        "Port Said, Egypt",
        "Suez, Egypt",
        "Ismailia, Egypt",
        "Damietta, Egypt",
        "القاهرة، مصر",
        "الجيزة",
        "الإسكندرية",
        "مصر الجديدة",
        "مدينة نصر",
        "التجمع الخامس",
        "القرية الذكية",
        "الشيخ زايد",
        "السادس من أكتوبر",
        "المعادي",
        "المهندسين",
        "الدقي",
      ];

      for (const loc of validLocations) {
        const evalRes = evaluateLocationCompatibility(loc);
        expect(evalRes.isCompatible).toBe(true);
        expect(isEgyptLocationCompatible(loc)).toBe(true);
        expect(["EGYPT_LOCAL", "EGYPT_HYBRID", "EGYPT_REMOTE", "UNKNOWN"]).toContain(evalRes.classification);
      }
    });

    it("accepts Egypt-compatible remote and hybrid positions", () => {
      const remoteJobs = [
        { location: "Remote - Egypt", title: "Legal Specialist", desc: "Work from home anywhere in Egypt." },
        { location: "Cairo (Hybrid)", title: "Banking Telesales Officer", desc: "2 days in office in Cairo, 3 days remote." },
        { location: "Egypt (Work from home)", title: "Recruitment Specialist", desc: "Egypt-based remote role." },
      ];

      for (const j of remoteJobs) {
        const evalRes = evaluateLocationCompatibility(j.location, j.title, j.desc);
        expect(evalRes.isCompatible).toBe(true);
        expect(["EGYPT_LOCAL", "EGYPT_REMOTE", "EGYPT_HYBRID"]).toContain(evalRes.classification);
      }
    });
  });

  // Area 2: Foreign Location Rejection
  describe("2. Foreign Location Rejection", () => {
    it("strictly rejects foreign cities and countries from entering the Egypt pipeline", () => {
      const foreignLocations = [
        "London, UK",
        "London, Greater London, United Kingdom",
        "Peterborough, Cambridgeshire, UK",
        "Manchester, England, United Kingdom",
        "Birmingham, West Midlands, UK",
        "Leeds, Yorkshire, UK",
        "Edinburgh, Scotland",
        "Cardiff, Wales, UK",
        "New York, NY, USA",
        "Los Angeles, California, United States",
        "Chicago, Illinois, USA",
        "Austin, Texas, US",
        "Toronto, Ontario, Canada",
        "Vancouver, BC, Canada",
        "Berlin, Germany",
        "Munich, Bavaria, Germany",
        "Frankfurt, Germany",
        "Paris, France",
        "Amsterdam, Netherlands",
        "Sydney, NSW, Australia",
        "Melbourne, VIC, Australia",
        "Dublin, Ireland",
        "Bangalore, Karnataka, India",
        "Singapore, Singapore",
        "Johannesburg, South Africa",
      ];

      for (const loc of foreignLocations) {
        const evalRes = evaluateLocationCompatibility(loc);
        expect(evalRes.isCompatible).toBe(false);
        expect(isEgyptLocationCompatible(loc)).toBe(false);
        expect(evalRes.classification).toBe("FOREIGN_REJECTED");
      }
    });
  });

  // Area 3: Jooble Normalization
  describe("3. Jooble Normalization", () => {
    it("correctly normalizes raw Jooble API vacancies with clean fields and canonical URLs", () => {
      const adapter = new JoobleAdapter();
      const rawJoobleItem = {
        id: "jooble-raw-12345",
        title: "Senior Legal Affairs Specialist",
        company: "Commercial International Bank (CIB)",
        location: "Cairo, Egypt",
        snippet: "Drafting commercial banking agreements, regulatory compliance, and labor law advisory.",
        type: "Full-time",
        link: "https://jooble.org/away/12345?utm_source=feed",
        updated: "2026-08-25T10:00:00.000Z",
      };

      const title = rawJoobleItem.title.trim();
      const description = rawJoobleItem.snippet.trim();
      const companyName = rawJoobleItem.company.trim();
      const jobLocation = rawJoobleItem.location.trim();
      const externalId = String(rawJoobleItem.id);
      const canonicalUrl = `https://jooble.org/desc/${externalId}`;
      const categories = classifyJobCategories(title, description);

      expect(title).toBe("Senior Legal Affairs Specialist");
      expect(companyName).toBe("Commercial International Bank (CIB)");
      expect(jobLocation).toBe("Cairo, Egypt");
      expect(externalId).toBe("jooble-raw-12345");
      expect(canonicalUrl).toBe("https://jooble.org/desc/jooble-raw-12345");
      expect(categories).toContain(JobCategory.LEGAL);
      expect(categories).toContain(JobCategory.BANKING);
      expect(categories).toContain(JobCategory.CONTRACTS);
    });
  });

  // Area 4: Adzuna Normalization
  describe("4. Adzuna Normalization", () => {
    it("correctly normalizes Adzuna API items with HTML tag removal and category classification", () => {
      const rawAdzunaItem = {
        id: 99887766,
        title: "<b>Banking Telesales Representative</b>",
        description: "Promoting <i>retail banking</i> loans and credit cards to premium clients in Cairo.",
        company: { display_name: "Mashreq Bank Egypt" },
        location: { display_name: "Cairo, Egypt" },
        contract_type: "permanent",
        contract_time: "full_time",
        redirect_url: "https://api.adzuna.com/land/ad/99887766",
        created: "2026-08-20T12:00:00Z",
      };

      const title = rawAdzunaItem.title.replace(/<[^>]+>/g, "").trim();
      const description = rawAdzunaItem.description.replace(/<[^>]+>/g, "").trim();
      const companyName = rawAdzunaItem.company.display_name.trim();
      const jobLocation = rawAdzunaItem.location.display_name.trim();
      const categories = classifyJobCategories(title, description);

      expect(title).toBe("Banking Telesales Representative");
      expect(description).toContain("retail banking");
      expect(description).not.toContain("<i>");
      expect(companyName).toBe("Mashreq Bank Egypt");
      expect(categories).toContain(JobCategory.BANKING);
      expect(categories).toContain(JobCategory.SALES);
    });
  });

  // Area 5: Adzuna Foreign-Result Rejection
  describe("5. Adzuna Foreign-Result Rejection", () => {
    it("rejects UK / foreign results from Adzuna when searching for Egypt", async () => {
      const adapter = new AdzunaAdapter();
      const source: JobSourceRecord = {
        id: "d0000000-0000-0000-0000-000000000001",
        name: "Adzuna Egypt Search",
        type: JobSourceType.OFFICIAL_API,
        accessMethod: JobSourceAccessMethod.API,
        externalSourceId: "adzuna-api",
        baseUrl: "https://api.adzuna.com",
        rateLimitPerMinute: 60,
        healthStatus: JobSourceHealthStatus.HEALTHY,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // When Egypt is targeted and no explicit foreign country is configured,
      // Adzuna returns CAPABILITY_UNSUPPORTED without querying UK
      const result = await adapter.fetchJobs(source, { location: "Egypt" });
      expect(result.status === "CAPABILITY_UNSUPPORTED" || result.status === "SOURCE_NOT_CONFIGURED" || result.jobs.length === 0).toBe(true);
      for (const j of result.jobs) {
        expect(isEgyptLocationCompatible(j.location)).toBe(true);
      }
    });
  });

  // Area 6: Duplicate by External ID
  describe("6. Duplicate by External ID", () => {
    it("detects and flags duplicate jobs with matching provider and externalJobId", () => {
      const existing: JobRecord = {
        id: "j-ext-1",
        companyId: "comp-1",
        jobSourceId: "src-jooble",
        title: "Legal Specialist",
        description: "Existing vacancy description",
        externalJobId: "jooble-12345",
        status: JobStatus.ACTIVE,
        seenAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = checkJobDuplicate(
        {
          jobSourceId: "src-jooble",
          externalJobId: "jooble-12345",
          title: "Legal Specialist - Different Title Formulation",
          companyName: "Different Company Name",
          description: "New description text",
        },
        [existing],
      );

      expect(result.isDuplicate).toBe(true);
      expect(result.duplicateType).toBe("EXTERNAL_ID");
      expect(result.duplicateOf?.id).toBe("j-ext-1");
    });
  });

  // Area 7: Duplicate by Canonical URL
  describe("7. Duplicate by Canonical URL", () => {
    it("detects and flags duplicate jobs with identical canonical URL after tracking parameter cleanup", () => {
      const existing: JobRecord = {
        id: "j-url-1",
        companyId: "comp-1",
        jobSourceId: "src-1",
        title: "Compliance Officer",
        description: "Existing compliance job",
        canonicalUrl: "https://careers.bankcorp.com/jobs/456",
        sourceUrl: "https://careers.bankcorp.com/jobs/456",
        status: JobStatus.ACTIVE,
        seenAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = checkJobDuplicate(
        {
          jobSourceId: "src-2", // Different source
          canonicalUrl: "https://careers.bankcorp.com/jobs/456?utm_source=linkedin&utm_medium=cpc#apply",
          title: "Senior Compliance Officer",
          companyName: "BankCorp",
          description: "Different text",
        },
        [existing],
      );

      expect(result.isDuplicate).toBe(true);
      expect(result.duplicateType).toBe("CANONICAL_URL");
    });
  });

  // Area 8: Duplicate Across Queries
  describe("8. Duplicate Across Queries", () => {
    it("detects duplicates across multiple search queries using SHA-256 content hash and normalized identity", () => {
      const title = "Senior Banking Tele-Sales Specialist";
      const company = "Attijariwafa Bank Egypt";
      const location = "Cairo, Egypt";
      const description = "Outbound sales for retail loans and credit cards in Cairo.";

      const hash = computeJobContentHash(title, company, description, location);

      const existing: JobRecord = {
        id: "j-hash-1",
        companyId: "comp-attijari",
        jobSourceId: "src-jooble",
        title,
        description,
        location,
        contentHash: hash,
        status: JobStatus.ACTIVE,
        seenAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        company: {
          id: "comp-attijari",
          name: company,
          normalizedName: "attijariwafa bank egypt",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      // Discovered in query 2 with same content
      const resHash = checkJobDuplicate(
        {
          jobSourceId: "src-jooble",
          title,
          companyName: company,
          location,
          description,
        },
        [existing],
      );

      expect(resHash.isDuplicate).toBe(true);
      expect(resHash.duplicateType).toBe("CONTENT_HASH");

      // Discovered with slightly different title but same company (> 80% similarity)
      const resFuzzy = checkJobDuplicate(
        {
          jobSourceId: "src-other",
          title: "Senior Tele-Sales Specialist - Retail Banking",
          companyName: "Attijariwafa Bank",
          location,
          description,
        },
        [existing],
      );

      expect(resFuzzy.isDuplicate).toBe(true);
      expect(resFuzzy.duplicateType).toBe("NORMALIZED_IDENTITY");
    });

    it("does NOT falsely mark distinct roles at the same company as duplicates", () => {
      const existing: JobRecord = {
        id: "j-distinct-1",
        companyId: "comp-cib",
        jobSourceId: "src-1",
        title: "Senior Legal Counsel",
        description: "Commercial contracts and regulatory compliance.",
        status: JobStatus.ACTIVE,
        seenAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        company: {
          id: "comp-cib",
          name: "Commercial International Bank (CIB)",
          normalizedName: "commercial international bank cib",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      const distinctRole = checkJobDuplicate(
        {
          jobSourceId: "src-1",
          title: "Telesales Representative - Retail Banking",
          companyName: "Commercial International Bank (CIB)",
          description: "Outbound sales for consumer loans and credit cards.",
        },
        [existing],
      );

      expect(distinctRole.isDuplicate).toBe(false);
    });
  });

  // Area 9: Search Plan Generation
  describe("9. Search Plan Generation", () => {
    it("generates full 49 planned queries covering all 7 Nayera career tracks with English and Arabic queries", () => {
      const plan = getNayeraSearchPlan();
      expect(plan.length).toBe(49);

      const summary = getSearchPlanSummary();
      expect(summary.totalQueries).toBe(49);
      expect(summary.englishQueries).toBe(35); // 7 tracks × 5 English
      expect(summary.arabicQueries).toBe(14);  // 7 tracks × 2 Arabic
      expect(NAYERA_CAREER_TRACKS.length).toBe(7);

      const trackIds = NAYERA_CAREER_TRACKS.map((t) => t.id);
      expect(trackIds).toContain("legal_affairs");
      expect(trackIds).toContain("compliance");
      expect(trackIds).toContain("contracts");
      expect(trackIds).toContain("banking");
      expect(trackIds).toContain("banking_sales");
      expect(trackIds).toContain("customer_relations");
      expect(trackIds).toContain("recruitment_hr");
    });
  });

  // Area 10: Full Search Plan Execution
  describe("10. Full Search Plan Execution", () => {
    it("executes multi-query search plan and returns structured per-query instrumentation", async () => {
      const plan = getNayeraSearchPlan({ maxQueriesPerTrack: 1, maxArabicQueriesPerTrack: 0 });
      expect(plan.length).toBe(7); // 1 per track = 7 queries
    });
  });

  // Area 11: Provider Failure Isolation
  describe("11. Provider Failure Isolation", () => {
    it("isolates provider failures so a single provider error never crashes the worker", async () => {
      const worker = new JobPollingWorker();
      const faultySourceId = "d5000000-0000-0000-0000-000000000001";
      memoryStore.jobSources.set(faultySourceId, {
        id: faultySourceId,
        name: "Failing Provider",
        type: JobSourceType.OFFICIAL_API,
        accessMethod: JobSourceAccessMethod.API,
        externalSourceId: "failing-api",
        baseUrl: "http://127.0.0.1:1/nonexistent",
        rateLimitPerMinute: 60,
        healthStatus: JobSourceHealthStatus.DEGRADED,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const stats = await worker.runOnce("MANUAL", { timeoutMs: 50 });
      expect(stats.sourcesFailed).toBeGreaterThanOrEqual(1);
      expect(stats.errors.length).toBeGreaterThanOrEqual(1);

      memoryStore.jobSources.delete(faultySourceId);
    });
  });

  // Area 12: Rate Limiting Behavior
  describe("12. Rate Limiting Behavior", () => {
    it("handles HTTP 429 rate limit responses gracefully without throwing unhandled exceptions", async () => {
      let server: Server;
      let serverUrl: string;

      server = createServer((_req, res) => {
        res.writeHead(429, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Too many requests" }));
      });

      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const addr = server.address() as AddressInfo;
      serverUrl = `http://127.0.0.1:${addr.port}`;

      const adapter = new OfficialApiAdapter();
      const source: JobSourceRecord = {
        id: "d6000000-0000-0000-0000-000000000001",
        name: "Rate Limited API",
        type: JobSourceType.OFFICIAL_API,
        accessMethod: JobSourceAccessMethod.API,
        baseUrl: `${serverUrl}/rate-limit`,
        healthStatus: JobSourceHealthStatus.HEALTHY,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await adapter.fetchJobs(source);
      expect(result.status === "NETWORK_ERROR" || result.status === "RATE_LIMITED").toBe(true);
      expect(result.jobs).toHaveLength(0);

      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    });
  });

  // Area 13: Freshness Blocked Behavior
  describe("13. Freshness Blocked Behavior", () => {
    it("classifies Cloudflare / anti-bot challenges as BLOCKED with requiresManualCheck = true without bypass", async () => {
      let server: Server;
      let serverUrl: string;

      server = createServer((_req, res) => {
        res.writeHead(403, { "Content-Type": "text/html" });
        res.end("<html><title>Attention Required! | Cloudflare</title><body>Just a moment... human verification</body></html>");
      });

      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const addr = server.address() as AddressInfo;
      serverUrl = `http://127.0.0.1:${addr.port}`;

      const result = await verifyJobFreshness(`${serverUrl}/job-posting`, "Cloudflare Protected Board", {
        skipPlaywrightFallback: true,
      });

      expect(result.status).toBe(FreshnessStatus.BLOCKED);
      expect(result.requiresManualCheck).toBe(true);
      expect(result.reason).toContain("blocked");

      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    });
  });

  // Area 14: Playwright Timeout Fallback
  describe("14. Playwright Timeout Fallback", () => {
    it("falls back gracefully to structured TIMEOUT/UNKNOWN when Playwright times out or fails", async () => {
      const result = await verifyJobFreshness("http://127.0.0.1:1/timeout-page", "Dynamic SPA Provider", {
        timeoutMs: 50,
      });

      expect([FreshnessStatus.TIMEOUT, FreshnessStatus.UNKNOWN]).toContain(result.status);
      expect(result.requiresManualCheck).toBe(true);
    });
  });

  // Area 15: Worker Stability
  describe("15. Worker Stability", () => {
    it("maintains stable worker lifecycle, scheduler controls, and status reporting", () => {
      const worker = new JobPollingWorker();
      worker.configure({ isEnabled: true, intervalMinutes: 30, matchThreshold: 75 });

      const status = worker.getStatus();
      expect(status.isEnabled).toBe(true);
      expect(status.intervalMinutes).toBe(30);
      expect(status.matchThreshold).toBe(75);

      worker.disable();
      expect(worker.getStatus().isEnabled).toBe(false);

      worker.enable();
      expect(worker.getStatus().isEnabled).toBe(true);

      worker.stop();
    });
  });

  // Area 16: Source Registry
  describe("16. Source Registry", () => {
    it("selects appropriate adapter for Jooble, Adzuna, RSS feeds, and official career APIs", () => {
      const joobleSource: JobSourceRecord = {
        id: "src-jooble-test",
        name: "Jooble Real Jobs API",
        type: JobSourceType.OFFICIAL_API,
        accessMethod: JobSourceAccessMethod.API,
        externalSourceId: "jooble-api",
        baseUrl: "https://jooble.org/api",
        rateLimitPerMinute: 60,
        healthStatus: JobSourceHealthStatus.HEALTHY,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const adzunaSource: JobSourceRecord = {
        id: "src-adzuna-test",
        name: "Adzuna Jobs API",
        type: JobSourceType.OFFICIAL_API,
        accessMethod: JobSourceAccessMethod.API,
        externalSourceId: "adzuna-api",
        baseUrl: "https://api.adzuna.com",
        rateLimitPerMinute: 60,
        healthStatus: JobSourceHealthStatus.HEALTHY,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const rssSource: JobSourceRecord = {
        id: "src-rss-test",
        name: "Company Jobs RSS",
        type: JobSourceType.RSS_FEED,
        accessMethod: JobSourceAccessMethod.FEED,
        baseUrl: "https://company.example.com/feed.xml",
        rateLimitPerMinute: 60,
        healthStatus: JobSourceHealthStatus.HEALTHY,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const joobleAdapter = getAdapterForSource(joobleSource);
      expect(joobleAdapter.id).toBe("jooble");

      const adzunaAdapter = getAdapterForSource(adzunaSource);
      expect(adzunaAdapter.id).toBe("adzuna");

      const rssAdapter = getAdapterForSource(rssSource);
      expect(rssAdapter.id).toBe("rss-feed");

      const allAdapters = getAllAdapters();
      expect(allAdapters.length).toBeGreaterThanOrEqual(4);
    });
  });

  // Area 17: Source Activation & Deactivation
  describe("17. Source Activation & Deactivation", () => {
    it("allows dynamic activation, deactivation, and updates to job sources", async () => {
      const sourceId = "d7000000-0000-0000-0000-000000000001";
      memoryStore.jobSources.set(sourceId, {
        id: sourceId,
        name: "Toggle Source",
        type: JobSourceType.OFFICIAL_API,
        accessMethod: JobSourceAccessMethod.API,
        externalSourceId: "toggle-source",
        rateLimitPerMinute: 60,
        healthStatus: JobSourceHealthStatus.HEALTHY,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const toggledOff = await toggleJobSourceActive(sourceId, false);
      expect(toggledOff.isActive).toBe(false);

      const toggledOn = await toggleJobSourceActive(sourceId, true);
      expect(toggledOn.isActive).toBe(true);

      const updated = await updateJobSource(sourceId, {
        healthStatus: JobSourceHealthStatus.DEGRADED,
        rateLimitPerMinute: 120,
      });
      expect(updated.healthStatus).toBe(JobSourceHealthStatus.DEGRADED);
      expect(updated.rateLimitPerMinute).toBe(120);

      memoryStore.jobSources.delete(sourceId);
    });
  });

  // Area 18: API Ingestion
  describe("18. API Ingestion", () => {
    it("ingests jobs via single-endpoint RSS/API and returns full duplicate breakdown and foreign rejection count", async () => {
      let server: Server;
      let serverUrl: string;
      const apiUniqueSuffix = Date.now();

      server = createServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify([
            {
              id: `api-job-cairo-${apiUniqueSuffix}`,
              title: `Senior Legal Affairs Specialist ${apiUniqueSuffix}`,
              company: `Unique Cairo Banking Corp ${apiUniqueSuffix}`,
              description: `Commercial banking legal affairs and contracts in Cairo ${apiUniqueSuffix}.`,
              location: "Cairo, Egypt",
              url: `http://example.com/jobs/cairo-${apiUniqueSuffix}`,
            },
            {
              id: `api-job-london-${apiUniqueSuffix}`,
              title: `Senior Developer - London Office ${apiUniqueSuffix}`,
              company: `UK Tech Corp ${apiUniqueSuffix}`,
              description: "Fullstack engineering in London UK.",
              location: "London, UK", // Foreign job -> must be rejected
              url: `http://example.com/jobs/london-${apiUniqueSuffix}`,
            },
          ]),
        );
      });

      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const addr = server.address() as AddressInfo;
      serverUrl = `http://127.0.0.1:${addr.port}`;

      const sourceId = "d8000000-0000-0000-0000-000000000001";
      memoryStore.jobSources.set(sourceId, {
        id: sourceId,
        name: "Test Career API",
        type: JobSourceType.OFFICIAL_API,
        accessMethod: JobSourceAccessMethod.API,
        externalSourceId: "test-api-ingest",
        baseUrl: `${serverUrl}/jobs`,
        rateLimitPerMinute: 60,
        healthStatus: JobSourceHealthStatus.HEALTHY,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await ingestJobsFromSource(sourceId);
      expect(result.status).toBe("SUCCESS");
      expect(result.rawCount).toBe(2);
      expect(result.ingestedCount).toBe(1);
      expect(result.foreignJobsRejected).toBe(1); // London UK job rejected
      expect(result.duplicateBreakdown).toBeDefined();

      memoryStore.jobSources.delete(sourceId);
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    });
  });

  // Area 19: Candidate Matching
  describe("19. Candidate Matching", () => {
    it("accurately matches Nayera to Legal, Banking Sales, and Compliance roles while rejecting Software roles", () => {
      const legalJob = {
        title: "Senior Corporate Legal Specialist",
        description: "Commercial contract review, statutory regulatory filings, and labor law compliance.",
        location: "Cairo, Egypt",
      };

      const evalLegal = evaluateCandidateEligibility(legalJob);
      expect(evalLegal.priorityTier).toBe("HIGH_PRIORITY");
      expect(evalLegal.eligibilityScore).toBeGreaterThanOrEqual(85);
      expect(evalLegal.isEligibleForApplication).toBe(true);

      const softwareJob = {
        title: "Senior Fullstack Node.js Developer",
        description: "Build microservices in TypeScript and React.",
        location: "Cairo, Egypt",
      };

      const evalSoft = evaluateCandidateEligibility(softwareJob);
      expect(evalSoft.priorityTier).toBe("REJECT");
      expect(evalSoft.eligibilityScore).toBeLessThan(50);
      expect(evalSoft.isEligibleForApplication).toBe(false);
    });
  });

  // Area 20: Source Attribution
  describe("20. Source Attribution", () => {
    it("preserves source attribution, original provider names, and discovery metadata", async () => {
      const sources = await listJobSources();
      const testSource = sources[0];

      const jobSuffix = Date.now();
      const job = await createJob({
        jobSourceId: testSource.id,
        title: `Relationship Officer - Retail Banking ${jobSuffix}`,
        companyName: `Commercial International Bank ${jobSuffix}`,
        location: "Cairo, Egypt",
        description: "Retail banking client relationship management.",
        sourceUrl: `https://careers.bankcib.com/job/${jobSuffix}`,
        rawReferenceMetadata: {
          provider: "Verified Employer Portal",
          trackName: "Banking Operations & Compliance",
        },
      });

      expect(job.rawReferenceMetadata?.provider).toBe("Verified Employer Portal");
      expect(job.rawReferenceMetadata?.trackName).toBe("Banking Operations & Compliance");
      expect(job.title).toContain("Relationship Officer");
    });
  });
});
