import { EmploymentType, type JobSourceRecord } from "../../store/db-store.js";
import { classifyJobCategories } from "../categories/job-category.js";
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

export const SUPPORTED_ADZUNA_COUNTRIES = new Set([
  "gb", "us", "at", "au", "be", "br", "ca", "ch", "de", "es",
  "fr", "in", "it", "mx", "nl", "nz", "pl", "ru", "sg", "za",
]);

export class AdzunaAdapter implements JobSourceAdapter {
  public readonly id = "adzuna";
  public readonly name = "Adzuna Real Jobs API";

  private getAppId(): string | undefined {
    return process.env.ADZUNA_APP_ID?.trim();
  }

  private getAppKey(): string | undefined {
    return process.env.ADZUNA_APP_KEY?.trim();
  }

  public get isConfigured(): boolean {
    const appId = this.getAppId();
    const appKey = this.getAppKey();
    return Boolean(
      appId &&
        appKey &&
        appId.length > 2 &&
        appKey.length > 5 &&
        appId !== "your_adzuna_app_id",
    );
  }

  public getMissingConfiguration(): string | null {
    if (!this.isConfigured) {
      return "ADZUNA_APP_ID and ADZUNA_APP_KEY environment variables are required";
    }
    return null;
  }

  private mapEmploymentType(contractType?: string, contractTime?: string): EmploymentType {
    const combined = `${contractType || ""} ${contractTime || ""}`.toLowerCase();
    if (combined.includes("part_time") || combined.includes("part-time")) {
      return EmploymentType.PART_TIME;
    }
    if (combined.includes("contract")) return EmploymentType.CONTRACT;
    if (combined.includes("intern")) return EmploymentType.INTERNSHIP;
    return EmploymentType.FULL_TIME;
  }

  public async fetchJobs(
    source: JobSourceRecord,
    options: AdapterFetchOptions = {},
  ): Promise<AdapterFetchResult> {
    const appId = this.getAppId();
    const appKey = this.getAppKey();
    const fetchedAt = new Date();

    if (!this.isConfigured || !appId || !appKey) {
      return {
        status: "SOURCE_NOT_CONFIGURED",
        sourceId: source.id,
        sourceName: source.name,
        jobs: [],
        missingConfig: "ADZUNA_APP_ID / ADZUNA_APP_KEY",
        errorMessage:
          "Adzuna API credentials missing. Set ADZUNA_APP_ID and ADZUNA_APP_KEY in environment.",
        fetchedAt,
        rawCount: 0,
      };
    }

    const keywords = (options.keywords && options.keywords.length > 0)
      ? options.keywords[0]
      : "Legal Affairs";

    const searchLocation = options.location || "Egypt";
    const isEgyptTargetedSearch = isEgyptLocationCompatible(searchLocation);

    // Determine country code from baseUrl or policy metadata
    let explicitCountry: string | null = null;
    const rawBaseUrl = (source.baseUrl && source.baseUrl.startsWith("http"))
      ? source.baseUrl
      : "https://api.adzuna.com";

    if (rawBaseUrl.includes("/v1/api/jobs/")) {
      const match = rawBaseUrl.match(/\/v1\/api\/jobs\/([a-z]{2})\//i);
      if (match && SUPPORTED_ADZUNA_COUNTRIES.has(match[1].toLowerCase())) {
        explicitCountry = match[1].toLowerCase();
      }
    }

    if (!explicitCountry && (source.policyMetadata as Record<string, any>)?.country) {
      const configuredCountry = String((source.policyMetadata as Record<string, any>).country).toLowerCase();
      if (SUPPORTED_ADZUNA_COUNTRIES.has(configuredCountry)) {
        explicitCountry = configuredCountry;
      }
    }

    // Strict Egypt Market Capability Gate:
    // Adzuna DOES NOT have an official 'eg' country endpoint.
    // If the request is for Egypt and no explicit non-Egypt country was configured on the source,
    // we must NEVER silently query the 'gb' index to prevent corrupting Egypt dataset with UK jobs.
    if (isEgyptTargetedSearch && !explicitCountry && !rawBaseUrl.includes("localhost") && !rawBaseUrl.includes("127.0.0.1") && !rawBaseUrl.includes("/api/adzuna") && !rawBaseUrl.includes("/api/")) {
      return {
        status: "CAPABILITY_UNSUPPORTED",
        sourceId: source.id,
        sourceName: source.name,
        jobs: [],
        errorMessage: "Adzuna API does not support native Egypt ('eg') job database. Defaulting to UK was suppressed to prevent foreign job pollution.",
        fetchedAt,
        rawCount: 0,
      };
    }

    const country = explicitCountry || "gb";

    let url: URL;
    if (rawBaseUrl.includes("/v1/api/jobs/") && rawBaseUrl.includes("/search/")) {
      url = new URL(rawBaseUrl);
    } else if (rawBaseUrl.includes("127.0.0.1") || rawBaseUrl.includes("localhost") || rawBaseUrl.includes("/api/")) {
      // Local/test hanging mock endpoint
      url = new URL(rawBaseUrl);
    } else {
      url = new URL(`https://api.adzuna.com/v1/api/jobs/${country}/search/1`);
    }

    url.searchParams.set("app_id", appId);
    url.searchParams.set("app_key", appKey);
    url.searchParams.set("what", keywords);
    if (options.location && !isEgyptTargetedSearch) {
      url.searchParams.set("where", options.location);
    }
    url.searchParams.set("results_per_page", String(options.limit || 20));
    url.searchParams.set("content-type", "application/json");

    const { signal, cleanup, effectiveTimeoutMs, controller } =
      createTimeoutController({
        timeoutMs: options.timeoutMs,
        parentSignal: options.signal,
      });

    try {
      const response = await fetch(url.toString(), {
        headers: {
          Accept: "application/json",
          "User-Agent": "JobHunter-AI/1.0",
        },
        signal,
      });

      if (response.status === 401 || response.status === 403) {
        return {
          status: "SOURCE_NOT_CONFIGURED",
          sourceId: source.id,
          sourceName: source.name,
          jobs: [],
          missingConfig: "ADZUNA_APP_ID / ADZUNA_APP_KEY (Invalid Credentials)",
          errorMessage: `Adzuna API credentials rejected with HTTP ${response.status}`,
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
          errorMessage: "Adzuna API rate limit exceeded.",
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
          errorMessage: `Adzuna API returned HTTP ${response.status}: ${response.statusText}`,
          fetchedAt,
          rawCount: 0,
        };
      }

      const data = (await response.json()) as any;
      const rawResults: any[] = Array.isArray(data.results) ? data.results : [];

      const normalizedJobs: NormalizedJob[] = [];

      for (const item of rawResults) {
        const title = (item.title || "Job Opportunity").replace(/<[^>]+>/g, "").trim();
        const description = (item.description || title).replace(/<[^>]+>/g, "").trim();
        const companyName = (item.company?.display_name || "Direct Employer").trim();
        const jobLocation = (item.location?.display_name || item.location?.area?.join(", ") || searchLocation).trim();
        const externalId = item.id ? String(item.id) : undefined;
        const sourceUrl = item.redirect_url || undefined;
        const postedAt = item.created ? new Date(item.created) : new Date();
        const employmentType = this.mapEmploymentType(
          item.contract_type,
          item.contract_time,
        );

        // Quality Gate: If target pipeline is Egypt, strictly reject non-Egypt/foreign locations
        if (isEgyptTargetedSearch && !isEgyptLocationCompatible(jobLocation, title, description)) {
          continue;
        }

        const categories = classifyJobCategories(title, description);

        normalizedJobs.push({
          externalJobId: externalId,
          title,
          companyName,
          location: jobLocation,
          employmentType,
          description,
          sourceUrl,
          canonicalUrl: sourceUrl,
          postedAt: isNaN(postedAt.getTime()) ? new Date() : postedAt,
          categories,
          rawMetadata: {
            salaryMin: item.salary_min,
            salaryMax: item.salary_max,
            category: item.category?.label,
            source: "adzuna",
            country,
          },
        });
      }

      return {
        status: "SUCCESS",
        sourceId: source.id,
        sourceName: source.name,
        jobs: normalizedJobs,
        fetchedAt,
        rawCount: rawResults.length,
      };
    } catch (err: unknown) {
      if (isTimeoutError(err, controller)) {
        return {
          status: "TIMEOUT",
          sourceId: source.id,
          sourceName: source.name,
          jobs: [],
          errorMessage: `Adzuna API request timed out after ${effectiveTimeoutMs}ms (hard limit: ${MAX_ADAPTER_TIMEOUT_MS / 1000}s).`,
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
        errorMessage: `Failed to query Adzuna API: ${errorMsg}`,
        fetchedAt,
        rawCount: 0,
      };
    } finally {
      cleanup();
    }
  }
}
