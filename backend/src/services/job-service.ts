import { randomUUID } from "node:crypto";
import { prisma } from "../config/prisma.js";
import {
  EmploymentType,
  JobStatus,
  JobSourceType,
  type CompanyRecord,
  type JobRecord,
  isDbConnected,
  isValidUuid,
  memoryStore,
} from "../store/db-store.js";
import { AppError } from "../utils/app-error.js";
import { getAdapterForSource } from "./adapters/adapter-registry.js";
import type { AdapterStatus, NormalizedJob } from "./adapters/types.js";
import { createAuditLog } from "./audit-service.js";
import {
  classifyJobCategories,
  JobCategory,
} from "./categories/job-category.js";
import {
  checkJobDuplicate,
  computeJobContentHash,
  extractExternalJobId,
  normalizeUrl,
} from "./deduplication-service.js";
import { getJobSourceById } from "./job-source-service.js";
import { getAllSearchKeywords, getNayeraSearchPlan } from "./search-strategy.js";

import { isEgyptLocationCompatible } from "./eligibility-service.js";

export interface JobFilterParams {
  category?: JobCategory | string;
  companyId?: string;
  employmentType?: EmploymentType;
  jobSourceId?: string;
  location?: string;
  search?: string;
  status?: JobStatus;
}

export interface CreateJobInput {
  canonicalUrl?: string;
  categories?: JobCategory[];
  companyName: string;
  companyWebsiteUrl?: string;
  description: string;
  employmentType?: EmploymentType;
  externalJobId?: string;
  jobSourceId: string;
  location?: string;
  postedAt?: Date;
  rawReferenceMetadata?: any;
  sourceUrl?: string;
  title: string;
}

export interface QueryExecutionInstrumentation {
  source: string;
  trackId: string;
  trackName: string;
  query: string;
  language: string;
  location: string;
  rawResultCount: number;
  acceptedResultCount: number;
  rejectedResultCount: number;
  duplicateCount: number;
  elapsedMs: number;
  status: string;
  failureReason?: string;
}

export interface DuplicateBreakdown {
  duplicateByExternalId: number;
  duplicateByCanonicalUrl: number;
  duplicateByContentHash: number;
  duplicateByNormalizedIdentity: number;
}

export interface IngestSourceResult {
  duplicatesSkipped: number;
  duplicateBreakdown?: DuplicateBreakdown;
  errorMessage?: string;
  foreignJobsRejected?: number;
  ingestedCount: number;
  jobs: JobRecord[];
  missingConfig?: string;
  queryMetrics?: QueryExecutionInstrumentation[];
  rawCount?: number;
  sourceName: string;
  status: AdapterStatus;
}

async function findOrCreateCompany(
  name: string,
  websiteUrl?: string,
  location?: string,
): Promise<CompanyRecord> {
  const normalizedName = name.trim().toLowerCase();
  let domain: string | null = null;
  if (websiteUrl) {
    try {
      domain = new URL(websiteUrl).hostname.replace(/^www\./, "");
    } catch {
      domain = null;
    }
  }

  if (await isDbConnected()) {
    let company = await prisma.company.findFirst({
      where: { normalizedName },
    });
    if (!company) {
      const id = randomUUID();
      const now = new Date();
      company = await prisma.company.create({
        data: {
          id,
          name: name.trim(),
          normalizedName,
          websiteUrl: websiteUrl || null,
          domain,
          location: location || null,
          createdAt: now,
          updatedAt: now,
        },
      });
    }
    memoryStore.companies.set(company.id, company as CompanyRecord);
    return company as CompanyRecord;
  }

  const existing = Array.from(memoryStore.companies.values()).find(
    (c) => c.normalizedName === normalizedName,
  );
  if (existing) {
    return existing;
  }

  const id = randomUUID();
  const now = new Date();
  const company: CompanyRecord = {
    id,
    name: name.trim(),
    normalizedName,
    websiteUrl: websiteUrl || null,
    domain,
    location: location || null,
    createdAt: now,
    updatedAt: now,
  };

  memoryStore.companies.set(id, company);
  return company;
}

export async function listJobs(filters: JobFilterParams = {}): Promise<JobRecord[]> {
  const categoryFilter = filters.category?.toUpperCase();

  if (await isDbConnected()) {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.jobSourceId) where.jobSourceId = filters.jobSourceId;
    if (filters.companyId) where.companyId = filters.companyId;
    if (filters.employmentType) where.employmentType = filters.employmentType;
    if (filters.location) {
      where.location = { contains: filters.location, mode: "insensitive" };
    }
    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: "insensitive" } },
        { description: { contains: filters.search, mode: "insensitive" } },
        { company: { name: { contains: filters.search, mode: "insensitive" } } },
      ];
    }
    const rawJobs = (await prisma.job.findMany({
      where,
      include: { company: true, jobSource: true },
      orderBy: { seenAt: "desc" },
    })) as JobRecord[];

    const mapped = rawJobs.map((j) => {
      const cats =
        j.categories ||
        (j.rawReferenceMetadata?.categories as string[]) ||
        classifyJobCategories(j.title, j.description);
      return {
        ...j,
        categories: cats,
      };
    });

    if (categoryFilter) {
      return mapped.filter((j) =>
        j.categories?.some((c) => c.toUpperCase() === categoryFilter),
      );
    }

    return mapped;
  }

  let jobs = Array.from(memoryStore.jobs.values());

  if (filters.status) {
    jobs = jobs.filter((j) => j.status === filters.status);
  }

  if (filters.jobSourceId) {
    jobs = jobs.filter((j) => j.jobSourceId === filters.jobSourceId);
  }

  if (filters.companyId) {
    jobs = jobs.filter((j) => j.companyId === filters.companyId);
  }

  if (filters.employmentType) {
    jobs = jobs.filter((j) => j.employmentType === filters.employmentType);
  }

  if (filters.location) {
    const loc = filters.location.toLowerCase();
    jobs = jobs.filter((j) => (j.location || "").toLowerCase().includes(loc));
  }

  if (filters.search) {
    const term = filters.search.toLowerCase();
    jobs = jobs.filter((j) => {
      const company = memoryStore.companies.get(j.companyId)?.name.toLowerCase() || "";
      return (
        j.title.toLowerCase().includes(term) ||
        j.description.toLowerCase().includes(term) ||
        company.includes(term)
      );
    });
  }

  const mapped = jobs.map((j) => {
    const cats =
      j.categories ||
      (j.rawReferenceMetadata?.categories as string[]) ||
      classifyJobCategories(j.title, j.description);
    return {
      ...j,
      categories: cats,
      company: memoryStore.companies.get(j.companyId),
      jobSource: memoryStore.jobSources.get(j.jobSourceId),
    };
  });

  const safeSort = (a: JobRecord, b: JobRecord) => {
    const timeA = a.seenAt ? new Date(a.seenAt).getTime() : a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.seenAt ? new Date(b.seenAt).getTime() : b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return timeB - timeA;
  };

  if (categoryFilter) {
    return mapped
      .filter((j) => j.categories?.some((c) => c.toUpperCase() === categoryFilter))
      .sort(safeSort);
  }

  return mapped.sort(safeSort);
}

export async function getJobById(id: string): Promise<JobRecord> {
  if (isValidUuid(id) && (await isDbConnected())) {
    const job = (await prisma.job.findUnique({
      where: { id },
      include: { company: true, jobSource: true },
    })) as JobRecord | null;
    if (job) {
      const cats =
        job.categories ||
        (job.rawReferenceMetadata?.categories as string[]) ||
        classifyJobCategories(job.title, job.description);
      return { ...job, categories: cats };
    }
  }

  const job = memoryStore.jobs.get(id);
  if (!job) {
    throw new AppError(`Job with ID ${id} not found.`, 404, "JOB_NOT_FOUND");
  }

  const cats =
    job.categories ||
    (job.rawReferenceMetadata?.categories as string[]) ||
    classifyJobCategories(job.title, job.description);

  return {
    ...job,
    categories: cats,
    company: memoryStore.companies.get(job.companyId),
    jobSource: memoryStore.jobSources.get(job.jobSourceId),
  };
}

export async function createJob(input: CreateJobInput): Promise<JobRecord> {
  const source = await getJobSourceById(input.jobSourceId);
  const company = await findOrCreateCompany(
    input.companyName,
    input.companyWebsiteUrl,
    input.location,
  );

  const contentHash = computeJobContentHash(
    input.title,
    input.companyName,
    input.description,
    input.location,
  );

  const categories =
    input.categories || classifyJobCategories(input.title, input.description);

  const rawMetadata = {
    ...(input.rawReferenceMetadata || {}),
    categories,
  };

  if (await isDbConnected()) {
    let dbJobSourceId = source.id;
    if (!isValidUuid(dbJobSourceId)) {
      const fallbackSource = await prisma.jobSource.findFirst();
      if (fallbackSource) {
        dbJobSourceId = fallbackSource.id;
      }
    }

    if (input.externalJobId) {
      const existingByExtId = await prisma.job.findFirst({
        where: { jobSourceId: dbJobSourceId, externalJobId: input.externalJobId },
      });
      if (existingByExtId) {
        return await getJobById(existingByExtId.id);
      }
    }

    const existingByHash = await prisma.job.findFirst({
      where: { contentHash },
    });
    if (existingByHash) {
      return await getJobById(existingByHash.id);
    }

    const canonicalUrl = normalizeUrl(input.canonicalUrl || input.sourceUrl) || input.sourceUrl || null;
    const externalJobId = input.externalJobId || extractExternalJobId(input.canonicalUrl || input.sourceUrl) || null;
    const id = randomUUID();
    const now = new Date();

    const job = (await prisma.job.create({
      data: {
        id,
        companyId: company.id,
        jobSourceId: dbJobSourceId,
        title: input.title.trim(),
        description: input.description.trim(),
        location: input.location || company.location || null,
        employmentType: input.employmentType || EmploymentType.FULL_TIME,
        sourceUrl: input.sourceUrl || null,
        externalJobId,
        canonicalUrl,
        contentHash,
        status: JobStatus.ACTIVE,
        postedAt: input.postedAt || now,
        seenAt: now,
        rawReferenceMetadata: rawMetadata,
        createdAt: now,
        updatedAt: now,
      },
    })) as JobRecord;

    const fullJob: JobRecord = {
      ...job,
      categories,
      company,
      jobSource: source,
    };

    memoryStore.jobs.set(id, fullJob);

    await createAuditLog({
      action: "JOB_INGESTED",
      resourceType: "Job",
      resourceId: id,
      eventType: "JOB_CREATED",
      safeMetadata: {
        title: job.title,
        company: company.name,
        source: source.name,
        categories,
      },
    });

    return fullJob;
  }

  // In-Memory Mode
  const existingList = Array.from(memoryStore.jobs.values());
  const canonicalUrl = normalizeUrl(input.canonicalUrl || input.sourceUrl) || input.sourceUrl || null;
  const externalJobId = input.externalJobId || extractExternalJobId(input.canonicalUrl || input.sourceUrl) || null;

  const duplicateCheck = checkJobDuplicate(
    {
      jobSourceId: source.id,
      externalJobId,
      canonicalUrl,
      sourceUrl: input.sourceUrl,
      title: input.title,
      companyName: company.name,
      location: input.location,
      description: input.description,
    },
    existingList,
  );

  if (duplicateCheck.isDuplicate && duplicateCheck.duplicateOf) {
    return getJobById(duplicateCheck.duplicateOf.id);
  }

  const id = randomUUID();
  const now = new Date();
  const job: JobRecord = {
    id,
    companyId: company.id,
    jobSourceId: source.id,
    title: input.title.trim(),
    description: input.description.trim(),
    location: input.location || company.location || null,
    employmentType: input.employmentType || EmploymentType.FULL_TIME,
    sourceUrl: input.sourceUrl || null,
    externalJobId,
    canonicalUrl,
    contentHash,
    categories,
    status: JobStatus.ACTIVE,
    postedAt: input.postedAt || now,
    seenAt: now,
    rawReferenceMetadata: rawMetadata,
    createdAt: now,
    updatedAt: now,
    company,
    jobSource: source,
  };

  memoryStore.jobs.set(id, job);

  await createAuditLog({
    action: "JOB_INGESTED",
    resourceType: "Job",
    resourceId: id,
    eventType: "JOB_CREATED",
    safeMetadata: {
      title: job.title,
      company: company.name,
      source: source.name,
      categories,
    },
  });

  return job;
}

export async function ingestJobsFromSource(
  sourceId: string,
  options?: { timeoutMs?: number; maxQueriesPerTrack?: number },
): Promise<IngestSourceResult> {
  const source = await getJobSourceById(sourceId);
  const adapter = getAdapterForSource(source);

  const duplicateBreakdown: DuplicateBreakdown = {
    duplicateByExternalId: 0,
    duplicateByCanonicalUrl: 0,
    duplicateByContentHash: 0,
    duplicateByNormalizedIdentity: 0,
  };
  let foreignJobsRejected = 0;
  const queryMetrics: QueryExecutionInstrumentation[] = [];

  // Check if adapter is configured
  if (!adapter.isConfigured) {
    const missing = adapter.getMissingConfiguration();
    return {
      status: "SOURCE_NOT_CONFIGURED",
      sourceName: source.name,
      missingConfig: missing || "Required credentials not configured",
      errorMessage: `Job source '${source.name}' is not configured: ${missing}`,
      ingestedCount: 0,
      duplicatesSkipped: 0,
      foreignJobsRejected: 0,
      duplicateBreakdown,
      jobs: [],
      rawCount: 0,
      queryMetrics: [],
    };
  }

  // 1. Handle RSS feeds or Direct Official Career APIs (Single endpoint fetch)
  if (source.type === JobSourceType.RSS_FEED || adapter.id === "official-api") {
    const startTime = Date.now();
    const fetchResult = await adapter.fetchJobs(source, {
      keywords: getAllSearchKeywords(),
      location: "Egypt",
      limit: 50,
      timeoutMs: options?.timeoutMs,
    });
    const elapsedMs = Date.now() - startTime;

    if (fetchResult.status !== "SUCCESS") {
      queryMetrics.push({
        source: source.name,
        trackId: "feed-direct",
        trackName: "Direct Feed/API Ingestion",
        query: "all-vacancies",
        language: "ANY",
        location: "Egypt",
        rawResultCount: fetchResult.rawCount,
        acceptedResultCount: 0,
        rejectedResultCount: 0,
        duplicateCount: 0,
        elapsedMs,
        status: fetchResult.status,
        failureReason: fetchResult.errorMessage,
      });

      return {
        status: fetchResult.status,
        sourceName: source.name,
        missingConfig: fetchResult.missingConfig,
        errorMessage: fetchResult.errorMessage,
        ingestedCount: 0,
        duplicatesSkipped: 0,
        foreignJobsRejected: 0,
        duplicateBreakdown,
        jobs: [],
        rawCount: fetchResult.rawCount,
        queryMetrics,
      };
    }

    let ingestedCount = 0;
    let duplicatesSkipped = 0;
    let queryAccepted = 0;
    let queryRejected = 0;
    let queryDup = 0;
    const createdJobs: JobRecord[] = [];
    const existingJobs = await listJobs();

    for (const item of fetchResult.jobs) {
      // Authoritative Egypt location check
      if (!isEgyptLocationCompatible(item.location, item.title, item.description)) {
        foreignJobsRejected++;
        queryRejected++;
        continue;
      }

      const dupResult = checkJobDuplicate(
        {
          jobSourceId: source.id,
          externalJobId: item.externalJobId,
          canonicalUrl: item.canonicalUrl,
          sourceUrl: item.sourceUrl,
          title: item.title,
          companyName: item.companyName,
          location: item.location,
          description: item.description,
        },
        existingJobs,
      );

      if (dupResult.isDuplicate) {
        duplicatesSkipped++;
        queryDup++;
        if (dupResult.duplicateType === "EXTERNAL_ID") duplicateBreakdown.duplicateByExternalId++;
        else if (dupResult.duplicateType === "CANONICAL_URL") duplicateBreakdown.duplicateByCanonicalUrl++;
        else if (dupResult.duplicateType === "CONTENT_HASH") duplicateBreakdown.duplicateByContentHash++;
        else if (dupResult.duplicateType === "NORMALIZED_IDENTITY") duplicateBreakdown.duplicateByNormalizedIdentity++;
      } else {
        const newJob = await createJob({
          jobSourceId: source.id,
          title: item.title,
          companyName: item.companyName,
          companyWebsiteUrl: item.companyWebsiteUrl,
          location: item.location,
          employmentType: item.employmentType,
          description: item.description,
          sourceUrl: item.sourceUrl,
          canonicalUrl: item.canonicalUrl,
          externalJobId: item.externalJobId,
          postedAt: item.postedAt,
          categories: item.categories,
          rawReferenceMetadata: {
            ...(item.rawMetadata || {}),
            provider: source.name,
            discoveredAt: new Date().toISOString(),
          },
        });
        createdJobs.push(newJob);
        existingJobs.push(newJob);
        ingestedCount++;
        queryAccepted++;
      }
    }

    queryMetrics.push({
      source: source.name,
      trackId: "feed-direct",
      trackName: "Direct Feed/API Ingestion",
      query: "all-vacancies",
      language: "ANY",
      location: "Egypt",
      rawResultCount: fetchResult.rawCount,
      acceptedResultCount: queryAccepted,
      rejectedResultCount: queryRejected,
      duplicateCount: queryDup,
      elapsedMs,
      status: "SUCCESS",
    });

    await createAuditLog({
      action: "INGESTION_RUN_COMPLETED",
      resourceType: "JobSource",
      resourceId: source.id,
      eventType: "INGESTION_BATCH",
      safeMetadata: {
        sourceName: source.name,
        ingestedCount,
        duplicatesSkipped,
        foreignJobsRejected,
        status: "SUCCESS",
      },
    });

    return {
      status: "SUCCESS",
      sourceName: source.name,
      ingestedCount,
      duplicatesSkipped,
      foreignJobsRejected,
      duplicateBreakdown,
      jobs: createdJobs,
      rawCount: fetchResult.rawCount,
      queryMetrics,
    };
  }

  // 2. Multi-Track Search Plan Execution for Search Providers (Jooble, Adzuna, Job Boards)
  // By default, executes the complete 49-query search plan (35 English + 14 Arabic, 7 tracks)
  const searchPlan = getNayeraSearchPlan(
    options?.maxQueriesPerTrack ? { maxQueriesPerTrack: options.maxQueriesPerTrack } : undefined,
  );

  let totalRawCount = 0;
  let ingestedCount = 0;
  let duplicatesSkipped = 0;
  const createdJobs: JobRecord[] = [];
  const existingJobs = await listJobs();
  let lastStatus: AdapterStatus = "SUCCESS";
  let lastErrorMessage: string | undefined;

  for (const queryItem of searchPlan) {
    const qStartTime = Date.now();
    let qRawCount = 0;
    let qAccepted = 0;
    let qRejected = 0;
    let qDup = 0;
    let qStatus = "SUCCESS";
    let qError: string | undefined;

    try {
      const fetchResult = await adapter.fetchJobs(source, {
        keywords: [queryItem.query],
        location: queryItem.location,
        limit: 15,
        timeoutMs: options?.timeoutMs,
      });

      qRawCount = fetchResult.rawCount;
      totalRawCount += fetchResult.rawCount;
      qStatus = fetchResult.status;
      qError = fetchResult.errorMessage;

      if (fetchResult.status !== "SUCCESS") {
        lastStatus = fetchResult.status;
        lastErrorMessage = fetchResult.errorMessage;
        queryMetrics.push({
          source: source.name,
          trackId: queryItem.trackId,
          trackName: queryItem.trackName,
          query: queryItem.query,
          language: queryItem.language,
          location: queryItem.location,
          rawResultCount: qRawCount,
          acceptedResultCount: 0,
          rejectedResultCount: 0,
          duplicateCount: 0,
          elapsedMs: Date.now() - qStartTime,
          status: fetchResult.status,
          failureReason: fetchResult.errorMessage,
        });

        if (
          fetchResult.status === "SOURCE_NOT_CONFIGURED" ||
          fetchResult.status === "CAPABILITY_UNSUPPORTED" ||
          fetchResult.status === "RATE_LIMITED"
        ) {
          break; // Stop immediately on unconfigured / unsupported capability / rate-limited
        }
        continue;
      }

      for (const item of fetchResult.jobs) {
        // Quality Gate: verify Egypt location compatibility
        if (!isEgyptLocationCompatible(item.location, item.title, item.description)) {
          foreignJobsRejected++;
          qRejected++;
          continue;
        }

        const dupResult = checkJobDuplicate(
          {
            jobSourceId: source.id,
            externalJobId: item.externalJobId,
            canonicalUrl: item.canonicalUrl,
            sourceUrl: item.sourceUrl,
            title: item.title,
            companyName: item.companyName,
            location: item.location,
            description: item.description,
          },
          existingJobs,
        );

        if (dupResult.isDuplicate) {
          duplicatesSkipped++;
          qDup++;
          if (dupResult.duplicateType === "EXTERNAL_ID") duplicateBreakdown.duplicateByExternalId++;
          else if (dupResult.duplicateType === "CANONICAL_URL") duplicateBreakdown.duplicateByCanonicalUrl++;
          else if (dupResult.duplicateType === "CONTENT_HASH") duplicateBreakdown.duplicateByContentHash++;
          else if (dupResult.duplicateType === "NORMALIZED_IDENTITY") duplicateBreakdown.duplicateByNormalizedIdentity++;
        } else {
          const newJob = await createJob({
            jobSourceId: source.id,
            title: item.title,
            companyName: item.companyName,
            companyWebsiteUrl: item.companyWebsiteUrl,
            location: item.location,
            employmentType: item.employmentType,
            description: item.description,
            sourceUrl: item.sourceUrl,
            canonicalUrl: item.canonicalUrl,
            externalJobId: item.externalJobId,
            postedAt: item.postedAt,
            categories: item.categories,
            rawReferenceMetadata: {
              ...(item.rawMetadata || {}),
              trackId: queryItem.trackId,
              trackName: queryItem.trackName,
              searchQuery: queryItem.query,
              searchLanguage: queryItem.language,
              searchLocation: queryItem.location,
              searchPriority: queryItem.priority,
              provider: source.name,
              discoveredAt: new Date().toISOString(),
            },
          });
          createdJobs.push(newJob);
          existingJobs.push(newJob);
          ingestedCount++;
          qAccepted++;
        }
      }

      queryMetrics.push({
        source: source.name,
        trackId: queryItem.trackId,
        trackName: queryItem.trackName,
        query: queryItem.query,
        language: queryItem.language,
        location: queryItem.location,
        rawResultCount: qRawCount,
        acceptedResultCount: qAccepted,
        rejectedResultCount: qRejected,
        duplicateCount: qDup,
        elapsedMs: Date.now() - qStartTime,
        status: "SUCCESS",
      });

      // Brief gentle pacing between API queries to respect rate limits
      await new Promise((resolve) => setTimeout(resolve, 30));
    } catch (err) {
      queryMetrics.push({
        source: source.name,
        trackId: queryItem.trackId,
        trackName: queryItem.trackName,
        query: queryItem.query,
        language: queryItem.language,
        location: queryItem.location,
        rawResultCount: qRawCount,
        acceptedResultCount: qAccepted,
        rejectedResultCount: qRejected,
        duplicateCount: qDup,
        elapsedMs: Date.now() - qStartTime,
        status: "NETWORK_ERROR",
        failureReason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const finalStatus = (createdJobs.length > 0 || duplicatesSkipped > 0) ? "SUCCESS" : lastStatus;

  await createAuditLog({
    action: "INGESTION_RUN_COMPLETED",
    resourceType: "JobSource",
    resourceId: source.id,
    eventType: "INGESTION_BATCH",
    safeMetadata: {
      sourceName: source.name,
      ingestedCount,
      duplicatesSkipped,
      foreignJobsRejected,
      status: finalStatus,
      queriesExecuted: queryMetrics.length,
      tracksSearched: 7,
    },
  });

  return {
    status: finalStatus,
    sourceName: source.name,
    ingestedCount,
    duplicatesSkipped,
    foreignJobsRejected,
    duplicateBreakdown,
    jobs: createdJobs,
    rawCount: totalRawCount,
    errorMessage: lastErrorMessage,
    queryMetrics,
  };
}
