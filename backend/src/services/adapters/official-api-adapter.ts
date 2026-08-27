import { EmploymentType, type JobSourceRecord } from "../../store/db-store.js";
import { classifyJobCategories } from "../categories/job-category.js";
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

export class OfficialApiAdapter implements JobSourceAdapter {
  public readonly id = "official-api";
  public readonly name = "Official Employer Career API Adapter";

  public get isConfigured(): boolean {
    return true;
  }

  public getMissingConfiguration(): string | null {
    return null;
  }

  public async fetchJobs(
    source: JobSourceRecord,
    options: AdapterFetchOptions = {},
  ): Promise<AdapterFetchResult> {
    const fetchedAt = new Date();

    if (!source.baseUrl || !source.baseUrl.startsWith("http")) {
      return {
        status: "SOURCE_NOT_CONFIGURED",
        sourceId: source.id,
        sourceName: source.name,
        jobs: [],
        missingConfig: "baseUrl (Valid API endpoint URL required)",
        errorMessage: `Source '${source.name}' does not have a valid API endpoint configured.`,
        fetchedAt,
        rawCount: 0,
      };
    }

    const { signal, cleanup, effectiveTimeoutMs, controller } =
      createTimeoutController({
        timeoutMs: options.timeoutMs,
        parentSignal: options.signal,
      });

    try {
      const response = await fetch(source.baseUrl, {
        headers: {
          Accept: "application/json",
          "User-Agent": "JobHunter-AI/1.0",
        },
        signal,
      });

      if (!response.ok) {
        return {
          status: "NETWORK_ERROR",
          sourceId: source.id,
          sourceName: source.name,
          jobs: [],
          errorMessage: `Official API returned HTTP ${response.status}: ${response.statusText}`,
          fetchedAt,
          rawCount: 0,
        };
      }

      const json = (await response.json()) as any;
      let rawList: any[] = [];

      if (Array.isArray(json)) {
        rawList = json;
      } else if (Array.isArray(json.jobs)) {
        rawList = json.jobs;
      } else if (Array.isArray(json.postings)) {
        rawList = json.postings;
      } else if (Array.isArray(json.positions)) {
        rawList = json.positions;
      } else if (Array.isArray(json.data)) {
        rawList = json.data;
      } else if (Array.isArray(json.results)) {
        rawList = json.results;
      }

      const normalizedJobs: NormalizedJob[] = rawList.map((item) => {
        const title = (item.title || item.name || item.role || "Job Opening").trim();
        const description = (
          item.description ||
          item.snippet ||
          item.content ||
          item.summary ||
          title
        ).trim();
        const companyName = (
          item.company?.name ||
          item.company ||
          source.name
        ).trim();
        const location =
          typeof item.location === "object"
            ? item.location?.name || item.location?.city || "Egypt"
            : item.location || "Egypt";
        const externalId = item.id ? String(item.id) : undefined;
        const sourceUrl =
          item.url || item.absolute_url || item.applyUrl || item.link || source.baseUrl;
        const postedAt = item.updated_at || item.created_at || item.postedAt;
        const categories = classifyJobCategories(title, description);

        return {
          externalJobId: externalId,
          title,
          companyName,
          location,
          employmentType: EmploymentType.FULL_TIME,
          description,
          sourceUrl,
          canonicalUrl: sourceUrl,
          postedAt: postedAt ? new Date(postedAt) : new Date(),
          categories,
          rawMetadata: {
            source: "official-api",
            apiBaseUrl: source.baseUrl,
          },
        };
      });

      return {
        status: "SUCCESS",
        sourceId: source.id,
        sourceName: source.name,
        jobs: normalizedJobs,
        fetchedAt,
        rawCount: rawList.length,
      };
    } catch (err: unknown) {
      if (isTimeoutError(err, controller)) {
        return {
          status: "TIMEOUT",
          sourceId: source.id,
          sourceName: source.name,
          jobs: [],
          errorMessage: `Official API request timed out after ${effectiveTimeoutMs}ms (hard limit: ${MAX_ADAPTER_TIMEOUT_MS / 1000}s) for URL '${source.baseUrl}'.`,
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
        errorMessage: `Failed to query official career API: ${errorMsg}`,
        fetchedAt,
        rawCount: 0,
      };
    } finally {
      cleanup();
    }
  }
}
