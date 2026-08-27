import type { EmploymentType, JobSourceRecord } from "../../store/db-store.js";
import type { JobCategory } from "../categories/job-category.js";

export type AdapterStatus =
  | "SUCCESS"
  | "SOURCE_NOT_CONFIGURED"
  | "RATE_LIMITED"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "DISABLED";

export interface NormalizedJob {
  externalJobId?: string;
  title: string;
  companyName: string;
  companyWebsiteUrl?: string;
  location?: string;
  employmentType?: EmploymentType;
  description: string;
  sourceUrl?: string;
  canonicalUrl?: string;
  postedAt?: Date;
  categories: JobCategory[];
  rawMetadata?: Record<string, any>;
}

export interface AdapterFetchOptions {
  keywords?: string[];
  location?: string;
  limit?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface AdapterFetchResult {
  status: AdapterStatus;
  sourceId: string;
  sourceName: string;
  jobs: NormalizedJob[];
  missingConfig?: string;
  errorMessage?: string;
  fetchedAt: Date;
  rawCount: number;
}

export interface JobSourceAdapter {
  readonly id: string;
  readonly name: string;
  readonly isConfigured: boolean;
  getMissingConfiguration(): string | null;
  fetchJobs(
    source: JobSourceRecord,
    options?: AdapterFetchOptions,
  ): Promise<AdapterFetchResult>;
}
