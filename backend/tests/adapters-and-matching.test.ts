import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AdzunaAdapter } from "../src/services/adapters/adzuna-adapter.js";
import { JoobleAdapter } from "../src/services/adapters/jooble-adapter.js";
import { OfficialApiAdapter } from "../src/services/adapters/official-api-adapter.js";
import { RssFeedAdapter } from "../src/services/adapters/rss-adapter.js";
import {
  classifyJobCategories,
  isBankingOrSalesRelated,
  isLegalRelated,
  isRecruitmentOrHRRelated,
  JobCategory,
} from "../src/services/categories/job-category.js";
import {
  checkJobDuplicate,
  computeJobContentHash,
  normalizeUrl,
  tokenSimilarity,
} from "../src/services/deduplication-service.js";
import { RuleBasedAIProvider } from "../src/services/ai/ai-provider.js";
import {
  JobSourceAccessMethod,
  JobSourceHealthStatus,
  JobSourceType,
  type JobRecord,
  type JobSourceRecord,
} from "../src/store/db-store.js";
import { JobPollingWorker } from "../src/services/worker/job-polling-worker.js";
import { evaluateCandidateEligibility } from "../src/services/eligibility-service.js";

describe("Job Source Adapters & Integration Suite", () => {
  const dummySource: JobSourceRecord = {
    id: "src-100",
    name: "Jooble Jobs",
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

  it("Jooble Adapter reports SOURCE_NOT_CONFIGURED when JOOBLE_API_KEY is missing", async () => {
    const originalKey = process.env.JOOBLE_API_KEY;
    delete process.env.JOOBLE_API_KEY;

    const adapter = new JoobleAdapter();
    expect(adapter.isConfigured).toBe(false);
    expect(adapter.getMissingConfiguration()).toContain("JOOBLE_API_KEY");

    const result = await adapter.fetchJobs(dummySource);
    expect(result.status).toBe("SOURCE_NOT_CONFIGURED");
    expect(result.missingConfig).toBe("JOOBLE_API_KEY");
    expect(result.jobs).toHaveLength(0);

    if (originalKey) process.env.JOOBLE_API_KEY = originalKey;
  });

  it("Adzuna Adapter reports SOURCE_NOT_CONFIGURED when ADZUNA_APP_ID / ADZUNA_APP_KEY are missing", async () => {
    const originalAppId = process.env.ADZUNA_APP_ID;
    const originalAppKey = process.env.ADZUNA_APP_KEY;
    delete process.env.ADZUNA_APP_ID;
    delete process.env.ADZUNA_APP_KEY;

    const adapter = new AdzunaAdapter();
    expect(adapter.isConfigured).toBe(false);
    expect(adapter.getMissingConfiguration()).toContain("ADZUNA_APP_ID");

    const result = await adapter.fetchJobs({
      ...dummySource,
      name: "Adzuna Jobs",
      externalSourceId: "adzuna-api",
    });
    expect(result.status).toBe("SOURCE_NOT_CONFIGURED");
    expect(result.jobs).toHaveLength(0);

    if (originalAppId) process.env.ADZUNA_APP_ID = originalAppId;
    if (originalAppKey) process.env.ADZUNA_APP_KEY = originalAppKey;
  });

  it("RSS Adapter reports SOURCE_NOT_CONFIGURED when baseUrl is invalid or missing", async () => {
    const adapter = new RssFeedAdapter();
    const result = await adapter.fetchJobs({
      ...dummySource,
      type: JobSourceType.RSS_FEED,
      baseUrl: "",
    });
    expect(result.status).toBe("SOURCE_NOT_CONFIGURED");
    expect(result.jobs).toHaveLength(0);
  });

  it("Official API Adapter reports SOURCE_NOT_CONFIGURED when baseUrl is missing", async () => {
    const adapter = new OfficialApiAdapter();
    const result = await adapter.fetchJobs({
      ...dummySource,
      baseUrl: null,
    });
    expect(result.status).toBe("SOURCE_NOT_CONFIGURED");
  });
});

describe("Job Source Adapters Timeout & Cancellation Engine", () => {
  let hangingServer: import("node:http").Server;
  let hangingUrl: string;

  beforeAll(async () => {
    const http = await import("node:http");
    hangingServer = http.createServer((_req, _res) => {
      // Intentionally do nothing and never respond to simulate a hanging connection
    });
    await new Promise<void>((resolve) => {
      hangingServer.listen(0, "127.0.0.1", resolve);
    });
    const addr = hangingServer.address() as import("node:net").AddressInfo;
    hangingUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    if (hangingServer) {
      await new Promise<void>((resolve, reject) => {
        hangingServer.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it("enforces hard maximum timeout ceiling of 10 seconds in resolveTimeoutMs", async () => {
    const { resolveTimeoutMs, MAX_ADAPTER_TIMEOUT_MS, DEFAULT_ADAPTER_TIMEOUT_MS } =
      await import("../src/services/adapters/http-timeout.js");

    expect(DEFAULT_ADAPTER_TIMEOUT_MS).toBe(10_000);
    expect(MAX_ADAPTER_TIMEOUT_MS).toBe(10_000);
    expect(resolveTimeoutMs()).toBe(10_000);
    expect(resolveTimeoutMs(undefined)).toBe(10_000);
    expect(resolveTimeoutMs(0)).toBe(10_000);
    expect(resolveTimeoutMs(-500)).toBe(10_000);
    expect(resolveTimeoutMs(5000)).toBe(5000);
    expect(resolveTimeoutMs(10_000)).toBe(10_000);
    // Values exceeding 10s MUST be clamped to 10s hard maximum
    expect(resolveTimeoutMs(30_000)).toBe(10_000);
    expect(resolveTimeoutMs(60_000)).toBe(10_000);
    expect(resolveTimeoutMs(3_600_000)).toBe(10_000);
  });

  it("Official API Adapter cancels hanging connection and returns structured TIMEOUT error", async () => {
    const adapter = new OfficialApiAdapter();
    const source: JobSourceRecord = {
      id: "src-official-hang",
      name: "Hanging Official API",
      type: JobSourceType.OFFICIAL_API,
      accessMethod: JobSourceAccessMethod.API,
      baseUrl: `${hangingUrl}/careers/jobs`,
      healthStatus: JobSourceHealthStatus.HEALTHY,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const startTime = Date.now();
    const result = await adapter.fetchJobs(source, { timeoutMs: 50 });
    const duration = Date.now() - startTime;

    expect(result.status).toBe("TIMEOUT");
    expect(result.jobs).toHaveLength(0);
    expect(result.errorMessage).toContain("timed out");
    expect(result.errorMessage).toContain("hard limit: 10s");
    expect(duration).toBeLessThan(2000);
  });

  it("RSS Feed Adapter cancels hanging connection and returns structured TIMEOUT error", async () => {
    const adapter = new RssFeedAdapter();
    const source: JobSourceRecord = {
      id: "src-rss-hang",
      name: "Hanging RSS Feed",
      type: JobSourceType.RSS_FEED,
      accessMethod: JobSourceAccessMethod.FEED,
      baseUrl: `${hangingUrl}/feed.xml`,
      healthStatus: JobSourceHealthStatus.HEALTHY,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const startTime = Date.now();
    const result = await adapter.fetchJobs(source, { timeoutMs: 50 });
    const duration = Date.now() - startTime;

    expect(result.status).toBe("TIMEOUT");
    expect(result.jobs).toHaveLength(0);
    expect(result.errorMessage).toContain("timed out");
    expect(result.errorMessage).toContain("hard limit: 10s");
    expect(duration).toBeLessThan(2000);
  });

  it("Jooble Adapter cancels hanging connection and returns structured TIMEOUT error", async () => {
    const originalKey = process.env.JOOBLE_API_KEY;
    process.env.JOOBLE_API_KEY = "test_jooble_api_key_valid";

    const adapter = new JoobleAdapter();
    const source: JobSourceRecord = {
      id: "src-jooble-hang",
      name: "Jooble Real Jobs API",
      type: JobSourceType.OFFICIAL_API,
      accessMethod: JobSourceAccessMethod.API,
      baseUrl: `${hangingUrl}/api/jooble`,
      healthStatus: JobSourceHealthStatus.HEALTHY,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const startTime = Date.now();
    const result = await adapter.fetchJobs(source, { timeoutMs: 50 });
    const duration = Date.now() - startTime;

    expect(result.status).toBe("TIMEOUT");
    expect(result.jobs).toHaveLength(0);
    expect(result.errorMessage).toContain("timed out");
    expect(result.errorMessage).toContain("hard limit: 10s");
    expect(duration).toBeLessThan(2000);

    if (originalKey) {
      process.env.JOOBLE_API_KEY = originalKey;
    } else {
      delete process.env.JOOBLE_API_KEY;
    }
  });

  it("Adzuna Adapter cancels hanging connection and returns structured TIMEOUT error", async () => {
    const originalAppId = process.env.ADZUNA_APP_ID;
    const originalAppKey = process.env.ADZUNA_APP_KEY;
    process.env.ADZUNA_APP_ID = "test_app_id";
    process.env.ADZUNA_APP_KEY = "test_app_key_secret";

    const adapter = new AdzunaAdapter();
    const source: JobSourceRecord = {
      id: "src-adzuna-hang",
      name: "Adzuna Real Jobs API",
      type: JobSourceType.OFFICIAL_API,
      accessMethod: JobSourceAccessMethod.API,
      baseUrl: `${hangingUrl}/api/adzuna`,
      healthStatus: JobSourceHealthStatus.HEALTHY,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const startTime = Date.now();
    const result = await adapter.fetchJobs(source, { timeoutMs: 50 });
    const duration = Date.now() - startTime;

    expect(result.status).toBe("TIMEOUT");
    expect(result.jobs).toHaveLength(0);
    expect(result.errorMessage).toContain("timed out");
    expect(result.errorMessage).toContain("hard limit: 10s");
    expect(duration).toBeLessThan(2000);

    if (originalAppId) process.env.ADZUNA_APP_ID = originalAppId;
    else delete process.env.ADZUNA_APP_ID;
    if (originalAppKey) process.env.ADZUNA_APP_KEY = originalAppKey;
    else delete process.env.ADZUNA_APP_KEY;
  });

  it("aborts hanging request immediately when caller's parent AbortSignal triggers", async () => {
    const adapter = new OfficialApiAdapter();
    const source: JobSourceRecord = {
      id: "src-parent-abort",
      name: "Parent Abort API",
      type: JobSourceType.OFFICIAL_API,
      accessMethod: JobSourceAccessMethod.API,
      baseUrl: `${hangingUrl}/api/parent-abort`,
      healthStatus: JobSourceHealthStatus.HEALTHY,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const parentController = new AbortController();
    setTimeout(() => {
      parentController.abort(new Error("User cancelled worker run"));
    }, 30);

    const startTime = Date.now();
    const result = await adapter.fetchJobs(source, {
      signal: parentController.signal,
      timeoutMs: 10_000,
    });
    const duration = Date.now() - startTime;

    expect(result.status === "TIMEOUT" || result.status === "NETWORK_ERROR").toBe(true);
    expect(result.jobs).toHaveLength(0);
    expect(duration).toBeLessThan(2000);
  });
});

describe("Job Category Classification & Arabic Term Engine", () => {
  it("classifies English Legal Affairs and Compliance roles correctly", () => {
    const categories1 = classifyJobCategories(
      "Senior Legal Affairs Specialist",
      "Drafting contracts, regulatory compliance, legal research, and litigation management.",
    );
    expect(categories1).toContain(JobCategory.LEGAL);
    expect(categories1).toContain(JobCategory.CONTRACTS);
    expect(categories1).toContain(JobCategory.COMPLIANCE);
    expect(isLegalRelated(categories1)).toBe(true);
  });

  it("classifies Arabic Legal roles (شؤون قانونية / عقود / امتثال / محامي) correctly", () => {
    const categoriesAr = classifyJobCategories(
      "أخصائي شؤون قانونية وعقود",
      "مسؤول عن صياغة العقود ومراجعة اللوائح والامتثال وتوثيق القضايا لدى الإدارة القانونية.",
    );
    expect(categoriesAr).toContain(JobCategory.LEGAL);
    expect(categoriesAr).toContain(JobCategory.CONTRACTS);
    expect(categoriesAr).toContain(JobCategory.COMPLIANCE);
    expect(isLegalRelated(categoriesAr)).toBe(true);
  });

  it("classifies Banking, Tele-Sales, and Customer Service roles accurately", () => {
    const categoriesBank = classifyJobCategories(
      "Banking Tele-Sales Officer - Retail Products",
      "Promoting retail personal loans, credit cards, customer relationship management, and KYC compliance.",
    );
    expect(categoriesBank).toContain(JobCategory.BANKING);
    expect(categoriesBank).toContain(JobCategory.SALES);
    expect(isBankingOrSalesRelated(categoriesBank)).toBe(true);
  });

  it("classifies Recruitment & HR roles accurately", () => {
    const categoriesHR = classifyJobCategories(
      "Talent Acquisition & Recruitment Specialist",
      "Managing end-to-end recruitment pipelines, candidate screening, interviews, and HR onboarding.",
    );
    expect(categoriesHR).toContain(JobCategory.RECRUITMENT);
    expect(categoriesHR).toContain(JobCategory.HR);
    expect(isRecruitmentOrHRRelated(categoriesHR)).toBe(true);
  });
});

describe("Job Deduplication Engine", () => {
  it("normalizes URLs and removes tracking parameters", () => {
    const raw = "https://careers.example.com/job/123/?utm_source=linkedin&utm_medium=feed&ref=banner#apply";
    const normalized = normalizeUrl(raw);
    expect(normalized).toBe("https://careers.example.com/job/123");
  });

  it("detects exact duplicate by provider and externalJobId", () => {
    const existing: JobRecord = {
      id: "j-1",
      companyId: "c-1",
      jobSourceId: "src-1",
      title: "Legal Specialist",
      description: "Legal compliance description",
      externalJobId: "ext-12345",
      contentHash: "hash-1",
      status: "ACTIVE" as any,
      seenAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const res = checkJobDuplicate(
      {
        jobSourceId: "src-1",
        externalJobId: "ext-12345",
        title: "Legal Specialist",
        companyName: "Law Firm A",
        description: "Different description",
      },
      [existing],
    );

    expect(res.isDuplicate).toBe(true);
    expect(res.duplicateOf?.id).toBe("j-1");
  });

  it("detects cross-provider duplicates using title and company similarity", () => {
    const existing: JobRecord = {
      id: "j-2",
      companyId: "c-2",
      jobSourceId: "src-1",
      title: "Senior Tele-Sales Officer Retail Banking",
      description: "Outbound sales for retail loans",
      externalJobId: "ext-first",
      status: "ACTIVE" as any,
      seenAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      company: {
        id: "c-2",
        name: "Abu Dhabi Islamic Bank (ADIB)",
        normalizedName: "abu dhabi islamic bank adib",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };

    const res = checkJobDuplicate(
      {
        jobSourceId: "src-2", // Different source
        externalJobId: "ext-second",
        title: "Tele-Sales Officer - Retail Banking",
        companyName: "Abu Dhabi Islamic Bank",
        description: "Outbound sales campaigns",
      },
      [existing],
    );

    expect(res.isDuplicate).toBe(true);
  });
});

describe("Nayera Tarek Mohamed AI Matching Engine", () => {
  const ai = new RuleBasedAIProvider();

  it("evaluates high match for Legal Affairs roles based on LL.B, LL.M, and Diplomas", async () => {
    const candidateFacts = {
      firstName: "Nayera",
      lastName: "Tarek Mohamed",
      skills: ["Legal research", "Public Law", "Administrative Sciences", "Communication"],
    };

    const job = {
      title: "Corporate Legal Affairs Specialist",
      description: "Responsible for commercial contracts, corporate compliance, and legal research in Cairo.",
      location: "Cairo, Egypt",
    };

    const result = await ai.evaluateJobMatch(candidateFacts, job);
    expect(result.matchScore).toBeGreaterThanOrEqual(75);
    expect(result.category).toBe("STRONG_MATCH");
    expect(result.jobCategories).toContain(JobCategory.LEGAL);
    expect(result.strengths.length).toBeGreaterThan(0);
    expect(result.reasoning).toContain("Nayera");
  });

  it("evaluates high match for Banking Tele-Sales roles based on ADIB / ABK / Attijariwafa experience", async () => {
    const candidateFacts = {
      firstName: "Nayera",
      lastName: "Tarek Mohamed",
      skills: ["Banking Sales", "Telesales", "Target Achievement"],
    };

    const job = {
      title: "Senior Banking Tele-Sales Officer",
      description: "Outbound sales for retail loans and credit cards, achieving monthly sales targets.",
      location: "Heliopolis, Cairo, Egypt",
    };

    const result = await ai.evaluateJobMatch(candidateFacts, job);
    expect(result.matchScore).toBeGreaterThanOrEqual(75);
    expect(result.category).toBe("STRONG_MATCH");
    expect(result.jobCategories).toContain(JobCategory.BANKING);
  });

  it("generates grounded email draft without inventing facts", async () => {
    const candidateFacts = {
      firstName: "Nayera",
      lastName: "Tarek Mohamed",
      email: "tareknayera24@gmail.com",
    };

    const job = {
      title: "Legal & Compliance Officer",
      companyName: "Egypt Financial Corp",
      description: "Legal affairs, regulatory compliance, and contract drafting.",
    };

    const draft = await ai.generateEmailDraft(candidateFacts, job, {
      name: "HR Team",
      email: "careers@egyptfin.com",
    });

    expect(draft.subject).toContain("Nayera Tarek Mohamed");
    expect(draft.body).toContain("LL.M of Law");
    expect(draft.body).toContain("Banha University");
    expect(draft.body).toContain("Dr. Zein El-Abdeen Law Office");
    expect(draft.body).toContain("tareknayera24@gmail.com");
  });
});

describe("Candidate Eligibility Quality Gate & 4-Tier Priority Engine", () => {
  it("assigns HIGH_PRIORITY (score >= 85) to Legal Affairs, Compliance & Contracts roles", () => {
    const legalJob = {
      title: "Senior Legal Affairs Specialist - Labor Law & Compliance",
      description: "Handling company legal affairs, statutory compliance, labor law, contract review and drafting.",
      location: "Cairo, Egypt",
    };
    const evalResult = evaluateCandidateEligibility(legalJob);
    expect(evalResult.priorityTier).toBe("HIGH_PRIORITY");
    expect(evalResult.eligibilityScore).toBeGreaterThanOrEqual(85);
    expect(evalResult.isEligibleForApplication).toBe(true);
    expect(evalResult.qualificationAlignment.hasLawDegree).toBe(true);
    expect(evalResult.qualificationAlignment.hasPublicLawDiploma).toBe(true);
  });

  it("assigns GOOD_MATCH (score 70-84) to Banking Tele-Sales and Recruitment roles", () => {
    const bankJob = {
      title: "Retail Banking Tele-Sales Officer",
      description: "Outbound sales for consumer loans and credit cards, achieving aggressive monthly targets.",
      location: "New Cairo, Egypt",
    };
    const evalResult = evaluateCandidateEligibility(bankJob);
    expect(evalResult.priorityTier).toBe("GOOD_MATCH");
    expect(evalResult.eligibilityScore).toBeGreaterThanOrEqual(70);
    expect(evalResult.eligibilityScore).toBeLessThan(85);
    expect(evalResult.isEligibleForApplication).toBe(true);
    expect(evalResult.experienceAlignment.hasBankingExperience).toBe(true);
    expect(evalResult.experienceAlignment.hasTelesalesExperience).toBe(true);

    const hrJob = {
      title: "Recruitment Specialist",
      description: "Managing candidate pipeline, conducting interviews, and talent acquisition screening.",
      location: "Giza, Egypt",
    };
    const evalHr = evaluateCandidateEligibility(hrJob);
    expect(evalHr.priorityTier).toBe("GOOD_MATCH");
    expect(evalHr.isEligibleForApplication).toBe(true);
    expect(evalHr.experienceAlignment.hasRecruitmentExperience).toBe(true);
  });

  it("assigns LOW_MATCH (score 50-69) to loosely related or general administrative roles", () => {
    const adminJob = {
      title: "General Office Assistant & Receptionist",
      description: "Managing office supplies, handling phone inquiries, greeting visitors.",
      location: "Cairo, Egypt",
    };
    const evalResult = evaluateCandidateEligibility(adminJob);
    expect(evalResult.priorityTier).toBe("LOW_MATCH");
    expect(evalResult.eligibilityScore).toBeGreaterThanOrEqual(50);
    expect(evalResult.eligibilityScore).toBeLessThan(70);
    expect(evalResult.isEligibleForApplication).toBe(false);
  });

  it("assigns REJECT (score < 50) and blocks application for technical/software/disqualified roles", () => {
    const techJobs = [
      { title: "Fullstack React / Node.js Software Engineer", description: "Build web apps in React and TypeScript." },
      { title: "Semiconductor and Microelectronics Specialist", description: "Design chip wafer testing architecture." },
      { title: "Chemistry Specialist", description: "Conduct chemical synthesis and laboratory chromatography." },
      { title: "WordPress Developer & Specialist", description: "Custom PHP plugins and WordPress theme development." },
      { title: "WMS Specialist", description: "Warehouse management system configuration and SQL scripting." },
    ];

    for (const job of techJobs) {
      const evalResult = evaluateCandidateEligibility(job);
      expect(evalResult.priorityTier).toBe("REJECT");
      expect(evalResult.eligibilityScore).toBeLessThan(50);
      expect(evalResult.isEligibleForApplication).toBe(false);
      expect(evalResult.missingCriticalRequirements.length).toBeGreaterThan(0);
    }
  });
});
