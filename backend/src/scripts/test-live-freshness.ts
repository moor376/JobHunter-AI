import { loadEnvironment } from "../config/env.js";
import { listJobs, ingestJobsFromSource } from "../services/job-service.js";
import { listJobSources } from "../services/job-source-service.js";
import { listCandidates } from "../services/candidate-service.js";
import {
  prepareAllEligibleApplications,
  listPreparedApplications,
} from "../services/application-preparation-service.js";
import {
  verifyAllPreparedFreshness,
} from "../services/job-freshness-service.js";
import { listApplications } from "../services/application-service.js";
import { memoryStore } from "../store/db-store.js";

async function runLiveFreshnessTest() {
  loadEnvironment();
  console.log("==================================================");
  console.log("READ-ONLY LIVE JOB FRESHNESS VERIFICATION AUDIT");
  console.log("==================================================");

  const candidates = await listCandidates();
  const candidate = candidates[0];
  console.log(`Candidate: ${candidate.firstName} ${candidate.lastName} (${candidate.email})`);

  // Ensure fresh real jobs are loaded
  const sources = await listJobSources();
  for (const s of sources.filter((src) => src.isActive)) {
    try {
      await ingestJobsFromSource(s.id);
    } catch {
      // safe continue
    }
  }

  const allJobs = await listJobs();
  console.log(`Total Stored Real Jobs: ${allJobs.length}`);

  // Prepare all eligible applications
  await prepareAllEligibleApplications(candidate.id);
  const preparedList = await listPreparedApplications({ candidateId: candidate.id });
  console.log(`Total Prepared Applications: ${preparedList.length}`);

  console.log("\nExecuting live 10-second HTTP freshness verification against all prepared vacancies...");
  const freshnessSummary = await verifyAllPreparedFreshness();

  // Safety checks
  const applications = await listApplications({ candidateId: candidate.id });
  const approvedApps = applications.filter((a) => a.status === "APPROVED");
  const emailEvents = Array.from(memoryStore.emailEvents.values());
  const sentEmails = emailEvents.filter((e) => e.type === "SENT");

  console.log(`\n==================================================`);
  console.log("FRESHNESS VERIFICATION METRICS SUMMARY");
  console.log("==================================================");
  console.log(`Total Prepared Applications:        ${freshnessSummary.totalChecked}`);
  console.log(`- ACTIVE (Live & Accessible):       ${freshnessSummary.activeCount}`);
  console.log(`- CLOSED (Position Expired/Closed): ${freshnessSummary.closedCount}`);
  console.log(`- NOT_FOUND (404/Removed):          ${freshnessSummary.notFoundCount}`);
  console.log(`- BLOCKED (Bot Screen / Cloudflare):${freshnessSummary.blockedCount}`);
  console.log(`- TIMEOUT (Exceeded 10s Ceiling):   ${freshnessSummary.timeoutCount}`);
  console.log(`- UNKNOWN (Network / 5xx error):    ${freshnessSummary.unknownCount}`);
  console.log(`\nSAFETY INVARIANTS:`);
  console.log(`- Applications Approved:            ${approvedApps.length} (MUST REMAIN ZERO)`);
  console.log(`- Emails Actually Sent:             ${sentEmails.length} (MUST REMAIN ZERO)`);

  console.log(`\n--- FIRST 10 VERIFIED JOB PACKAGES ---`);
  freshnessSummary.results.slice(0, 10).forEach((prep, idx) => {
    console.log(`\n[Job #${idx + 1}]`);
    console.log(`Title:             ${prep.job?.title}`);
    console.log(`Company:           ${prep.job?.company?.name}`);
    console.log(`Priority Tier:     ${prep.priorityTier} (${prep.eligibilityScore}%)`);
    console.log(`Freshness Status:  ${prep.freshnessStatus} (HTTP ${prep.freshnessHttpStatus || "N/A"})`);
    console.log(`Final Target URL:  ${prep.freshnessFinalUrl || prep.canonicalUrl || prep.sourceUrl}`);
    console.log(`Reason:            ${prep.freshnessReason}`);
    console.log(`Requires Manual:   ${prep.requiresManualFreshnessCheck ? "YES" : "NO"}`);
  });
}

runLiveFreshnessTest().catch(console.error);
