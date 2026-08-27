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

export interface IngestSourceResult {
  duplicatesSkipped: number;
  errorMessage?: string;
  ingestedCount: number;
  jobs: JobRecord[];
  missingConfig?: string;
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

  if (categoryFilter) {
    return mapped
      .filter((j) => j.categories?.some((c) => c.toUpperCase() === categoryFilter))
      .sort((a, b) => b.seenAt.getTime() - a.seenAt.getTime());
  }

  return mapped.sort((a, b) => b.seenAt.getTime() - a.seenAt.getTime());
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
    if (input.externalJobId) {
      const existingByExtId = await prisma.job.findFirst({
        where: { jobSourceId: source.id, externalJobId: input.externalJobId },
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
        jobSourceId: source.id,
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
      jobs: [],
      rawCount: 0,
    };
  }

  // 1. Handle RSS feeds or Direct Official Career APIs (Single endpoint fetch)
  if (source.type === JobSourceType.RSS_FEED || adapter.id === "official-api") {
    const fetchResult = await adapter.fetchJobs(source, {
      keywords: getAllSearchKeywords(),
      location: "Egypt",
      limit: 30,
      timeoutMs: options?.timeoutMs,
    });

    if (fetchResult.status !== "SUCCESS") {
      return {
        status: fetchResult.status,
        sourceName: source.name,
        missingConfig: fetchResult.missingConfig,
        errorMessage: fetchResult.errorMessage,
        ingestedCount: 0,
        duplicatesSkipped: 0,
        jobs: [],
        rawCount: fetchResult.rawCount,
      };
    }

    let ingestedCount = 0;
    let duplicatesSkipped = 0;
    const createdJobs: JobRecord[] = [];
    const existingJobs = await listJobs();

    for (const item of fetchResult.jobs) {
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
      }
    }

    await createAuditLog({
      action: "INGESTION_RUN_COMPLETED",
      resourceType: "JobSource",
      resourceId: source.id,
      eventType: "INGESTION_BATCH",
      safeMetadata: {
        sourceName: source.name,
        ingestedCount,
        duplicatesSkipped,
        status: "SUCCESS",
      },
    });

    return {
      status: "SUCCESS",
      sourceName: source.name,
      ingestedCount,
      duplicatesSkipped,
      jobs: createdJobs,
      rawCount: fetchResult.rawCount,
    };
  }

  // 2. Multi-Track Search Plan Execution for Search Providers (Jooble, Adzuna, Job Boards)
  const searchPlan = getNayeraSearchPlan({
    maxQueriesPerTrack: options?.maxQueriesPerTrack ?? 2,
  });

  let totalRawCount = 0;
  let ingestedCount = 0;
  let duplicatesSkipped = 0;
  const createdJobs: JobRecord[] = [];
  const existingJobs = await listJobs();
  let lastStatus: AdapterStatus = "SUCCESS";
  let lastErrorMessage: string | undefined;

  for (const queryItem of searchPlan) {
    try {
      const fetchResult = await adapter.fetchJobs(source, {
        keywords: [queryItem.query],
        location: queryItem.location,
        limit: 15,
        timeoutMs: options?.timeoutMs,
      });

      totalRawCount += fetchResult.rawCount;

      if (fetchResult.status !== "SUCCESS") {
        lastStatus = fetchResult.status;
        lastErrorMessage = fetchResult.errorMessage;
        if (
          fetchResult.status === "SOURCE_NOT_CONFIGURED" ||
          fetchResult.status === "RATE_LIMITED"
        ) {
          break; // Don't repeat unconfigured/rate-limited queries
        }
        continue;
      }

      for (const item of fetchResult.jobs) {
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
        }
      }
    } catch {
      // Continue to next query safely without breaking the loop
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
      status: finalStatus,
      tracksSearched: 7,
    },
  });

  return {
    status: finalStatus,
    sourceName: source.name,
    ingestedCount,
    duplicatesSkipped,
    jobs: createdJobs,
    rawCount: totalRawCount,
    errorMessage: lastErrorMessage,
  };
}
