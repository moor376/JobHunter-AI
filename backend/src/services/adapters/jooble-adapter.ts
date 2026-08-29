import { EmploymentType, type JobSourceRecord } from "../../store/db-store.js";
import { classifyJobCategories } from "../categories/job-category.js";
import { extractExternalJobId, normalizeUrl } from "../deduplication-service.js";
import { isEgyptLocationCompatible } from "../eligibility-service.js";
import {
  createTimeoutController,
  isTimeoutError,
  MAX_ADAPTER_TIMEOUT_MS,
} from "./http-timeout.js";
import type {
  AdapterFetchOptions,
  AdapterFetchResult,
  JobSourceAdapter,
  NormalizedJob,
} from "./types.js";

export class JoobleAdapter implements JobSourceAdapter {
  public readonly id = "jooble";
  public readonly name = "Jooble Real Jobs API";

  private getApiKey(): string | undefined {
    return process.env.JOOBLE_API_KEY?.trim();
  }

  public get isConfigured(): boolean {
    const key = this.getApiKey();
    return Boolean(key && key.length > 3 && key !== "your_jooble_api_key");
  }

  public getMissingConfiguration(): string | null {
    if (!this.isConfigured) {
      return "JOOBLE_API_KEY environment variable is not configured";
    }
    return null;
  }

  private mapEmploymentType(rawType?: string): EmploymentType {
    if (!rawType) return EmploymentType.FULL_TIME;
    const lower = rawType.toLowerCase();
    if (lower.includes("part")) return EmploymentType.PART_TIME;
    if (lower.includes("contract")) return EmploymentType.CONTRACT;
    if (lower.includes("intern")) return EmploymentType.INTERNSHIP;
    if (lower.includes("temp")) return EmploymentType.TEMPORARY;
    if (lower.includes("free")) return EmploymentType.FREELANCE;
    return EmploymentType.FULL_TIME;
  }

  public async fetchJobs(
    source: JobSourceRecord,
    options: AdapterFetchOptions = {},
  ): Promise<AdapterFetchResult> {
    const apiKey = this.getApiKey();
    const fetchedAt = new Date();

    if (!this.isConfigured || !apiKey) {
      return {
        status: "SOURCE_NOT_CONFIGURED",
        sourceId: source.id,
        sourceName: source.name,
        jobs: [],
        missingConfig: "JOOBLE_API_KEY",
        errorMessage: "Jooble API Key is missing. Set JOOBLE_API_KEY in environment.",
        fetchedAt,
        rawCount: 0,
      };
    }

    const keywords = (options.keywords && options.keywords.length > 0)
      ? options.keywords.slice(0, 5).join(" OR ")
      : "Legal Affairs OR Banking OR Telesales OR Recruitment";

    const location = options.location || "Egypt";
    const baseUrl = (source.baseUrl && source.baseUrl.startsWith("http"))
      ? source.baseUrl.replace(/\/+$/, "")
      : "https://jooble.org/api";
    const endpoint = baseUrl.includes(encodeURIComponent(apiKey))
      ? baseUrl
      : `${baseUrl}/${encodeURIComponent(apiKey)}`;

    const { signal, cleanup, effectiveTimeoutMs, controller } =
      createTimeoutController({
        timeoutMs: options.timeoutMs,
        parentSignal: options.signal,
      });

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "JobHunter-AI/1.0",
        },
        body: JSON.stringify({
          keywords,
          location,
          page: 1,
        }),
        signal,
      });

      if (response.status === 401 || response.status === 403) {
        return {
          status: "SOURCE_NOT_CONFIGURED",
          sourceId: source.id,
          sourceName: source.name,
          jobs: [],
          missingConfig: "JOOBLE_API_KEY (Invalid Key)",
          errorMessage: `Jooble API rejected credentials with HTTP ${response.status}`,
          fetchedAt,
          rawCount: 0,
        };
      }

      if (response.status === 429) {
        return {
          status: "RATE_LIMITED",
          sourceId: source.id,
          sourceName: source.name,
          jobs: [],
          errorMessage: "Jooble API rate limit exceeded.",
          fetchedAt,
          rawCount: 0,
        };
      }

      if (!response.ok) {
        return {
          status: "NETWORK_ERROR",
          sourceId: source.id,
          sourceName: source.name,
          jobs: [],
          errorMessage: `Jooble API returned HTTP error ${response.status}: ${response.statusText}`,
          fetchedAt,
          rawCount: 0,
        };
      }

      const data = (await response.json()) as any;
      const rawJobs: any[] = Array.isArray(data.jobs) ? data.jobs : [];

      const isEgyptSearch = isEgyptLocationCompatible(location);
      const normalizedJobs: NormalizedJob[] = [];

      for (const item of rawJobs) {
        const title = (item.title || "Job Opening").trim();
        const description = (item.snippet || item.description || title).trim();
        const companyName = (item.company || "Direct Employer").trim();
        const jobLocation = (item.location || location).trim();

        if (isEgyptSearch && !isEgyptLocationCompatible(jobLocation, title, description)) {
          continue;
        }

        const sourceUrl = item.link || undefined;
        const externalId = (item.id ? String(item.id) : null) || extractExternalJobId(sourceUrl);
        const canonicalUrl = normalizeUrl(sourceUrl) || (externalId ? `https://jooble.org/desc/${externalId}` : sourceUrl);
        const postedAt = item.updated ? new Date(item.updated) : new Date();
        const employmentType = this.mapEmploymentType(item.type);
        const categories = classifyJobCategories(title, description);

        normalizedJobs.push({
          externalJobId: externalId || undefined,
          title,
          companyName,
          location: jobLocation,
          employmentType,
          description,
          sourceUrl,
          canonicalUrl,
          postedAt: isNaN(postedAt.getTime()) ? new Date() : postedAt,
          categories,
          rawMetadata: {
            salary: item.salary,
            type: item.type,
            source: "jooble",
          },
        });
      }

      return {
        status: "SUCCESS",
        sourceId: source.id,
        sourceName: source.name,
        jobs: normalizedJobs,
        fetchedAt,
        rawCount: rawJobs.length,
      };
    } catch (err: unknown) {
      if (isTimeoutError(err, controller)) {
        return {
          status: "TIMEOUT",
          sourceId: source.id,
          sourceName: source.name,
          jobs: [],
          errorMessage: `Jooble API request timed out after ${effectiveTimeoutMs}ms (hard limit: ${MAX_ADAPTER_TIMEOUT_MS / 1000}s).`,
          fetchedAt,
          rawCount: 0,
        };
      }

      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        status: "NETWORK_ERROR",
        sourceId: source.id,
        sourceName: source.name,
        jobs: [],
        errorMessage: `Failed to query Jooble API: ${errorMsg}`,
        fetchedAt,
        rawCount: 0,
      };
    } finally {
      cleanup();
    }
  }
}
