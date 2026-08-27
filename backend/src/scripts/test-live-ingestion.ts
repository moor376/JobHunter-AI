import { listJobSources } from "../services/job-source-service.js";
import { ingestJobsFromSource, listJobs } from "../services/job-service.js";
import { listCandidates } from "../services/candidate-service.js";
import { listApplications } from "../services/application-service.js";
import { getRankedJobsForCandidate } from "../services/ai-matching-service.js";
import {
  evaluateCandidateEligibility,
  isEgyptLocationCompatible,
  NAYERA_VERIFIED_FACTS,
} from "../services/eligibility-service.js";
import { discoverDirectEmployer } from "../services/job-employer-discovery-service.js";
import { loadEnvironment } from "../config/env.js";
import { memoryStore } from "../store/db-store.js";

async function main() {
  console.log("==================================================");
  console.log("1. PROVIDER CREDENTIALS STATUS (REDACTED / SECURE)");
  console.log("==================================================");
  const env = loadEnvironment();

  const isJoobleConfigured = Boolean(env.JOOBLE_API_KEY && env.JOOBLE_API_KEY.length > 5);
  const isAdzunaConfigured = Boolean(
    env.ADZUNA_APP_ID &&
    env.ADZUNA_APP_KEY &&
    env.ADZUNA_APP_ID.length > 2 &&
    env.ADZUNA_APP_KEY.length > 5 &&
    env.ADZUNA_APP_ID !== "your_adzuna_app_id"
  );

  console.log(`Jooble API:    ${isJoobleConfigured ? "CONFIGURED (REDACTED)" : "NOT CONFIGURED"}`);
  console.log(`Adzuna API:    ${isAdzunaConfigured ? "CONFIGURED (REDACTED)" : "NOT CONFIGURED"}`);
  console.log(`Database URL:  ${env.DATABASE_URL ? "CONFIGURED" : "NOT CONFIGURED"}`);

  console.log("\n==================================================");
  console.log("2. ACTIVE REAL JOB SOURCES (EGYPT TARGETED)");
  console.log("==================================================");
  const sources = await listJobSources();
  for (const s of sources) {
    console.log(`- Source: "${s.name}" (Type: ${s.type}, Method: ${s.accessMethod}, Active: ${s.isActive}, BaseUrl: ${s.baseUrl})`);
  }

  console.log("\n==================================================");
  console.log("3. RUNNING LIVE EXTERNAL INGESTION (REAL APIS ONLY)");
  console.log("==================================================");
  let joobleRawFetched = 0;
  let adzunaRawFetched = 0;
  let joobleDuplicates = 0;
  let adzunaDuplicates = 0;

  for (const s of sources) {
    if (!s.isActive) continue;
    const start = Date.now();
    try {
      const res = await ingestJobsFromSource(s.id);
      const durationMs = Date.now() - start;
      const rawCount = res.rawCount || (res.ingestedCount + res.duplicatesSkipped);

      if (s.name.toLowerCase().includes("jooble")) {
        joobleRawFetched = rawCount;
        joobleDuplicates = res.duplicatesSkipped;
      } else if (s.name.toLowerCase().includes("adzuna")) {
        adzunaRawFetched = rawCount;
        adzunaDuplicates = res.duplicatesSkipped;
      }

      console.log(`- ${s.name}: ${res.status} in ${durationMs}ms (${res.ingestedCount} new ingested, ${res.duplicatesSkipped} duplicates skipped, raw: ${rawCount})`);
      if (res.errorMessage) {
        console.log(`  Reason: ${res.errorMessage}`);
      }
    } catch (err) {
      console.log(`- ${s.name}: ERROR (${err instanceof Error ? err.message : String(err)})`);
    }
  }

  const allJobs = await listJobs();
  const totalRealJobsFetched = joobleRawFetched + adzunaRawFetched;
  const totalDuplicatesRemoved = joobleDuplicates + adzunaDuplicates;

  console.log("\n==================================================");
  console.log("4. LOCATION & ELIGIBILITY GATE AUDIT");
  console.log("==================================================");
  let egyptCompatibleCount = 0;
  let cairoCount = 0;
  let foreignFilteredCount = 0;

  let highPriorityCount = 0;
  let goodMatchCount = 0;
  let lowMatchCount = 0;
  let rejectCount = 0;

  let verifiedEmployerUrls = 0;
  let verifiedAtsUrls = 0;
  let verifiedUrlsCount = 0;
  let candidateUrlsCount = 0;
  let manualVerificationReq = 0;
  let noResultJobs = 0;

  let crossProviderLinkedJobs = 0;

  for (const j of allJobs) {
    const loc = (j.location || "").toLowerCase();
    const isEgypt = isEgyptLocationCompatible(j.location, j.title, j.description);

    if (isEgypt) {
      egyptCompatibleCount++;
      if (
        loc.includes("cairo") ||
        loc.includes("giza") ||
        loc.includes("heliopolis") ||
        loc.includes("nasr city") ||
        loc.includes("new cairo") ||
        loc.includes("القاهرة") ||
        loc.includes("الجيزة")
      ) {
        cairoCount++;
      }
    } else {
      foreignFilteredCount++;
    }

    const evalRes = evaluateCandidateEligibility(j);
    if (evalRes.priorityTier === "HIGH_PRIORITY") highPriorityCount++;
    else if (evalRes.priorityTier === "GOOD_MATCH") goodMatchCount++;
    else if (evalRes.priorityTier === "LOW_MATCH") lowMatchCount++;
    else rejectCount++;

    const discovery = discoverDirectEmployer(j, j.company, allJobs);
    if (discovery.atsUrl) verifiedAtsUrls++;
    if (discovery.employerUrl && !discovery.atsUrl) verifiedEmployerUrls++;

    if (discovery.attributionConfidence === "HIGH") {
      verifiedUrlsCount++;
    } else if (discovery.attributionConfidence === "MEDIUM") {
      candidateUrlsCount++;
    } else {
      noResultJobs++;
    }

    if (discovery.requiresManualVerification) manualVerificationReq++;
    if (discovery.discoveryProviders.length > 1) crossProviderLinkedJobs++;
  }

  console.log(`- Total Real Jobs Fetched Across APIs: ${totalRealJobsFetched}`);
  console.log(`- Jooble Jobs Fetched:                 ${joobleRawFetched}`);
  console.log(`- Adzuna Jobs Fetched:                 ${adzunaRawFetched}`);
  console.log(`- Egypt-Compatible Jobs:               ${egyptCompatibleCount}`);
  console.log(`- Cairo / Greater Cairo Jobs:          ${cairoCount}`);
  console.log(`- Foreign Jobs Filtered:               ${foreignFilteredCount}`);
  console.log(`- Duplicate Jobs Removed:              ${totalDuplicatesRemoved}`);
  console.log(`- Cross-Provider Linked Jobs:          ${crossProviderLinkedJobs}`);
  console.log(`- Total Unique Jobs in Database:       ${allJobs.length}`);

  console.log(`\nEligibility Tier Breakdown:`);
  console.log(`- HIGH_PRIORITY Jobs:                  ${highPriorityCount}`);
  console.log(`- GOOD_MATCH Jobs:                     ${goodMatchCount}`);
  console.log(`- LOW_MATCH Jobs:                      ${lowMatchCount}`);
  console.log(`- REJECT Jobs:                         ${rejectCount} (Includes foreign & non-aligned technical)`);

  console.log(`\nAttribution & Verification Breakdown:`);
  console.log(`- Direct Employer URLs Found:          ${verifiedEmployerUrls}`);
  console.log(`- ATS URLs Found:                      ${verifiedAtsUrls}`);
  console.log(`- VERIFIED URLs (HIGH Confidence):     ${verifiedUrlsCount}`);
  console.log(`- CANDIDATE URLs (MEDIUM Confidence):  ${candidateUrlsCount}`);
  console.log(`- Manual Verification Required:        ${manualVerificationReq}`);
  console.log(`- No Direct Result (Aggregator-only):  ${noResultJobs}`);

  console.log("\n==================================================");
  console.log("5. TOP 20 REAL JOBS IN EGYPT FOR NAYERA TAREK");
  console.log("==================================================");
  const candidates = await listCandidates();
  const nayera = candidates[0];

  if (nayera) {
    const rankedJobs = await getRankedJobsForCandidate(nayera.id, { limit: 50 });
    // Filter strictly to Egypt-compatible jobs
    const egyptRankedJobs = rankedJobs
      .filter((item) => isEgyptLocationCompatible(item.job.location, item.job.title, item.job.description))
      .slice(0, 20);

    console.log(`Displaying Top ${egyptRankedJobs.length} Egypt-Compatible Jobs for Nayera Tarek:\n`);

    egyptRankedJobs.forEach((item, idx) => {
      const j = item.job;
      const discovery = discoverDirectEmployer(j, j.company, allJobs);
      const providerName = j.rawReferenceMetadata?.provider || j.jobSource?.name || "Real External API";

      console.log(`[#${idx + 1}] ${j.title}`);
      console.log(`     COMPANY:             ${j.company?.name || "Direct Employer"}`);
      console.log(`     LOCATION:            ${j.location || "Egypt"}`);
      console.log(`     PROVIDER:            ${providerName}`);
      console.log(`     PRIORITY TIER:       ${item.priorityTier}`);
      console.log(`     MATCH SCORE:         ${item.matchScore}% (Eligibility: ${item.eligibilityScore}%)`);
      console.log(`     POSTED DATE:         ${j.postedAt ? new Date(j.postedAt).toISOString().split("T")[0] : "N/A"}`);
      console.log(`     DISCOVERY URL:       ${discovery.discoveryUrl}`);
      console.log(`     EMPLOYER URL:        ${discovery.employerUrl || "None (Never guessed)"}`);
      console.log(`     ATS URL:             ${discovery.atsUrl || "None"}`);
      console.log(`     VERIFICATION STATUS: ${discovery.attributionConfidence === "HIGH" ? "VERIFIED" : discovery.attributionConfidence === "MEDIUM" ? "CANDIDATE" : "MANUAL_VERIFICATION_REQUIRED"}`);
      console.log(`     APPLY URL:           ${discovery.applicationUrl}`);
      console.log("--------------------------------------------------------------------------------");
    });
  }

  console.log("\n==================================================");
  console.log("6. FINAL SAFETY CHECK & ZERO DISPATCH AUDIT");
  console.log("==================================================");
  const applications = await listApplications({ candidateId: nayera?.id });
  const sentApps = applications.filter((a) => a.status === "SENT");
  const approvedApps = applications.filter((a) => a.status === "APPROVED");
  const emailEvents = Array.from(memoryStore.emailEvents.values());
  const sentEmails = emailEvents.filter((e) => e.type === "SENT");

  console.log(`Applications Submitted: ${sentApps.length} (MUST BE ZERO)`);
  console.log(`Emails Sent:            ${sentEmails.length} (MUST BE ZERO)`);
  console.log(`Automatic Approvals:    ${approvedApps.length} (MUST BE ZERO)`);
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
