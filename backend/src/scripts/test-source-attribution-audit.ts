import { loadEnvironment } from "../config/env.js";
import { listJobs, ingestJobsFromSource } from "../services/job-service.js";
import { listJobSources } from "../services/job-source-service.js";
import { listCandidates } from "../services/candidate-service.js";
import {
  prepareAllEligibleApplications,
  listPreparedApplications,
} from "../services/application-preparation-service.js";
import { attributeJobSource } from "../services/job-attribution-service.js";
import { listApplications } from "../services/application-service.js";
import { memoryStore } from "../store/db-store.js";

async function runAttributionAudit() {
  loadEnvironment();
  console.log("==================================================");
  console.log("JOB SOURCE ATTRIBUTION & ORIGINAL EMPLOYER URL AUDIT");
  console.log("==================================================");

  const candidates = await listCandidates();
  const candidate = candidates[0];
  console.log(`Candidate: ${candidate.firstName} ${candidate.lastName} (${candidate.email})`);

  // Ensure fresh real jobs
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

  // Run Attribution across catalog
  let verifiedEmployerUrlCount = 0;
  let joobleOnlyUrlCount = 0;
  let manualVerificationCount = 0;

  const attributionCatalog: Array<{
    title: string;
    company: string;
    discoveryUrl: string;
    originalEmployerUrl: string | null;
    originalEmployerDomain: string | null;
    confidence: string;
    applyUrl: string;
    channel: string;
  }> = [];

  for (const job of allJobs) {
    const attr = attributeJobSource(job, job.company);
    if (attr.originalEmployerUrl) {
      verifiedEmployerUrlCount++;
    } else {
      joobleOnlyUrlCount++;
      manualVerificationCount++;
    }

    attributionCatalog.push({
      title: job.title,
      company: job.company?.name || "Direct Employer",
      discoveryUrl: attr.discoveryUrl,
      originalEmployerUrl: attr.originalEmployerUrl,
      originalEmployerDomain: attr.originalEmployerDomain,
      confidence: attr.attributionConfidence,
      applyUrl: attr.applyUrl,
      channel: attr.applicationChannel,
    });
  }

  const percentageEmployerUrls = allJobs.length > 0
    ? ((verifiedEmployerUrlCount / allJobs.length) * 100).toFixed(1)
    : "0.0";

  // Prepare applications to verify prepared records
  await prepareAllEligibleApplications(candidate.id);
  const preparedList = await listPreparedApplications({ candidateId: candidate.id });

  // Safety checks
  const applications = await listApplications({ candidateId: candidate.id });
  const approvedApps = applications.filter((a) => a.status === "APPROVED");
  const emailEvents = Array.from(memoryStore.emailEvents.values());
  const sentEmails = emailEvents.filter((e) => e.type === "SENT");

  console.log(`\n==================================================`);
  console.log("SOURCE ATTRIBUTION METRICS");
  console.log("==================================================");
  console.log(`Total Stored Real Jobs Evaluated:   ${allJobs.length}`);
  console.log(`Jobs with Verified Employer URLs:   ${verifiedEmployerUrlCount}`);
  console.log(`Jobs with Jooble-Only URLs:         ${joobleOnlyUrlCount}`);
  console.log(`Jobs Requiring Manual Verification: ${manualVerificationCount}`);
  console.log(`Percentage with Employer URLs:      ${percentageEmployerUrls}%`);
  console.log(`Total Prepared Applications:        ${preparedList.length}`);

  console.log(`\nSAFETY INVARIANTS:`);
  console.log(`- Applications Approved:            ${approvedApps.length} (MUST REMAIN ZERO)`);
  console.log(`- Emails Actually Sent:             ${sentEmails.length} (MUST REMAIN ZERO)`);

  console.log(`\n--- SAMPLE ATTRIBUTION PROFILES (FIRST 10 JOBS) ---`);
  attributionCatalog.slice(0, 10).forEach((item, idx) => {
    console.log(`\n[Job #${idx + 1}]`);
    console.log(`Title:               ${item.title}`);
    console.log(`Company:             ${item.company}`);
    console.log(`Discovery Source:    Jooble Real Jobs API`);
    console.log(`Discovery URL:       ${item.discoveryUrl}`);
    console.log(`Original Employer:   ${item.originalEmployerUrl || "None returned in provider metadata (Never guessed)"}`);
    console.log(`Attribution Conf:    ${item.confidence}`);
    console.log(`Apply URL:           ${item.applyUrl}`);
    console.log(`Detected Channel:    ${item.channel}`);
  });
}

runAttributionAudit().catch(console.error);
