import { JobSourceType, type JobSourceRecord } from "../../store/db-store.js";
import { AdzunaAdapter } from "./adzuna-adapter.js";
import { JoobleAdapter } from "./jooble-adapter.js";
import { OfficialApiAdapter } from "./official-api-adapter.js";
import { RssFeedAdapter } from "./rss-adapter.js";
import type { JobSourceAdapter } from "./types.js";

const joobleAdapter = new JoobleAdapter();
const adzunaAdapter = new AdzunaAdapter();
const rssAdapter = new RssFeedAdapter();
const officialApiAdapter = new OfficialApiAdapter();

export function getAdapterForSource(source: JobSourceRecord): JobSourceAdapter {
  const externalId = (source.externalSourceId || "").toLowerCase();
  const name = (source.name || "").toLowerCase();

  // Explicit provider match by externalSourceId or name
  if (externalId.includes("jooble") || name.includes("jooble")) {
    return joobleAdapter;
  }

  if (externalId.includes("adzuna") || name.includes("adzuna")) {
    return adzunaAdapter;
  }

  // Type-based match
  if (source.type === JobSourceType.RSS_FEED) {
    return rssAdapter;
  }

  if (
    source.type === JobSourceType.OFFICIAL_API ||
    source.type === JobSourceType.JOB_BOARD
  ) {
    if (source.baseUrl?.includes("jooble")) return joobleAdapter;
    if (source.baseUrl?.includes("adzuna")) return adzunaAdapter;
    if (source.baseUrl?.endsWith(".xml") || source.baseUrl?.includes("rss") || source.baseUrl?.includes("feed")) {
      return rssAdapter;
    }
    return officialApiAdapter;
  }

  if (source.type === JobSourceType.CAREERS_PAGE) {
    if (source.baseUrl?.endsWith(".xml") || source.baseUrl?.includes("rss") || source.baseUrl?.includes("feed")) {
      return rssAdapter;
    }
    return officialApiAdapter;
  }

  return officialApiAdapter;
}

export function getAllAdapters(): JobSourceAdapter[] {
  return [joobleAdapter, adzunaAdapter, rssAdapter, officialApiAdapter];
}
