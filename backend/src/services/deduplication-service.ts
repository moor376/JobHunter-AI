import { createHash } from "node:crypto";
import type { JobRecord } from "../store/db-store.js";

export const TRACKING_QUERY_PARAMS = new Set([
  // Standard UTM and analytics parameters
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "utm_name",
  "utm_cid",
  "utm_reader",
  "utm_viz_id",
  "utm_pubreferrer",
  "utm_swu",

  // Click identifiers and Ad tracking
  "gclid",
  "fbclid",
  "msclkid",
  "twclid",
  "igshid",
  "mc_eid",
  "_hsenc",
  "_hsmi",
  "vero_id",
  "dclid",
  "yclid",
  "zanpid",
  "ttclid",
  "wbraid",
  "gbraid",

  // Generic tracking, referrals, and affiliate tags
  "ref",
  "source",
  "src",
  "origin",
  "trk",
  "tracking_id",
  "campaign",
  "js",
  "spm",
  "from",
  "affiliate",
  "aff_id",
  "partner",
  "session_id",

  // Jooble specific search context and tracking query parameters
  "ckey",
  "rgn",
  "pos",
  "groupid",
  "elckey",
  "p",
  "aq",
  "cid",
  "jobage",
  "brelb",
  "bscr",
  "scr",
  "relb",
  "uid",
  "adid",

  // Adzuna specific search context parameters
  "se",
  "v",
  "channel",

  // Indeed / LinkedIn / Job Board parameters
  "vjk",
  "fromjk",
  "jk",
  "advn",
  "tk",
  "refid",
  "trackingid",
  "position",
  "pagenum",
  "source_context",
]);

/**
 * Normalizes any job URL into a canonical, tracking-free form.
 * Handles provider-specific routing such as Jooble /away/{id} -> /desc/{id}.
 */
export function normalizeUrl(rawUrl?: string | null): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;

  try {
    const trimmed = rawUrl.trim();
    if (!trimmed) return null;

    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    url.hash = "";

    // Normalize hostname: lowercase, remove www. and country-level subdomains for jooble (e.g. eg.jooble.org -> jooble.org)
    let hostname = url.hostname.toLowerCase();
    if (hostname.endsWith("jooble.org")) {
      hostname = "jooble.org";
    } else {
      hostname = hostname.replace(/^www\./, "");
    }
    url.hostname = hostname;

    // Normalize protocol: force https unless explicit localhost/http testing
    if (url.protocol === "http:" && !hostname.includes("localhost") && !hostname.includes("127.0.0.1")) {
      url.protocol = "https:";
    }

    // Provider-specific canonical path resolution:
    // For Jooble: /away/{id} and /desc/{id} represent the exact same vacancy posting
    if (hostname === "jooble.org") {
      const joobleMatch = url.pathname.match(/\/(?:desc|away|job|view)\/(-?\d+)/i);
      if (joobleMatch) {
        const jobId = joobleMatch[1];
        return `https://jooble.org/desc/${jobId}`;
      }
    }

    // Clean tracking and query parameters
    const cleanParams = new URLSearchParams();
    const sortedKeys = Array.from(url.searchParams.keys()).sort();
    for (const key of sortedKeys) {
      if (!TRACKING_QUERY_PARAMS.has(key.toLowerCase())) {
        const val = url.searchParams.get(key);
        if (val !== null) {
          cleanParams.append(key, val);
        }
      }
    }

    url.search = cleanParams.toString();
    let normalized = url.toString().toLowerCase();

    // Strip trailing slash if present (except root slash)
    if (normalized.endsWith("/") && url.pathname !== "/") {
      normalized = normalized.slice(0, -1);
    }

    return normalized;
  } catch {
    return rawUrl.trim().toLowerCase();
  }
}

/**
 * Extracts a provider's canonical external ID from URL if available.
 */
export function extractExternalJobId(urlOrId?: string | null, providerHint?: string): string | null {
  if (!urlOrId || typeof urlOrId !== "string") return null;
  const trimmed = urlOrId.trim();
  if (!trimmed) return null;

  // If already an ID (numeric or UUID-like), return sanitized
  if (/^-?\d+$/.test(trimmed)) return trimmed;

  // Extract from Jooble URL
  const joobleMatch = trimmed.match(/jooble\.org\/(?:desc|away|job|view)\/(-?\d+)/i);
  if (joobleMatch) return joobleMatch[1];

  // Extract from Adzuna URL
  const adzunaMatch = trimmed.match(/adzuna\.[a-z.]+\/.*(?:details|land\/ad)\/(\d+)/i);
  if (adzunaMatch) return adzunaMatch[1];

  return null;
}

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s\u0600-\u06FF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function computeJobContentHash(
  title: string,
  companyName: string,
  description: string,
  location?: string | null,
): string {
  const normTitle = normalizeText(title);
  const normCompany = normalizeText(companyName);
  const normLocation = normalizeText(location || "");
  const normDesc = normalizeText((description || "").slice(0, 300));

  const payload = `${normTitle}|${normCompany}|${normLocation}|${normDesc}`;
  return createHash("sha256").update(payload).digest("hex");
}

export function tokenSimilarity(str1: string, str2: string): number {
  const tokens1 = new Set(normalizeText(str1).split(" ").filter((t) => t.length > 2));
  const tokens2 = new Set(normalizeText(str2).split(" ").filter((t) => t.length > 2));

  if (tokens1.size === 0 && tokens2.size === 0) return 1.0;
  if (tokens1.size === 0 || tokens2.size === 0) return 0.0;

  let intersection = 0;
  for (const token of tokens1) {
    if (tokens2.has(token)) {
      intersection++;
    }
  }

  const union = new Set([...tokens1, ...tokens2]).size;
  return union === 0 ? 0 : intersection / union;
}

export interface DuplicateCheckInput {
  jobSourceId?: string;
  externalJobId?: string | null;
  canonicalUrl?: string | null;
  sourceUrl?: string | null;
  title: string;
  companyName: string;
  location?: string | null;
  description: string;
}

export type DuplicateType =
  | "EXTERNAL_ID"
  | "CANONICAL_URL"
  | "CONTENT_HASH"
  | "NORMALIZED_IDENTITY";

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  duplicateOf?: JobRecord;
  duplicateType?: DuplicateType;
  reason?: string;
}

export function checkJobDuplicate(
  candidate: DuplicateCheckInput,
  existingJobs: JobRecord[],
): DuplicateCheckResult {
  const normCandidateUrl =
    normalizeUrl(candidate.canonicalUrl) || normalizeUrl(candidate.sourceUrl);
  const candidateExternalId =
    candidate.externalJobId || extractExternalJobId(candidate.canonicalUrl || candidate.sourceUrl);
  const candidateHash = computeJobContentHash(
    candidate.title,
    candidate.companyName,
    candidate.description,
    candidate.location,
  );
  const normCandidateTitle = normalizeText(candidate.title);
  const normCandidateCompany = normalizeText(candidate.companyName);

  for (const existing of existingJobs) {
    const existingExternalId =
      existing.externalJobId || extractExternalJobId(existing.canonicalUrl || existing.sourceUrl);

    // 1. Same Provider + Same External ID
    if (
      candidate.jobSourceId &&
      existing.jobSourceId === candidate.jobSourceId &&
      candidateExternalId &&
      existingExternalId &&
      candidateExternalId === existingExternalId
    ) {
      return {
        isDuplicate: true,
        duplicateOf: existing,
        duplicateType: "EXTERNAL_ID",
        reason: `Matched provider ${candidate.jobSourceId} and external ID ${candidateExternalId}`,
      };
    }

    // 2. Exact Canonical / Normalized URL match
    const existingUrl =
      normalizeUrl(existing.canonicalUrl) || normalizeUrl(existing.sourceUrl);
    if (normCandidateUrl && existingUrl && normCandidateUrl === existingUrl) {
      return {
        isDuplicate: true,
        duplicateOf: existing,
        duplicateType: "CANONICAL_URL",
        reason: `Matched normalized canonical URL: ${normCandidateUrl}`,
      };
    }

    // 3. Exact Content Hash match
    if (existing.contentHash && existing.contentHash === candidateHash) {
      return {
        isDuplicate: true,
        duplicateOf: existing,
        duplicateType: "CONTENT_HASH",
        reason: `Matched content SHA-256 hash: ${candidateHash}`,
      };
    }

    // 4. Cross-Query / Cross-Provider Match (same company + high title similarity)
    const existingCompany = normalizeText(existing.company?.name || "");
    if (
      existingCompany &&
      normCandidateCompany &&
      (existingCompany === normCandidateCompany ||
        existingCompany.includes(normCandidateCompany) ||
        normCandidateCompany.includes(existingCompany))
    ) {
      // If normalized titles are identical
      if (normCandidateTitle && normCandidateTitle === normalizeText(existing.title)) {
        return {
          isDuplicate: true,
          duplicateOf: existing,
          duplicateType: "NORMALIZED_IDENTITY",
          reason: `Identical company '${existing.company?.name}' and title '${existing.title}'`,
        };
      }

      // Title Token Similarity
      const titleSim = tokenSimilarity(candidate.title, existing.title);
      if (titleSim >= 0.80) {
        return {
          isDuplicate: true,
          duplicateOf: existing,
          duplicateType: "NORMALIZED_IDENTITY",
          reason: `Fuzzy title match with company '${existing.company?.name}' and title similarity ${(titleSim * 100).toFixed(0)}%`,
        };
      }

      // If title similarity is between 0.60 and 0.80, check description overlap to confirm duplicate
      if (titleSim >= 0.60) {
        const descSim = tokenSimilarity(candidate.description, existing.description);
        if (descSim >= 0.35) {
          return {
            isDuplicate: true,
            duplicateOf: existing,
            duplicateType: "NORMALIZED_IDENTITY",
            reason: `Fuzzy match with company '${existing.company?.name}', title sim ${(titleSim * 100).toFixed(0)}%, desc sim ${(descSim * 100).toFixed(0)}%`,
          };
        }
      }

      // IMPORTANT: When title similarity is < 0.70 (e.g. "Legal Specialist" vs "Sales Representative"),
      // do NOT mark as duplicate — these are genuinely distinct vacancies from the same company!
    }
  }

  return { isDuplicate: false };
}
