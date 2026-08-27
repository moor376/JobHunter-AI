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

function extractTagContent(xml: string, tag: string): string | null {
  const cdataRegex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, "i");
  const cdataMatch = xml.match(cdataRegex);
  if (cdataMatch) return cdataMatch[1].trim();

  const standardRegex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const standardMatch = xml.match(standardRegex);
  if (standardMatch) return standardMatch[1].trim();

  return null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export class RssFeedAdapter implements JobSourceAdapter {
  public readonly id = "rss-feed";
  public readonly name = "RSS / Atom Legitimate Job Feed Adapter";

  public get isConfigured(): boolean {
    return true; // Configured per source baseUrl
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
        missingConfig: "baseUrl (Valid HTTP/HTTPS RSS feed URL required)",
        errorMessage: `Source '${source.name}' does not have a valid baseUrl feed configured.`,
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
          Accept: "application/rss+xml, application/xml, text/xml, application/atom+xml, */*",
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
          errorMessage: `Feed returned HTTP ${response.status}: ${response.statusText}`,
          fetchedAt,
          rawCount: 0,
        };
      }

      const xmlText = await response.text();

      // Split into items (<item> for RSS or <entry> for Atom)
      const itemBlocks = xmlText.includes("<item")
        ? xmlText.split(/<item[^>]*>/i).slice(1)
        : xmlText.split(/<entry[^>]*>/i).slice(1);

      const normalizedJobs: NormalizedJob[] = [];

      for (const block of itemBlocks) {
        const titleRaw = extractTagContent(block, "title") || "Job Opening";
        const title = stripHtml(titleRaw);

        const descRaw =
          extractTagContent(block, "description") ||
          extractTagContent(block, "content") ||
          extractTagContent(block, "summary") ||
          title;
        const description = stripHtml(descRaw);

        const link =
          extractTagContent(block, "link") ||
          extractTagContent(block, "guid") ||
          source.baseUrl;

        const guid = extractTagContent(block, "guid") || extractTagContent(block, "id");
        const pubDateRaw =
          extractTagContent(block, "pubDate") ||
          extractTagContent(block, "updated") ||
          extractTagContent(block, "dc:date");
        const postedAt = pubDateRaw ? new Date(pubDateRaw) : new Date();

        const authorOrCompany =
          extractTagContent(block, "author") ||
          extractTagContent(block, "dc:creator") ||
          extractTagContent(block, "company") ||
          source.name;
        const companyName = stripHtml(authorOrCompany);

        const categories = classifyJobCategories(title, description);

        normalizedJobs.push({
          externalJobId: guid || undefined,
          title,
          companyName: companyName || source.name,
          location: "Egypt",
          employmentType: EmploymentType.FULL_TIME,
          description,
          sourceUrl: link || undefined,
          canonicalUrl: link || undefined,
          postedAt: isNaN(postedAt.getTime()) ? new Date() : postedAt,
          categories,
          rawMetadata: {
            feedUrl: source.baseUrl,
            source: "rss",
          },
        });

        if (options.limit && normalizedJobs.length >= options.limit) {
          break;
        }
      }

      return {
        status: "SUCCESS",
        sourceId: source.id,
        sourceName: source.name,
        jobs: normalizedJobs,
        fetchedAt,
        rawCount: itemBlocks.length,
      };
    } catch (err: unknown) {
      if (isTimeoutError(err, controller)) {
        return {
          status: "TIMEOUT",
          sourceId: source.id,
          sourceName: source.name,
          jobs: [],
          errorMessage: `RSS feed request timed out after ${effectiveTimeoutMs}ms (hard limit: ${MAX_ADAPTER_TIMEOUT_MS / 1000}s) for URL '${source.baseUrl}'.`,
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
        errorMessage: `Failed to fetch RSS feed: ${errorMsg}`,
        fetchedAt,
        rawCount: 0,
      };
    } finally {
      cleanup();
    }
  }
}
