import { loadEnvironment } from "../config/env.js";
import { listJobs, ingestJobsFromSource } from "../services/job-service.js";
import { listJobSources } from "../services/job-source-service.js";
import { listCandidates } from "../services/candidate-service.js";
import {
  listPreparedApplications,
  prepareAllEligibleApplications,
} from "../services/application-preparation-service.js";
import { listApplications } from "../services/application-service.js";
import { evaluateCandidateEligibility } from "../services/eligibility-service.js";
import { memoryStore } from "../store/db-store.js";

async function runPreparationTest() {
  loadEnvironment();
  console.log("==================================================");
  console.log("LIVE READ-ONLY APPLICATION PREPARATION TEST");
  console.log("==================================================");

  const candidates = await listCandidates();
  const candidate = candidates[0];
  console.log(`Candidate: ${candidate.firstName} ${candidate.lastName} (${candidate.email})`);
  console.log(`Location: ${candidate.location}`);

  // Ensure fresh real jobs are loaded from active configured providers
  const sources = await listJobSources();
  for (const s of sources.filter((src) => src.isActive)) {
    try {
      await ingestJobsFromSource(s.id);
    } catch {
      // safe continue
    }
  }

  const allJobs = await listJobs();
  console.log(`Total Stored Real Jobs in Database: ${allJobs.length}`);

  // Run Batch Application Preparation for Nayera
  const prepSummary = await prepareAllEligibleApplications(candidate.id);
  const preparedList = await listPreparedApplications({ candidateId: candidate.id });

  // Count eligibility breakdown across stored catalog
  let highPriorityCount = 0;
  let goodMatchCount = 0;
  let lowMatchCount = 0;
  let rejectCount = 0;

  for (const job of allJobs) {
    const el = evaluateCandidateEligibility({
      title: job.title,
      description: job.description,
      location: job.location,
      categories: job.categories,
    });
    if (el.priorityTier === "HIGH_PRIORITY") highPriorityCount++;
    else if (el.priorityTier === "GOOD_MATCH") goodMatchCount++;
    else if (el.priorityTier === "LOW_MATCH") lowMatchCount++;
    else if (el.priorityTier === "REJECT") rejectCount++;
  }

  const totalEligible = highPriorityCount + goodMatchCount;

  // Check email events and submitted applications in system
  const applications = await listApplications({ candidateId: candidate.id });
  const emailEvents = Array.from(memoryStore.emailEvents.values());
  const sentEmails = emailEvents.filter((e) => e.type === "SENT");
  const submittedApps = applications.filter((a) => a.status === "SENT");

  console.log(`\n--- PREPARATION PIPELINE METRICS ---`);
  console.log(`Total Evaluated Jobs:               ${allJobs.length}`);
  console.log(`Total Eligible Jobs (High + Good):   ${totalEligible}`);
  console.log(`- HIGH_PRIORITY Jobs Prepared:      ${prepSummary.highPriorityCount}`);
  console.log(`- GOOD_MATCH Jobs Prepared:         ${prepSummary.goodMatchCount}`);
  console.log(`- LOW_MATCH Ineligible Filtered:    ${lowMatchCount}`);
  console.log(`- REJECT Disqualified Filtered:     ${rejectCount}`);
  console.log(`Total Ineligible Jobs Rejected:     ${prepSummary.ineligibleRejected}`);

  console.log(`\n--- APPLICATION CHANNELS & ACTIONS ---`);
  console.log(`- Jobs Requiring Email:             ${prepSummary.emailChannelCount}`);
  console.log(`- Jobs Requiring External Portal:   ${prepSummary.externalChannelCount}`);
  console.log(`- Manual-Action Jobs (Safe Guard):  ${prepSummary.manualActionCount}`);

  console.log(`\n--- SAFETY & ZERO-DISPATCH INVARIANTS ---`);
  console.log(`- Applications Actually Submitted:  ${submittedApps.length} (MUST BE ZERO)`);
  console.log(`- Emails Actually Sent:             ${sentEmails.length} (MUST BE ZERO)`);
  console.log(`- Default State for All Prepared:   ${preparedList.every((p) => p.preparationStatus === "PENDING_APPROVAL") ? "PENDING_APPROVAL (100% Verified)" : "Mixed"}`);

  console.log(`\n--- FIRST 5 PREPARED APPLICATION PACKAGES ---`);
  preparedList.slice(0, 5).forEach((p, idx) => {
    console.log(`\n[Package #${idx + 1}]`);
    console.log(`Title:              ${p.job?.title}`);
    console.log(`Company:            ${p.job?.company?.name}`);
    console.log(`Location:           ${p.job?.location}`);
    console.log(`Priority Tier:      ${p.priorityTier} (Score: ${p.eligibilityScore}%)`);
    console.log(`Profile Emphasis:   ${p.profileEmphasis}`);
    console.log(`Detected Channel:   ${p.applicationChannel}`);
    console.log(`Job URL:            ${p.canonicalUrl || p.sourceUrl}`);
    console.log(`Preparation Status: ${p.preparationStatus}`);
    console.log(`Email Subject:      ${p.preparedEmail?.subject}`);
    console.log(`Cover Letter Preview: ${p.coverLetterDraft?.slice(0, 150)}...`);
  });
}

runPreparationTest().catch(console.error);
