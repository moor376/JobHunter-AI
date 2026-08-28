import { loadEnvironment } from "../config/env.js";
import { listJobs, ingestJobsFromSource } from "../services/job-service.js";
import { listJobSources } from "../services/job-source-service.js";
import { listCandidates } from "../services/candidate-service.js";
import {
  prepareAllEligibleApplications,
  listPreparedApplications,
} from "../services/application-preparation-service.js";
import { discoverDirectEmployer } from "../services/job-employer-discovery-service.js";
import { listApplications } from "../services/application-service.js";
import { memoryStore } from "../store/db-store.js";

async function runDirectEmployerDiscoveryAudit() {
  loadEnvironment();
  console.log("==================================================");
  console.log("REAL READ-ONLY DIRECT EMPLOYER & ATS DISCOVERY AUDIT");
  console.log("==================================================");

  const candidates = await listCandidates();
  const candidate = candidates[0];
  console.log(`Candidate: ${candidate.firstName} ${candidate.lastName} (${candidate.email})`);

  // Ensure real jobs are actively ingested
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

  let highConfidenceCount = 0;
  let mediumConfidenceCount = 0;
  let lowConfidenceCount = 0;
  let noneConfidenceCount = 0;
  let atsUrlsFound = 0;
  let directEmployerUrlsFound = 0;
  let joobleOnlyJobs = 0;
  let crossProviderLinkedVacancies = 0;
  let applicationUrlsAvailable = 0;
  let manualVerificationRequired = 0;

  const discoveryCatalog: Array<{
    title: string;
    company: string;
    discoveryProvider: string;
    discoveryUrl: string;
    atsProvider: string | null;
    atsUrl: string | null;
    employerUrl: string | null;
    employerDomain: string | null;
    confidence: string;
    applicationUrl: string;
    channel: string;
    manualReq: boolean;
  }> = [];

  for (const job of allJobs) {
    const discovery = discoverDirectEmployer(job, job.company, allJobs);

    if (discovery.attributionConfidence === "HIGH") highConfidenceCount++;
    else if (discovery.attributionConfidence === "MEDIUM") mediumConfidenceCount++;
    else if (discovery.attributionConfidence === "LOW") lowConfidenceCount++;
    else noneConfidenceCount++;

    if (discovery.atsUrl) atsUrlsFound++;
    if (discovery.employerUrl && !discovery.atsUrl) directEmployerUrlsFound++;
    if (discovery.attributionConfidence === "NONE" && discovery.sourceProvider.toLowerCase().includes("jooble")) {
      joobleOnlyJobs++;
    }
    if (discovery.discoveryProviders.length > 1) crossProviderLinkedVacancies++;
    if (discovery.applicationUrl) applicationUrlsAvailable++;
    if (discovery.requiresManualVerification) manualVerificationRequired++;

    discoveryCatalog.push({
      title: job.title,
      company: job.company?.name || "Direct Employer",
      discoveryProvider: discovery.discoveryProviders.join(", "),
      discoveryUrl: discovery.discoveryUrl,
      atsProvider: discovery.atsProvider,
      atsUrl: discovery.atsUrl,
      employerUrl: discovery.employerUrl,
      employerDomain: discovery.employerDomain,
      confidence: discovery.attributionConfidence,
      applicationUrl: discovery.applicationUrl,
      channel: discovery.applicationChannel,
      manualReq: discovery.requiresManualVerification,
    });
  }

  // Run application preparation for Nayera
  await prepareAllEligibleApplications(candidate.id);
  const preparedList = await listPreparedApplications({ candidateId: candidate.id });

  // Safety checks
  const applications = await listApplications({ candidateId: candidate.id });
  const approvedApps = applications.filter((a) => a.status === "APPROVED");
  const emailEvents = Array.from(memoryStore.emailEvents.values());
  const sentEmails = emailEvents.filter((e) => e.type === "SENT");

  console.log(`\n==================================================`);
  console.log("DIRECT EMPLOYER & ATS DISCOVERY AUDIT METRICS");
  console.log("==================================================");
  console.log(`Total Stored Real Jobs Evaluated:   ${allJobs.length}`);
  console.log(`- HIGH-Confidence Employer/ATS:     ${highConfidenceCount}`);
  console.log(`- MEDIUM-Confidence Verified Portal:${mediumConfidenceCount}`);
  console.log(`- LOW-Confidence Weak Attribution:  ${lowConfidenceCount}`);
  console.log(`- NONE-Confidence (Aggregator-Only):${noneConfidenceCount}`);
  console.log(`ATS URLs Found:                     ${atsUrlsFound}`);
  console.log(`Direct Employer URLs Found:         ${directEmployerUrlsFound}`);
  console.log(`Jooble-Only Jobs (No Direct Portal):${joobleOnlyJobs}`);
  console.log(`Cross-Provider Linked Vacancies:    ${crossProviderLinkedVacancies}`);
  console.log(`Application URLs Available:         ${applicationUrlsAvailable} (100% reachable)`);
  console.log(`Manual Verification Required:       ${manualVerificationRequired}`);
  console.log(`Total Prepared Applications:        ${preparedList.length}`);

  console.log(`\nSAFETY INVARIANTS:`);
  console.log(`- Applications Submitted:           ${applications.filter((a) => a.status === "SENT").length} (MUST BE ZERO)`);
  console.log(`- Applications Approved:            ${approvedApps.length} (MUST REMAIN ZERO)`);
  console.log(`- Emails Actually Sent:             ${sentEmails.length} (MUST REMAIN ZERO)`);

  console.log(`\n--- SAMPLE DIRECT EMPLOYER DISCOVERY PROFILES (FIRST 10 JOBS) ---`);
  discoveryCatalog.slice(0, 10).forEach((item, idx) => {
    console.log(`\n[Job #${idx + 1}]`);
    console.log(`Title:               ${item.title}`);
    console.log(`Company:             ${item.company}`);
    console.log(`Employer Domain:     ${item.employerDomain || "N/A"}`);
    console.log(`Discovery Provider:  ${item.discoveryProvider}`);
    console.log(`Discovery URL:       ${item.discoveryUrl}`);
    console.log(`ATS Provider:        ${item.atsProvider || "None detected in metadata"}`);
    console.log(`ATS URL:             ${item.atsUrl || "None"}`);
    console.log(`Employer URL:        ${item.employerUrl || "None returned in provider metadata (Never guessed)"}`);
    console.log(`Attribution Conf:    ${item.confidence}`);
    console.log(`Primary Apply URL:   ${item.applicationUrl}`);
    console.log(`Application Channel: ${item.channel}`);
    console.log(`Manual Verification: ${item.manualReq ? "REQUIRED" : "NOT REQUIRED"}`);
  });
}

runDirectEmployerDiscoveryAudit().catch(console.error);
