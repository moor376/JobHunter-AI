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

    const SUPPORTED_ADZUNA_COUNTRIES = new Set([
      "gb", "us", "at", "au", "be", "br", "ca", "ch", "de", "es",
      "fr", "in", "it", "mx", "nl", "nz", "pl", "ru", "sg", "za",
    ]);

    // Use country if explicit in baseUrl or options, otherwise default to gb (flagship Adzuna index)
    let country = "gb";
    if (source.baseUrl && source.baseUrl.includes("/v1/api/jobs/")) {
      const match = source.baseUrl.match(/\/v1\/api\/jobs\/([a-z]{2})\//i);
      if (match && SUPPORTED_ADZUNA_COUNTRIES.has(match[1].toLowerCase())) {
        country = match[1].toLowerCase();
      }
    }

    const rawBaseUrl = (source.baseUrl && source.baseUrl.startsWith("http"))
      ? source.baseUrl
      : "https://api.adzuna.com";

    let url: URL;
    if (rawBaseUrl.includes("/v1/api/jobs/") && rawBaseUrl.includes("/search/")) {
      url = new URL(rawBaseUrl);
    } else {
      url = new URL(`https://api.adzuna.com/v1/api/jobs/${country}/search/1`);
    }

    url.searchParams.set("app_id", appId);
    url.searchParams.set("app_key", appKey);
    url.searchParams.set("what", keywords);
    if (options.location && options.location.toLowerCase() !== "egypt" && options.location.toLowerCase() !== "cairo") {
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

      const normalizedJobs: NormalizedJob[] = rawResults.map((item) => {
        const title = (item.title || "Job Opportunity").replace(/<[^>]+>/g, "").trim();
        const description = (item.description || title).replace(/<[^>]+>/g, "").trim();
        const companyName = (item.company?.display_name || "Direct Employer").trim();
        const jobLocation = item.location?.display_name || location;
        const externalId = item.id ? String(item.id) : undefined;
        const sourceUrl = item.redirect_url || undefined;
        const postedAt = item.created ? new Date(item.created) : new Date();
        const employmentType = this.mapEmploymentType(
          item.contract_type,
          item.contract_time,
        );
        const categories = classifyJobCategories(title, description);

        return {
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
          },
        };
      });

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
