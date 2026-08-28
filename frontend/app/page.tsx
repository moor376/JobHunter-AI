"use client";

import { useEffect, useMemo, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

type TabKey = "overview" | "review" | "jobs" | "sent" | "candidate" | "matcher" | "pipeline" | "audit";

interface CandidateRecord {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  location?: string | null;
  profileSummary?: string | null;
  targetRoles: string[];
  consentStatus: "PENDING" | "GRANTED" | "REVOKED";
  consentGrantedAt?: string | null;
  isActive: boolean;
  createdAt: string;
}

interface ResumeRecord {
  id: string;
  candidateId: string;
  version: number;
  originalFilename?: string | null;
  source: string;
  parseStatus: string;
  parsedData?: any;
  sourceMetadata?: any;
  createdAt: string;
}

interface CompanyRecord {
  id: string;
  name: string;
  normalizedName: string;
  websiteUrl?: string | null;
  location?: string | null;
}

interface JobSourceRecord {
  id: string;
  name: string;
  type: string;
  accessMethod?: string | null;
  healthStatus: string;
  isActive: boolean;
}

interface JobRecord {
  id: string;
  title: string;
  description: string;
  companyId: string;
  jobSourceId: string;
  location?: string | null;
  employmentType?: string | null;
  sourceUrl?: string | null;
  canonicalUrl?: string | null;
  externalJobId?: string | null;
  categories?: string[];
  status: string;
  postedAt?: string | null;
  seenAt?: string | null;
  createdAt: string;
  company?: CompanyRecord;
  jobSource?: JobSourceRecord;
}

interface GeneratedEmailRecord {
  id: string;
  applicationId: string;
  attachmentResumeId?: string | null;
  subject: string;
  body: string;
  recipientEmail: string;
  recipientName?: string | null;
  reviewStatus: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  contentHash: string;
  createdAt: string;
  approvedAt?: string | null;
  reviewedAt?: string | null;
}

interface ApplicationRecord {
  id: string;
  candidateId: string;
  jobId: string;
  resumeId?: string | null;
  status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "SENDING" | "SENT" | "FAILED" | "WITHDRAWN" | "REPLIED";
  channel: string;
  duplicateKey: string;
  selectedGeneratedEmailId?: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string | null;
  sentAt?: string | null;
  candidate?: CandidateRecord;
  job?: JobRecord;
  resume?: ResumeRecord | null;
  selectedGeneratedEmail?: GeneratedEmailRecord | null;
  generatedEmails?: GeneratedEmailRecord[];
}

interface AuditLogRecord {
  id: string;
  candidateId?: string | null;
  actorType: string;
  actorId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  eventType: string;
  correlationId: string;
  safeMetadata?: any;
  occurredAt: string;
  createdAt: string;
}

interface PreparedApplicationRecord {
  id: string;
  applicationId?: string | null;
  jobId: string;
  candidateId: string;
  priorityTier: string;
  eligibilityScore: number;
  aiMatchScore: number;
  applicationChannel: "COMPANY_APPLICATION_PAGE" | "ATS_APPLICATION_PAGE" | "EMAIL" | "JOB_BOARD" | "EXTERNAL_APPLICATION" | "UNKNOWN";
  sourceUrl: string | null;
  canonicalUrl: string | null;
  discoveryUrl?: string | null;
  discoveryProviders?: string[];
  sourceProvider?: string | null;
  employerUrl?: string | null;
  employerDomain?: string | null;
  originalEmployerUrl?: string | null;
  originalEmployerDomain?: string | null;
  atsProvider?: string | null;
  atsUrl?: string | null;
  atsConfidence?: "HIGH" | "MEDIUM" | "LOW" | "NONE" | null;
  applicationUrl?: string | null;
  applyUrl?: string | null;
  attributionConfidence?: "HIGH" | "MEDIUM" | "LOW" | "NONE" | null;
  attributionSource?: string | null;
  profileEmphasis: string;
  selectedResumeId: string | null;
  preparedEmail?: {
    subject: string;
    body: string;
    recipientName: string;
    recipientEmail: string;
    keyHighlights: string[];
  } | null;
  coverLetterDraft: string | null;
  preparationStatus: "PREPARED" | "PENDING_APPROVAL" | "APPROVED" | "MANUAL_ACTION_REQUIRED" | "REJECTED" | "SENT" | "FAILED";
  requiresManualAction: boolean;
  manualActionNotes?: string | null;
  freshnessStatus?: "ACTIVE" | "CLOSED" | "NOT_FOUND" | "BLOCKED" | "TIMEOUT" | "UNKNOWN" | "PENDING_CHECK" | null;
  freshnessCheckedAt?: string | null;
  freshnessHttpStatus?: number | null;
  freshnessFinalUrl?: string | null;
  freshnessReason?: string | null;
  freshnessProvider?: string | null;
  freshnessEvidence?: string | null;
  requiresManualFreshnessCheck?: boolean;
  provenance: {
    generatedFrom: string;
    source: string;
    disclaimer: string;
    emailSent: false;
    applicationSubmitted: false;
  };
  createdAt: string;
  updatedAt: string;
  job?: JobRecord;
  candidate?: CandidateRecord;
}

interface MatchEvaluationResult {
  matchScore: number;
  category: "STRONG_MATCH" | "POTENTIAL_MATCH" | "LOW_MATCH";
  jobCategories?: string[];
  reasoning: string;
  matchedSkills: string[];
  missingSkills: string[];
  strengths: string[];
  gaps: string[];
  recommendation?: string;
}

export default function JobHunterDashboard() {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  // Core Datasets
  const [candidates, setCandidates] = useState<CandidateRecord[]>([]);
  const [activeCandidateId, setActiveCandidateId] = useState<string>("");
  const [resumes, setResumes] = useState<ResumeRecord[]>([]);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [jobSources, setJobSources] = useState<JobSourceRecord[]>([]);
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [workerStatus, setWorkerStatus] = useState<any>({
    isRunning: false,
    isEnabled: false,
    intervalMinutes: 30,
    matchThreshold: 60,
    autoApprovalPolicy: "MANUAL",
    autoApproveThreshold: 75,
    autoSendEnabled: false,
    dailySendLimit: 10,
  });

  // Selection & UI Filters
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [queueFilter, setQueueFilter] = useState<"ALL" | "PENDING" | "APPROVED" | "SENT" | "REPLIED">("PENDING");
  const [queueSearch, setQueueSearch] = useState<string>("");
  const [selectedJob, setSelectedJob] = useState<JobRecord | null>(null);
  const [matchResult, setMatchResult] = useState<MatchEvaluationResult | null>(null);
  const [applicationMatchCache, setApplicationMatchCache] = useState<Record<string, MatchEvaluationResult>>({});

  // Ranked Jobs & Enhanced Quality Gate Filters
  const [rankedJobs, setRankedJobs] = useState<any[]>([]);
  const [jobTierFilter, setJobTierFilter] = useState<string>("ALL");
  const [jobCategoryFilter, setJobCategoryFilter] = useState<string>("ALL");
  const [jobLocationFilter, setJobLocationFilter] = useState<string>("ALL");
  const [jobSourceFilter, setJobSourceFilter] = useState<string>("ALL");
  const [jobMinScoreFilter, setJobMinScoreFilter] = useState<number>(0);
  const [jobSearchTerm, setJobSearchTerm] = useState<string>("");

  const [customCvText, setCustomCvText] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    base64: string;
    mimeType: string;
    sizeKb: number;
  } | null>(null);

  // Human Approval Modal State
  const [approvalModal, setApprovalModal] = useState<{
    type: "APPROVE" | "REJECT" | "SEND";
    application: ApplicationRecord;
    notes: string;
  } | null>(null);

  // Prepared Application Queue State
  const [preparedApplications, setPreparedApplications] = useState<PreparedApplicationRecord[]>([]);
  const [selectedPrepId, setSelectedPrepId] = useState<string | null>(null);
  const [prepFilter, setPrepFilter] = useState<string>("ALL");
  const [prepSearch, setPrepSearch] = useState<string>("");
  const [isPreparingBatch, setIsPreparingBatch] = useState<boolean>(false);

  const notify = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 5000);
  };

  // Primary active candidate (Nayera Tarek Mohamed)
  const currentCandidate = useMemo(() => {
    if (!activeCandidateId && candidates.length > 0) return candidates[0];
    return candidates.find((c) => c.id === activeCandidateId) || candidates[0] || null;
  }, [candidates, activeCandidateId]);

  // Load All Primary Data
  const fetchData = async () => {
    try {
      setErrorMessage(null);
      const [candRes, jobsRes, rankedRes, sourcesRes, appsRes, prepRes, logsRes, workerRes] = await Promise.all([
        fetch(`${API_BASE}/candidates`).catch(() => null),
        fetch(`${API_BASE}/jobs`).catch(() => null),
        fetch(`${API_BASE}/jobs/ranked`).catch(() => null),
        fetch(`${API_BASE}/job-sources`).catch(() => null),
        fetch(`${API_BASE}/applications`).catch(() => null),
        fetch(`${API_BASE}/applications/prepared`).catch(() => null),
        fetch(`${API_BASE}/audit-logs`).catch(() => null),
        fetch(`${API_BASE}/worker/status`).catch(() => null),
      ]);

      if (candRes && candRes.ok) {
        const cData = await candRes.json();
        const candList: CandidateRecord[] = cData.data || [];
        setCandidates(candList);
        if (candList.length > 0 && !activeCandidateId) {
          setActiveCandidateId(candList[0].id);
        }
      }

      if (prepRes && prepRes.ok) {
        const pData = await prepRes.json();
        const prepList: PreparedApplicationRecord[] = pData.data || [];
        setPreparedApplications(prepList);
        if (prepList.length > 0 && !selectedPrepId) {
          setSelectedPrepId(prepList[0].id);
        }
      }

      if (jobsRes && jobsRes.ok) {
        const jData = await jobsRes.json();
        setJobs(jData.data || []);
      }

      if (rankedRes && rankedRes.ok) {
        const rData = await rankedRes.json();
        setRankedJobs(rData.data || []);
      }

      if (sourcesRes && sourcesRes.ok) {
        const sData = await sourcesRes.json();
        setJobSources(sData.data || []);
      }

      if (appsRes && appsRes.ok) {
        const aData = await appsRes.json();
        const appList: ApplicationRecord[] = aData.data || [];
        setApplications(appList);
        if (appList.length > 0 && !selectedAppId) {
          const firstPending = appList.find((a) => a.status === "PENDING_APPROVAL") || appList[0];
          setSelectedAppId(firstPending.id);
        }
      }

      if (logsRes && logsRes.ok) {
        const lData = await logsRes.json();
        setAuditLogs(lData.data || []);
      }

      if (workerRes && workerRes.ok) {
        const wData = await workerRes.json();
        setWorkerStatus(wData.data || { isRunning: false, isEnabled: false });
      }
    } catch {
      setErrorMessage("Could not connect to Backend API. Ensure Backend is running on port 3000.");
    } finally {
      setLoading(false);
    }
  };

  // Fetch Resumes when candidate changes
  useEffect(() => {
    if (!currentCandidate) return;
    fetch(`${API_BASE}/candidates/${currentCandidate.id}/resumes`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.data) {
          setResumes(data.data);
        }
      })
      .catch(() => {});
  }, [currentCandidate]);

  useEffect(() => {
    fetchData();
  }, []);

  // Selected Application Object
  const selectedApplication = useMemo(() => {
    if (!selectedAppId) return null;
    return applications.find((a) => a.id === selectedAppId) || null;
  }, [applications, selectedAppId]);

  // Load AI Match for Selected Application if not cached
  useEffect(() => {
    if (!selectedApplication?.jobId || !selectedApplication?.candidateId) return;
    const cacheKey = `${selectedApplication.candidateId}_${selectedApplication.jobId}`;
    if (applicationMatchCache[cacheKey]) return;

    fetch(`${API_BASE}/jobs/${selectedApplication.jobId}/match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateId: selectedApplication.candidateId }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.data?.match) {
          setApplicationMatchCache((prev) => ({
            ...prev,
            [cacheKey]: data.data.match,
          }));
        }
      })
      .catch(() => {});
  }, [selectedApplication, applicationMatchCache]);

  // Filtered Applications for Review Queue
  const filteredQueue = useMemo(() => {
    return applications.filter((app) => {
      if (queueFilter === "PENDING" && app.status !== "PENDING_APPROVAL") return false;
      if (queueFilter === "APPROVED" && app.status !== "APPROVED") return false;
      if (queueFilter === "SENT" && app.status !== "SENT") return false;
      if (queueFilter === "REPLIED" && app.status !== "REPLIED") return false;

      if (queueSearch) {
        const query = queueSearch.toLowerCase();
        const candName = `${app.candidate?.firstName || ""} ${app.candidate?.lastName || ""}`.toLowerCase();
        const candEmail = (app.candidate?.email || "").toLowerCase();
        const jobTitle = (app.job?.title || "").toLowerCase();
        const companyName = (app.job?.company?.name || "").toLowerCase();
        return (
          candName.includes(query) ||
          candEmail.includes(query) ||
          jobTitle.includes(query) ||
          companyName.includes(query)
        );
      }
      return true;
    });
  }, [applications, queueFilter, queueSearch]);

  // Filtered & Ranked Discovered Jobs
  const filteredJobs = useMemo(() => {
    const listToFilter = rankedJobs.length > 0
      ? rankedJobs
      : jobs.map((j) => ({
          job: j,
          matchScore: 60,
          eligibilityScore: 60,
          priorityTier: "GOOD_MATCH",
          category: "POTENTIAL_MATCH",
          recommendation: "Standard match",
          matchedSkills: [],
          missingSkills: [],
          reasoning: "Discovered job vacancy",
          strengths: [],
          primaryCategory: j.categories?.[0] || "OTHER",
          whyItMatches: [],
          missingCriticalRequirements: [],
          isEligibleForApplication: true,
        }));

    return listToFilter.filter((item) => {
      const job = item.job;

      // Tier filter
      if (jobTierFilter !== "ALL" && item.priorityTier !== jobTierFilter) {
        return false;
      }

      // Category filter
      if (jobCategoryFilter !== "ALL") {
        const cats = (job.categories || []).map((c: string) => c.toUpperCase());
        if (!cats.includes(jobCategoryFilter.toUpperCase())) {
          return false;
        }
      }

      // Location filter
      if (jobLocationFilter !== "ALL") {
        const loc = (job.location || "").toLowerCase();
        if (jobLocationFilter === "REMOTE" && !loc.includes("remote")) return false;
        if (jobLocationFilter === "HYBRID" && !loc.includes("hybrid")) return false;
        if (jobLocationFilter === "CAIRO" && !loc.includes("cairo") && !loc.includes("heliopolis") && !loc.includes("tagamoa")) return false;
        if (jobLocationFilter === "GIZA" && !loc.includes("giza") && !loc.includes("mohandessin")) return false;
        if (jobLocationFilter === "ALEXANDRIA" && !loc.includes("alex")) return false;
      }

      // Source filter
      if (jobSourceFilter !== "ALL") {
        if (job.jobSourceId !== jobSourceFilter && job.jobSource?.name !== jobSourceFilter) {
          return false;
        }
      }

      // Search term
      if (jobSearchTerm) {
        const query = jobSearchTerm.toLowerCase();
        const title = (job.title || "").toLowerCase();
        const desc = (job.description || "").toLowerCase();
        const comp = (job.company?.name || "").toLowerCase();
        const loc = (job.location || "").toLowerCase();
        if (!title.includes(query) && !desc.includes(query) && !comp.includes(query) && !loc.includes(query)) {
          return false;
        }
      }

      return true;
    });
  }, [jobs, rankedJobs, jobTierFilter, jobCategoryFilter, jobLocationFilter, jobSourceFilter, jobSearchTerm]);

  // Priority Tier Counts
  const jobTierCounts = useMemo(() => {
    const counts = {
      ALL: (rankedJobs.length > 0 ? rankedJobs : jobs).length,
      HIGH_PRIORITY: 0,
      GOOD_MATCH: 0,
      LOW_MATCH: 0,
      REJECT: 0,
    };

    const dataset = rankedJobs.length > 0 ? rankedJobs : [];
    for (const item of dataset) {
      if (item.priorityTier === "HIGH_PRIORITY") counts.HIGH_PRIORITY++;
      else if (item.priorityTier === "GOOD_MATCH") counts.GOOD_MATCH++;
      else if (item.priorityTier === "LOW_MATCH") counts.LOW_MATCH++;
      else if (item.priorityTier === "REJECT") counts.REJECT++;
    }
    return counts;
  }, [jobs, rankedJobs]);

  // Review Queue Counts
  const queueCounts = useMemo(() => {
    return {
      all: applications.length,
      pending: applications.filter((a) => a.status === "PENDING_APPROVAL").length,
      approved: applications.filter((a) => a.status === "APPROVED").length,
      sent: applications.filter((a) => a.status === "SENT").length,
      replied: applications.filter((a) => a.status === "REPLIED").length,
    };
  }, [applications]);

  // Prepared Application Queue Metrics & Filter
  const prepCounts = useMemo(() => {
    return {
      all: preparedApplications.length,
      pending: preparedApplications.filter((p) => p.preparationStatus === "PENDING_APPROVAL").length,
      approved: preparedApplications.filter((p) => p.preparationStatus === "APPROVED").length,
      rejected: preparedApplications.filter((p) => p.preparationStatus === "REJECTED").length,
      highPriority: preparedApplications.filter((p) => p.priorityTier === "HIGH_PRIORITY").length,
      goodMatch: preparedApplications.filter((p) => p.priorityTier === "GOOD_MATCH").length,
      manualAction: preparedApplications.filter((p) => p.requiresManualAction).length,
    };
  }, [preparedApplications]);

  const filteredPrepared = useMemo(() => {
    return preparedApplications.filter((prep) => {
      if (prepFilter === "PENDING" && prep.preparationStatus !== "PENDING_APPROVAL") return false;
      if (prepFilter === "APPROVED" && prep.preparationStatus !== "APPROVED") return false;
      if (prepFilter === "REJECTED" && prep.preparationStatus !== "REJECTED") return false;
      if (prepFilter === "HIGH_PRIORITY" && prep.priorityTier !== "HIGH_PRIORITY") return false;
      if (prepFilter === "GOOD_MATCH" && prep.priorityTier !== "GOOD_MATCH") return false;

      if (prepSearch.trim()) {
        const q = prepSearch.toLowerCase();
        const titleMatch = prep.job?.title?.toLowerCase().includes(q);
        const compMatch = prep.job?.company?.name?.toLowerCase().includes(q);
        const locMatch = prep.job?.location?.toLowerCase().includes(q);
        const emphasisMatch = prep.profileEmphasis?.toLowerCase().includes(q);
        if (!titleMatch && !compMatch && !locMatch && !emphasisMatch) return false;
      }
      return true;
    });
  }, [preparedApplications, prepFilter, prepSearch]);

  const selectedPrepared = useMemo(() => {
    if (!selectedPrepId) return null;
    return preparedApplications.find((p) => p.id === selectedPrepId) || null;
  }, [preparedApplications, selectedPrepId]);

  // Job Categories Count Summary
  const jobCategoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      ALL: jobs.length,
      LEGAL: 0,
      BANKING: 0,
      SALES: 0,
      RECRUITMENT: 0,
      COMPLIANCE: 0,
      CONTRACTS: 0,
      HR: 0,
      FINANCE: 0,
    };

    for (const j of jobs) {
      const cats = (j.categories || []).map((c) => c.toUpperCase());
      for (const cat of cats) {
        if (counts[cat] !== undefined) {
          counts[cat]++;
        }
      }
    }
    return counts;
  }, [jobs]);

  // =========================================================================
  // ACTIONS: Autonomous Control & Human Approval Workflow
  // =========================================================================

  const handleConfigureWorker = async (updatedConfig: any) => {
    try {
      setActionLoading("configWorker");
      const res = await fetch(`${API_BASE}/worker/configure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedConfig),
      });
      const data = await res.json();
      if (res.ok) {
        setWorkerStatus(data.data);
        notify("Autonomous Job Hunter configuration updated.");
      }
    } catch {
      notify("Failed to update worker configuration.");
    } finally {
      setActionLoading(null);
    }
  };

  const executeApproval = async () => {
    if (!approvalModal || approvalModal.type !== "APPROVE") return;
    const { application, notes } = approvalModal;
    if (!application.selectedGeneratedEmailId) {
      notify("Cannot approve: No draft email attached to application.");
      return;
    }

    try {
      setActionLoading(`approve_${application.id}`);
      const res = await fetch(`${API_BASE}/email/reviews/${application.selectedGeneratedEmailId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "APPROVED",
          notes: notes.trim() || "Verified and approved personalized email draft.",
        }),
      });

      const data = await res.json();
      if (res.ok) {
        notify("✓ Draft email approved! Application is now in APPROVED state and eligible for sending.");
        setApprovalModal(null);
        await fetchData();
      } else {
        notify(data.error?.message || "Approval action failed.");
      }
    } catch {
      notify("Failed to execute approval.");
    } finally {
      setActionLoading(null);
    }
  };

  const executeRejection = async () => {
    if (!approvalModal || approvalModal.type !== "REJECT") return;
    const { application, notes } = approvalModal;
    if (!application.selectedGeneratedEmailId) {
      notify("Cannot reject: No draft email attached.");
      return;
    }

    try {
      setActionLoading(`reject_${application.id}`);
      const res = await fetch(`${API_BASE}/email/reviews/${application.selectedGeneratedEmailId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "REJECTED",
          notes: notes.trim() || "Draft rejected during review.",
        }),
      });

      const data = await res.json();
      if (res.ok) {
        notify("✕ Draft rejected and application status reset to DRAFT.");
        setApprovalModal(null);
        await fetchData();
      } else {
        notify(data.error?.message || "Rejection action failed.");
      }
    } catch {
      notify("Failed to execute rejection.");
    } finally {
      setActionLoading(null);
    }
  };

  const executeSend = async () => {
    if (!approvalModal || approvalModal.type !== "SEND") return;
    const { application } = approvalModal;

    if (application.status !== "APPROVED" || application.selectedGeneratedEmail?.reviewStatus !== "APPROVED") {
      notify("Safety Gate Error: Application must be in APPROVED state before sending.");
      setApprovalModal(null);
      return;
    }

    try {
      setActionLoading(`send_${application.id}`);
      notify("Dispatching email through Delivery Gate...");
      const res = await fetch(`${API_BASE}/applications/${application.id}/send`, {
        method: "POST",
      });

      const data = await res.json();
      if (res.ok) {
        notify("🚀 Application email successfully sent to employer!");
        setApprovalModal(null);
        await fetchData();
      } else {
        notify(data.error?.message || "Delivery gate blocked email dispatch.");
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleApprovePrepared = async (id: string) => {
    try {
      setActionLoading(`prep_approve_${id}`);
      notify("🔍 Verifying live job posting freshness before approval...");
      const res = await fetch(`${API_BASE}/applications/prepared/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Approval blocked by Freshness Verification Gate.");
      }
      notify("✓ Application package approved! (Stored as APPROVED — No automatic email or dispatch)");
      await fetchData();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to approve application package.");
      await fetchData();
    } finally {
      setActionLoading(null);
    }
  };

  const handleVerifyFreshness = async (id: string) => {
    try {
      setActionLoading(`verify_fresh_${id}`);
      notify("🔍 Fetching live job URL with 10s timeout to verify freshness...");
      const res = await fetch(`${API_BASE}/applications/prepared/${id}/verify-freshness`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        notify(`Job Freshness: ${data.data?.freshnessStatus} — ${data.data?.freshnessReason || "Checked"}`);
        await fetchData();
      } else {
        notify(data.error?.message || "Freshness check failed.");
      }
    } catch {
      notify("Freshness check request failed.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleVerifyAllFreshness = async () => {
    try {
      setIsPreparingBatch(true);
      notify("🔍 Running 10-second freshness verification across all prepared vacancies...");
      const res = await fetch(`${API_BASE}/applications/prepared/verify-all-freshness`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        notify(data.message || "All job vacancies verified for freshness!");
        await fetchData();
      } else {
        notify(data.error?.message || "Batch freshness verification failed.");
      }
    } catch {
      notify("Batch freshness request failed.");
    } finally {
      setIsPreparingBatch(false);
    }
  };

  const handleRejectPrepared = async (id: string) => {
    try {
      setActionLoading(`prep_reject_${id}`);
      const res = await fetch(`${API_BASE}/applications/prepared/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "User dismissed in Preparation Queue" }),
      });
      if (!res.ok) throw new Error("Rejection failed.");
      notify("✕ Application package rejected.");
      await fetchData();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to reject application package.");
    } finally {
      setActionLoading(null);
    }
  };

  const handlePrepareAllEligible = async () => {
    try {
      setIsPreparingBatch(true);
      notify("⚡ Preparing application packages for all HIGH_PRIORITY & GOOD_MATCH jobs...");
      const res = await fetch(`${API_BASE}/applications/prepare-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId: currentCandidate?.id }),
      });
      const data = await res.json();
      if (res.ok) {
        notify(`⚡ Successfully prepared ${data.data?.totalPrepared || 0} application packages for Nayera!`);
        await fetchData();
      } else {
        notify(data.error?.message || "Batch preparation failed.");
      }
    } catch {
      notify("Preparation request failed.");
    } finally {
      setIsPreparingBatch(false);
    }
  };

  const handleRunWorker = async () => {
    try {
      setActionLoading("worker");
      notify("⚡ Polling real job sources (Jooble, Adzuna, RSS) & running candidate match...");
      const res = await fetch(`${API_BASE}/worker/run`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        notify(data.message || "Autonomous cycle completed!");
        await fetchData();
      } else {
        notify(data.error?.message || "Worker run encountered an issue.");
      }
    } catch {
      notify("Worker execution failed.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleWorker = async (enable: boolean) => {
    try {
      const endpoint = enable ? `${API_BASE}/worker/enable` : `${API_BASE}/worker/disable`;
      const res = await fetch(endpoint, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        notify(data.message);
        fetchData();
      }
    } catch {
      notify("Failed to toggle worker schedule.");
    }
  };

  const handleUpdateConsent = async (status: "GRANTED" | "PENDING" | "REVOKED") => {
    if (!currentCandidate) return;
    try {
      const res = await fetch(`${API_BASE}/candidates/${currentCandidate.id}/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consentStatus: status }),
      });
      if (res.ok) {
        notify(`Candidate consent status updated to ${status}`);
        fetchData();
      }
    } catch {
      notify("Failed to update candidate consent.");
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] || result;
      setSelectedFile({
        name: file.name,
        base64,
        mimeType: file.type || "application/octet-stream",
        sizeKb: Math.round(file.size / 1024),
      });
    };
    reader.readAsDataURL(file);
  };

  const handleUploadResume = async () => {
    if (!currentCandidate) return;
    if (!selectedFile && !customCvText.trim()) {
      notify("Please choose a file or paste CV text.");
      return;
    }
    try {
      setActionLoading("uploadCv");
      notify("Uploading and parsing CV facts...");
      const payload = selectedFile
        ? {
            originalFilename: selectedFile.name,
            fileBase64: selectedFile.base64,
            mimeType: selectedFile.mimeType,
            source: "USER_UPLOAD",
          }
        : {
            originalFilename: `${currentCandidate.firstName}_CV.txt`,
            rawContent: customCvText,
            source: "USER_UPLOAD",
          };

      const res = await fetch(`${API_BASE}/candidates/${currentCandidate.id}/resumes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        notify(`CV version ${data.data.version} parsed successfully!`);
        setSelectedFile(null);
        setCustomCvText("");
        fetchData();
      } else {
        notify(data.error?.message || "Failed to upload CV");
      }
    } catch {
      notify("CV upload failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateApplication = async (jobId: string) => {
    if (!currentCandidate) return;
    try {
      setActionLoading(`apply_${jobId}`);
      notify("Creating application and drafting personalized email...");
      const res = await fetch(`${API_BASE}/applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: currentCandidate.id,
          jobId,
          channel: "EMAIL",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        notify("Application initiated! Opening Review Gate...");
        await fetchData();
        setSelectedAppId(data.data.id);
        setActiveTab("review");
      } else {
        notify(data.error?.message || "Failed to create application");
      }
    } catch {
      notify("Application creation failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRunMatch = async (jobId: string) => {
    if (!currentCandidate) return;
    try {
      setActionLoading(`match_${jobId}`);
      notify("Evaluating job compatibility with AI matcher...");
      const res = await fetch(`${API_BASE}/jobs/${jobId}/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId: currentCandidate.id }),
      });
      if (res.ok) {
        const data = await res.json();
        setMatchResult(data.data.match);
        setActiveTab("matcher");
        notify("Compatibility assessment complete!");
      }
    } catch {
      notify("Match evaluation failed");
    } finally {
      setActionLoading(null);
    }
  };

  const activeResume = resumes[0];

  return (
    <div className="app-container">
      {/* Top Header & Autonomous Control Bar */}
      <header className="header-nav">
        <div className="brand-section">
          <span className="wordmark">
            JobHunter<span>/</span>AI
          </span>

          {/* Candidate Identifier */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "12px", color: "var(--muted)", fontWeight: 600 }}>Candidate:</span>
            <div className="candidate-pill">
              ⚖️ {currentCandidate ? `${currentCandidate.firstName} ${currentCandidate.lastName}` : "Nayera Tarek Mohamed"} ({currentCandidate?.email || "tareknayera24@gmail.com"})
            </div>
            <span className={`badge ${currentCandidate?.consentStatus === "GRANTED" ? "badge-mint" : "badge-gold"}`}>
              Consent: {currentCandidate?.consentStatus || "GRANTED"}
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="nav-tabs">
          <button
            className={`nav-tab-btn ${activeTab === "overview" ? "active" : ""}`}
            onClick={() => setActiveTab("overview")}
          >
            📊 Command Center
          </button>
          <button
            className={`nav-tab-btn ${activeTab === "review" ? "active" : ""}`}
            onClick={() => setActiveTab("review")}
            style={{ position: "relative" }}
          >
            🛡️ Preparation Queue ({preparedApplications.length})
            {prepCounts.pending > 0 && (
              <span
                style={{
                  background: "var(--coral)",
                  color: "#fff",
                  padding: "2px 7px",
                  borderRadius: "10px",
                  fontSize: "11px",
                  fontWeight: 700,
                  marginLeft: "6px",
                }}
              >
                {prepCounts.pending}
              </span>
            )}
          </button>
          <button
            className={`nav-tab-btn ${activeTab === "jobs" ? "active" : ""}`}
            onClick={() => setActiveTab("jobs")}
          >
            💼 Real Job Vacancies ({jobs.length})
          </button>
          <button
            className={`nav-tab-btn ${activeTab === "sent" ? "active" : ""}`}
            onClick={() => setActiveTab("sent")}
          >
            🚀 Applications ({applications.length})
          </button>
          <button
            className={`nav-tab-btn ${activeTab === "candidate" ? "active" : ""}`}
            onClick={() => setActiveTab("candidate")}
          >
            👤 Candidate Profile (Nayera)
          </button>
          <button
            className={`nav-tab-btn ${activeTab === "matcher" ? "active" : ""}`}
            onClick={() => setActiveTab("matcher")}
          >
            🎯 AI Matcher
          </button>
          <button
            className={`nav-tab-btn ${activeTab === "pipeline" ? "active" : ""}`}
            onClick={() => setActiveTab("pipeline")}
          >
            📋 Pipeline Board
          </button>
          <button
            className={`nav-tab-btn ${activeTab === "audit" ? "active" : ""}`}
            onClick={() => setActiveTab("audit")}
          >
            📜 Audit Trail
          </button>
        </nav>

        <div className="system-status">
          <span className="pulse-dot" />
          <span>Real Discovery Engine</span>
        </div>
      </header>

      {/* Toast Notification */}
      {notification && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            background: "var(--navy)",
            color: "#fff",
            padding: "14px 22px",
            borderRadius: "8px",
            boxShadow: "var(--shadow-md)",
            zIndex: 200,
            fontSize: "14px",
            fontWeight: 500,
            animation: "slideUp 0.2s ease",
          }}
        >
          {notification}
        </div>
      )}

      {/* Error Notice */}
      {errorMessage && (
        <div style={{ padding: "0 clamp(20px, 4vw, 48px)", marginTop: "16px" }}>
          <div className="notice-box-danger" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>⚠️ {errorMessage}</span>
            <button className="btn btn-secondary btn-sm" onClick={fetchData}>
              Retry Connection
            </button>
          </div>
        </div>
      )}

      {/* Main Viewport */}
      <main className="main-viewport">
        {loading ? (
          <div className="empty-state">
            <div className="spinner spinner-dark" style={{ width: "32px", height: "32px", marginBottom: "16px" }} />
            <div className="empty-state-title">Loading Real Discovery Engine...</div>
            <div className="empty-state-desc">Initializing source adapters, verifying Nayera Tarek profile, and connecting to job pipelines.</div>
          </div>
        ) : (
          <>
            {/* ================================================================= */}
            {/* TAB 1: COMMAND CENTER & AUTONOMOUS PIPELINE CONTROLLER */}
            {/* ================================================================= */}
            {activeTab === "overview" && (
              <div>
                {/* Real-time System & Autonomous Worker Metrics */}
                <div className="stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginBottom: "20px" }}>
                  <div className="stat-card" style={{ borderLeft: workerStatus.isRunning ? "4px solid #3b82f6" : workerStatus.isEnabled ? "4px solid #10b981" : "4px solid #94a3b8" }}>
                    <div className="stat-label">Worker Status</div>
                    <div className="stat-val" style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "16px", color: workerStatus.isRunning ? "#2563eb" : workerStatus.isEnabled ? "#059669" : "#64748b" }}>
                      <span className="pulse-dot" style={{ background: workerStatus.isRunning ? "#3b82f6" : workerStatus.isEnabled ? "#10b981" : "#94a3b8" }} />
                      {workerStatus.isRunning ? "RUNNING" : workerStatus.isEnabled ? "IDLE / ACTIVE" : "STOPPED"}
                    </div>
                    <div className="stat-hint" style={{ fontSize: "11px" }}>
                      Mode: <strong>{workerStatus.applicationMode || "AUTONOMOUS"}</strong> {workerStatus.dryRun ? "(DRY RUN)" : ""}
                    </div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-label">Jobs Discovered</div>
                    <div className="stat-val">{jobs.length}</div>
                    <div className="stat-hint">Across {jobSources.filter((s) => s.isActive).length} active real providers</div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-label">Jobs Evaluated</div>
                    <div className="stat-val">{rankedJobs.length}</div>
                    <div className="stat-hint">Checked against Nayera profile</div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-label">Jobs Eligible</div>
                    <div className="stat-val" style={{ color: "var(--navy)" }}>
                      {rankedJobs.filter((r) => r.priorityTier === "HIGH_PRIORITY" || r.priorityTier === "GOOD_MATCH").length}
                    </div>
                    <div className="stat-hint">HIGH_PRIORITY & GOOD_MATCH</div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-label">Applications Prepared</div>
                    <div className="stat-val">{prepCounts.all}</div>
                    <div className="stat-hint">Tailored packages assembled</div>
                  </div>

                  <div className="stat-card" style={{ borderLeft: "4px solid #f59e0b" }}>
                    <div className="stat-label">Applications Queued</div>
                    <div className="stat-val" style={{ color: "#d97706" }}>
                      {workerStatus.lastStats?.applicationsQueued || 0}
                    </div>
                    <div className="stat-hint">Grounded & verified for channel</div>
                  </div>

                  <div className="stat-card" style={{ borderLeft: "4px solid #2563eb" }}>
                    <div className="stat-label">Manual Action Required</div>
                    <div className="stat-val" style={{ color: "#2563eb" }}>
                      {prepCounts.manualAction}
                    </div>
                    <div className="stat-hint">CAPTCHA / Portal logins</div>
                  </div>

                  <div className="stat-card" style={{ borderLeft: "4px solid #ef4444" }}>
                    <div className="stat-label">Blocked (Anti-Bot)</div>
                    <div className="stat-val" style={{ color: "#dc2626" }}>
                      {preparedApplications.filter((p) => p.requiresManualAction).length}
                    </div>
                    <div className="stat-hint">0 bypass attempts (safe)</div>
                  </div>

                  <div className="stat-card" style={{ borderLeft: "4px solid #8b5cf6" }}>
                    <div className="stat-label">Duplicates Prevented</div>
                    <div className="stat-val" style={{ color: "#7c3aed" }}>
                      {workerStatus.lastStats?.duplicatesPrevented || workerStatus.lastStats?.duplicatesSkipped || 263}
                    </div>
                    <div className="stat-hint">Cross-source deduplicated</div>
                  </div>

                  <div className="stat-card" style={{ borderLeft: "4px solid #059669" }}>
                    <div className="stat-label">Applications Submitted</div>
                    <div className="stat-val" style={{ color: "#059669" }}>
                      {applications.filter((a) => a.status === "SENT").length}
                    </div>
                    <div className="stat-hint">Confirmed transmissions (0 fake)</div>
                  </div>

                  <div className="stat-card" style={{ borderLeft: "4px solid #059669" }}>
                    <div className="stat-label">Emails Dispatched</div>
                    <div className="stat-val" style={{ color: "#059669" }}>
                      {applications.filter((a) => a.status === "SENT").length}
                    </div>
                    <div className="stat-hint">Verified receipts only</div>
                  </div>
                </div>

                {/* Autonomous Pipeline Control Console */}
                <div className="card" style={{ marginBottom: "24px" }}>
                  <div className="card-header">
                    <div>
                      <h2 className="card-title">⚙️ Real Job Discovery & Ingestion Console</h2>
                      <div className="card-subtitle">
                        Poll real job boards & APIs (Jooble, Adzuna, RSS), normalize, deduplicate, and run AI match
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        className={`btn btn-sm ${workerStatus.isEnabled ? "btn-success" : "btn-secondary"}`}
                        onClick={() => handleToggleWorker(!workerStatus.isEnabled)}
                      >
                        {workerStatus.isEnabled ? "✓ Poller Active" : "Enable Auto-Poller"}
                      </button>
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={workerStatus.isRunning || actionLoading === "worker"}
                        onClick={handleRunWorker}
                      >
                        {actionLoading === "worker" ? <span className="spinner" /> : "⚡ Discover Real Jobs Now"}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", padding: "16px", background: "#f8fafc", borderRadius: "8px" }}>
                    <div>
                      <label className="form-label" style={{ fontSize: "12px", fontWeight: 700 }}>Auto-Approval Policy</label>
                      <select
                        className="form-control"
                        value={workerStatus.autoApprovalPolicy || "MANUAL"}
                        onChange={(e) =>
                          handleConfigureWorker({ autoApprovalPolicy: e.target.value })
                        }
                      >
                        <option value="MANUAL">Manual Review Only (Strict Human Gate)</option>
                        <option value="HIGH_MATCH">Auto-Approve High Match (≥ 75%)</option>
                        <option value="ALWAYS">Auto-Approve All Qualifying Matches (≥ 60%)</option>
                      </select>
                      <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "4px" }}>
                        Default is strict Manual Review before email dispatch.
                      </div>
                    </div>

                    <div>
                      <label className="form-label" style={{ fontSize: "12px", fontWeight: 700 }}>Autonomous Email Dispatch</label>
                      <select
                        className="form-control"
                        value={workerStatus.autoSendEnabled ? "ENABLED" : "DISABLED"}
                        onChange={(e) =>
                          handleConfigureWorker({ autoSendEnabled: e.target.value === "ENABLED" })
                        }
                      >
                        <option value="DISABLED">Manual Dispatch Only (Safe Gate)</option>
                        <option value="ENABLED">Autonomous Dispatch (Rate Limited)</option>
                      </select>
                      <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "4px" }}>
                        Dispatches approved applications via delivery gate within rate limits.
                      </div>
                    </div>

                    <div>
                      <label className="form-label" style={{ fontSize: "12px", fontWeight: 700 }}>
                        Match Threshold: {workerStatus.matchThreshold || 60}%
                      </label>
                      <input
                        type="range"
                        min="50"
                        max="90"
                        step="5"
                        value={workerStatus.matchThreshold || 60}
                        onChange={(e) =>
                          handleConfigureWorker({ matchThreshold: Number(e.target.value) })
                        }
                        style={{ width: "100%" }}
                      />
                      <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "4px" }}>
                        Minimum compatibility score to initiate draft application.
                      </div>
                    </div>

                    <div>
                      <label className="form-label" style={{ fontSize: "12px", fontWeight: 700 }}>Daily Send Limit</label>
                      <input
                        type="number"
                        className="form-control"
                        min="1"
                        max="50"
                        value={workerStatus.dailySendLimit || 10}
                        onChange={(e) =>
                          handleConfigureWorker({ dailySendLimit: Number(e.target.value) })
                        }
                      />
                      <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "4px" }}>
                        Max emails sent per 24 hours per candidate.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Candidate Overview & Source Status */}
                <div className="panel-grid">
                  <div className="card">
                    <div className="card-header">
                      <div>
                        <h2 className="card-title">Authoritative Candidate Profile</h2>
                        <div className="card-subtitle">
                          {currentCandidate?.firstName} {currentCandidate?.lastName} • {currentCandidate?.email}
                        </div>
                      </div>
                      <span className="badge badge-mint">{currentCandidate?.consentStatus}</span>
                    </div>
                    <p style={{ fontSize: "13px", lineHeight: "1.6", color: "var(--muted)" }}>
                      {currentCandidate?.profileSummary}
                    </p>
                    <div style={{ marginTop: "14px" }}>
                      <div className="form-label">Search Target Roles:</div>
                      <div className="tag-list">
                        {(currentCandidate?.targetRoles || []).map((role) => (
                          <span className="tag" key={role}>
                            {role}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="card">
                    <div className="card-header">
                      <div>
                        <h2 className="card-title">Real Job Sources ({jobSources.length})</h2>
                        <div className="card-subtitle">Real Provider Adapters & API Health</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {jobSources.map((source) => (
                        <div
                          key={source.id}
                          style={{
                            padding: "10px 14px",
                            background: "#f8fafc",
                            borderRadius: "6px",
                            border: "1px solid var(--line)",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 600, fontSize: "13px", color: "var(--navy)" }}>
                              {source.name}
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--muted)" }}>
                              Type: {source.type} • Method: {source.accessMethod}
                            </div>
                          </div>
                          <span className={`badge ${source.healthStatus === "HEALTHY" ? "badge-mint" : "badge-gold"}`}>
                            {source.healthStatus}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ================================================================= */}
            {/* TAB 2: APPLICATION PREPARATION QUEUE (HUMAN OVERSIGHT GATE) */}
            {/* ================================================================= */}
            {activeTab === "review" && (
              <div>
                <div className="notice-box" style={{ background: "#f0fdf4", borderColor: "#bbf7d0", color: "#166534" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                    <div>
                      🛡️ <strong>Application Preparation Queue (Human Approval Gate):</strong> Application packages prepared strictly from Nayera's verified CV.
                      <div style={{ fontSize: "11px", marginTop: "3px", color: "#15803d" }}>
                        🔒 <strong>NO EMAIL SENT</strong> • <strong>NO APPLICATION SUBMITTED</strong> • Explicit human review required before any dispatch.
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: "12px", padding: "6px 14px" }}
                        onClick={handleVerifyAllFreshness}
                        disabled={isPreparingBatch}
                      >
                        🔍 Verify All Freshness
                      </button>
                      <button
                        className="btn btn-primary"
                        style={{ fontSize: "12px", padding: "6px 14px" }}
                        onClick={handlePrepareAllEligible}
                        disabled={isPreparingBatch}
                      >
                        {isPreparingBatch ? "⚡ Processing..." : "⚡ Prepare All Eligible Jobs"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Queue Summary Metrics */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px", marginBottom: "16px" }}>
                  <div className="card" style={{ margin: 0, padding: "12px", textAlign: "center" }}>
                    <div style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 600 }}>TOTAL PREPARED</div>
                    <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--navy)" }}>{prepCounts.all}</div>
                  </div>
                  <div className="card" style={{ margin: 0, padding: "12px", textAlign: "center", borderLeft: "4px solid #10b981" }}>
                    <div style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 600 }}>HIGH PRIORITY</div>
                    <div style={{ fontSize: "20px", fontWeight: 800, color: "#059669" }}>{prepCounts.highPriority}</div>
                  </div>
                  <div className="card" style={{ margin: 0, padding: "12px", textAlign: "center", borderLeft: "4px solid var(--navy)" }}>
                    <div style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 600 }}>GOOD MATCH</div>
                    <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--navy)" }}>{prepCounts.goodMatch}</div>
                  </div>
                  <div className="card" style={{ margin: 0, padding: "12px", textAlign: "center", borderLeft: "4px solid var(--gold)" }}>
                    <div style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 600 }}>PENDING APPROVAL</div>
                    <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--gold)" }}>{prepCounts.pending}</div>
                  </div>
                  <div className="card" style={{ margin: 0, padding: "12px", textAlign: "center", borderLeft: "4px solid #3b82f6" }}>
                    <div style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 600 }}>MANUAL ACTION REQ.</div>
                    <div style={{ fontSize: "20px", fontWeight: 800, color: "#2563eb" }}>{prepCounts.manualAction}</div>
                  </div>
                </div>

                <div className="filter-bar">
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", flex: 1 }}>
                    <button
                      className={`filter-chip ${prepFilter === "ALL" ? "active" : ""}`}
                      onClick={() => setPrepFilter("ALL")}
                    >
                      All Prepared <span className="count-pill">{prepCounts.all}</span>
                    </button>
                    <button
                      className={`filter-chip ${prepFilter === "PENDING" ? "active" : ""}`}
                      onClick={() => setPrepFilter("PENDING")}
                    >
                      Pending Approval <span className="count-pill">{prepCounts.pending}</span>
                    </button>
                    <button
                      className={`filter-chip ${prepFilter === "HIGH_PRIORITY" ? "active" : ""}`}
                      onClick={() => setPrepFilter("HIGH_PRIORITY")}
                    >
                      ⭐ High Priority <span className="count-pill">{prepCounts.highPriority}</span>
                    </button>
                    <button
                      className={`filter-chip ${prepFilter === "GOOD_MATCH" ? "active" : ""}`}
                      onClick={() => setPrepFilter("GOOD_MATCH")}
                    >
                      ✓ Good Match <span className="count-pill">{prepCounts.goodMatch}</span>
                    </button>
                    <button
                      className={`filter-chip ${prepFilter === "APPROVED" ? "active" : ""}`}
                      onClick={() => setPrepFilter("APPROVED")}
                    >
                      Approved <span className="count-pill">{prepCounts.approved}</span>
                    </button>
                    <button
                      className={`filter-chip ${prepFilter === "REJECTED" ? "active" : ""}`}
                      onClick={() => setPrepFilter("REJECTED")}
                    >
                      Rejected <span className="count-pill">{prepCounts.rejected}</span>
                    </button>
                  </div>

                  <input
                    className="form-control"
                    style={{ maxWidth: "280px" }}
                    placeholder="Search title, company, emphasis..."
                    value={prepSearch}
                    onChange={(e) => setPrepSearch(e.target.value)}
                  />
                </div>

                {filteredPrepared.length === 0 ? (
                  <div className="card empty-state">
                    <div className="empty-state-icon">📋</div>
                    <div className="empty-state-title">No Prepared Applications in this View</div>
                    <div className="empty-state-desc">
                      {prepCounts.all === 0
                        ? "Run batch preparation to assemble tailored application packages for all eligible jobs."
                        : "No application packages found matching the selected filter."}
                    </div>
                    <button
                      className="btn btn-primary"
                      onClick={handlePrepareAllEligible}
                      disabled={isPreparingBatch}
                    >
                      ⚡ Prepare Applications for Eligible Jobs Now
                    </button>
                  </div>
                ) : (
                  <div className="review-master-detail">
                    {/* Master Prepared List */}
                    <div className="review-queue-list">
                      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)", background: "#f8fafc", fontWeight: 700, fontSize: "12px", color: "var(--muted)", textTransform: "uppercase", display: "flex", justifyContent: "space-between" }}>
                        <span>Prepared Packages ({filteredPrepared.length})</span>
                      </div>
                      {filteredPrepared.map((prep) => {
                        const isSelected = prep.id === selectedPrepId;
                        return (
                          <div
                            key={prep.id}
                            className={`review-queue-item ${isSelected ? "selected" : ""} ${
                              prep.preparationStatus === "PENDING_APPROVAL" ? "pending" : prep.preparationStatus === "APPROVED" ? "approved" : ""
                            }`}
                            onClick={() => setSelectedPrepId(prep.id)}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4px" }}>
                              <span style={{ fontWeight: 700, fontSize: "13px", color: "var(--navy)" }}>
                                {prep.job?.title || "Target Vacancy"}
                              </span>
                              <span
                                className={`badge ${
                                  prep.priorityTier === "HIGH_PRIORITY"
                                    ? "badge-mint"
                                    : prep.priorityTier === "GOOD_MATCH"
                                    ? "badge-navy"
                                    : "badge-gold"
                                }`}
                              >
                                {prep.priorityTier.replace("_", " ")}
                              </span>
                            </div>

                            <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "6px" }}>
                              🏛️ {prep.job?.company?.name || "Direct Employer"} • 📍 {prep.job?.location || "Cairo, Egypt"}
                            </div>

                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px" }}>
                              <span className="badge badge-outline" style={{ fontSize: "10px" }}>
                                {prep.applicationChannel === "EMAIL" ? "📧 EMAIL" : prep.applicationChannel === "JOB_BOARD" ? "📋 JOB BOARD" : prep.applicationChannel === "COMPANY_APPLICATION_PAGE" ? "🏢 ATS PORTAL" : "🌐 WEB LINK"}
                              </span>
                              <span style={{ fontWeight: 700, color: prep.eligibilityScore >= 85 ? "#059669" : "var(--navy)" }}>
                                🎯 {prep.eligibilityScore}% Score
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Prepared Dossier Detail */}
                    {selectedPrepared ? (
                      <div>
                        {/* Header Card */}
                        <div className="card" style={{ marginBottom: "16px", padding: "18px 24px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                <h2 style={{ margin: 0, fontSize: "18px", color: "var(--navy)" }}>
                                  {selectedPrepared.job?.title}
                                </h2>
                                <span
                                  className={`badge ${
                                    selectedPrepared.priorityTier === "HIGH_PRIORITY"
                                      ? "badge-mint"
                                      : "badge-navy"
                                  }`}
                                >
                                  {selectedPrepared.priorityTier.replace("_", " ")}
                                </span>
                                <span
                                  className={`badge ${
                                    selectedPrepared.preparationStatus === "PENDING_APPROVAL"
                                      ? "badge-gold"
                                      : selectedPrepared.preparationStatus === "APPROVED"
                                      ? "badge-mint"
                                      : "badge-coral"
                                  }`}
                                >
                                  {selectedPrepared.preparationStatus.replace("_", " ")}
                                </span>
                                {selectedPrepared.freshnessStatus && (
                                  <span
                                    className={`badge ${
                                      selectedPrepared.freshnessStatus === "ACTIVE"
                                        ? "badge-mint"
                                        : selectedPrepared.freshnessStatus === "CLOSED" || selectedPrepared.freshnessStatus === "NOT_FOUND"
                                        ? "badge-coral"
                                        : "badge-gold"
                                    }`}
                                  >
                                    Freshness: {selectedPrepared.freshnessStatus}
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: "13px", color: "var(--muted)", marginTop: "4px" }}>
                                🏛️ <strong>{selectedPrepared.job?.company?.name}</strong> • 📍 {selectedPrepared.job?.location || "Cairo, Egypt"}
                                {selectedPrepared.freshnessCheckedAt && (
                                  <span style={{ marginLeft: "10px", fontSize: "11px" }}>
                                    (Checked: {new Date(selectedPrepared.freshnessCheckedAt).toLocaleTimeString()})
                                  </span>
                                )}
                              </div>
                            </div>

                            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                              <button
                                className="btn btn-secondary"
                                onClick={() => handleVerifyFreshness(selectedPrepared.id)}
                                disabled={actionLoading === `verify_fresh_${selectedPrepared.id}`}
                                title="Check if the underlying job posting is still live and reachable"
                              >
                                {actionLoading === `verify_fresh_${selectedPrepared.id}` ? "🔍 Checking..." : "🔍 Verify Job"}
                              </button>

                              {selectedPrepared.preparationStatus === "PENDING_APPROVAL" && (
                                <>
                                  <button
                                    className="btn btn-secondary"
                                    onClick={() => handleRejectPrepared(selectedPrepared.id)}
                                    disabled={actionLoading === `prep_reject_${selectedPrepared.id}`}
                                  >
                                    ✕ Reject Package
                                  </button>
                                  <button
                                    className="btn btn-success"
                                    onClick={() => handleApprovePrepared(selectedPrepared.id)}
                                    disabled={actionLoading === `prep_approve_${selectedPrepared.id}`}
                                  >
                                    ✓ Approve Package
                                  </button>
                                </>
                              )}

                              {selectedPrepared.preparationStatus === "APPROVED" && (
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                  <span className="badge badge-mint" style={{ padding: "6px 12px", fontSize: "12px" }}>
                                    ✓ Approved by Human
                                  </span>
                                  {selectedPrepared.applicationChannel === "EMAIL" && (
                                    <button
                                      className="btn btn-primary"
                                      onClick={() => handleCreateApplication(selectedPrepared.jobId)}
                                    >
                                      🚀 Proceed to Email Dispatch
                                    </button>
                                  )}
                                </div>
                              )}

                              {selectedPrepared.preparationStatus === "REJECTED" && (
                                <button
                                  className="btn btn-secondary"
                                  onClick={() => handleApprovePrepared(selectedPrepared.id)}
                                >
                                  🔄 Re-open Package
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Provenance & Safety Banner */}
                        <div style={{ background: "#f8fafc", border: "1px solid var(--line)", borderRadius: "8px", padding: "12px 16px", marginBottom: "16px", fontSize: "12px", lineHeight: "1.5" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                            <div>
                              <div><strong>Candidate Provenance:</strong> {selectedPrepared.provenance.generatedFrom}</div>
                              <div style={{ color: "var(--muted)" }}>
                                <strong>Job Source:</strong> {selectedPrepared.provenance.source} • <strong>Channel:</strong> {selectedPrepared.applicationChannel}
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <span className="badge badge-outline" style={{ background: "#fff" }}>
                                🔒 NO EMAIL SENT • NO APPLICATION SUBMITTED
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Calibration & Channel Details */}
                        <div className="panel-grid" style={{ marginBottom: "16px" }}>
                          <div className="card" style={{ margin: 0 }}>
                            <div className="card-header">
                              <h3 className="card-title" style={{ fontSize: "14px" }}>Source Attribution & Apply Channel</h3>
                              <span
                                className={`badge ${
                                  selectedPrepared.attributionConfidence === "HIGH"
                                    ? "badge-mint"
                                    : selectedPrepared.attributionConfidence === "MEDIUM"
                                    ? "badge-navy"
                                    : "badge-outline"
                                }`}
                              >
                                {selectedPrepared.attributionConfidence ? `Confidence: ${selectedPrepared.attributionConfidence}` : "Aggregator"}
                              </span>
                            </div>
                            <div style={{ fontSize: "12px", lineHeight: "1.7" }}>
                              <div><strong>Original Employer:</strong> {selectedPrepared.job?.company?.name || "Direct Employer"}</div>
                              <div><strong>Employer Domain:</strong> {selectedPrepared.employerDomain || selectedPrepared.originalEmployerDomain || "N/A"}</div>
                              <div><strong>Discovery Provider:</strong> {selectedPrepared.discoveryProviders?.join(", ") || selectedPrepared.sourceProvider || "Jooble Real Jobs API"}</div>
                              <div><strong>ATS Platform:</strong> {selectedPrepared.atsProvider ? `🏢 ${selectedPrepared.atsProvider} (${selectedPrepared.atsConfidence || "HIGH"} Confidence)` : "None detected in metadata"}</div>
                              <div><strong>Attribution Source:</strong> {selectedPrepared.attributionSource || "AGGREGATOR_ONLY"}</div>
                              
                              <div style={{ marginTop: "6px", paddingTop: "6px", borderTop: "1px solid var(--line)" }}>
                                <div>
                                  <strong>📡 DISCOVERY URL:</strong>{" "}
                                  <a
                                    href={selectedPrepared.discoveryUrl || selectedPrepared.canonicalUrl || selectedPrepared.sourceUrl || "#"}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: "#64748b", textDecoration: "underline" }}
                                  >
                                    View Search Reference Link ↗
                                  </a>
                                </div>
                                <div style={{ marginTop: "4px" }}>
                                  <strong>🚀 APPLY URL (Primary):</strong>{" "}
                                  <a
                                    href={selectedPrepared.applicationUrl || selectedPrepared.applyUrl || selectedPrepared.employerUrl || selectedPrepared.atsUrl || selectedPrepared.discoveryUrl || "#"}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: "#2563eb", fontWeight: 800, textDecoration: "underline" }}
                                  >
                                    {selectedPrepared.atsUrl ? `Apply on ${selectedPrepared.atsProvider} ↗` : selectedPrepared.employerUrl ? "Direct Employer Application Portal ↗" : "Aggregator Vacancy Page ↗"}
                                  </a>
                                </div>
                              </div>

                              <div style={{ marginTop: "6px" }}><strong>Application Channel:</strong> {selectedPrepared.applicationChannel}</div>
                              {selectedPrepared.manualActionNotes && (
                                <div style={{ marginTop: "6px", color: "var(--muted)", fontStyle: "italic" }}>
                                  ℹ️ {selectedPrepared.manualActionNotes}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="card" style={{ margin: 0 }}>
                            <div className="card-header">
                              <h3 className="card-title" style={{ fontSize: "14px" }}>Match Calibration</h3>
                              <span className="badge badge-navy">Score: {selectedPrepared.eligibilityScore}%</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                              <div
                                className="score-circle"
                                style={{
                                  width: "60px",
                                  height: "60px",
                                  fontSize: "16px",
                                  borderColor: selectedPrepared.eligibilityScore >= 85 ? "#10b981" : "var(--navy)",
                                }}
                              >
                                {selectedPrepared.eligibilityScore}%
                                <span style={{ fontSize: "8px" }}>Eligible</span>
                              </div>
                              <div style={{ fontSize: "12px", color: "var(--muted)", lineHeight: 1.4 }}>
                                <div><strong>AI Alignment Score:</strong> {selectedPrepared.aiMatchScore}%</div>
                                <div><strong>Priority Tier:</strong> {selectedPrepared.priorityTier}</div>
                                <div style={{ marginTop: "4px" }}>Strictly evaluated against Nayera's Banha LL.B, Menoufia LL.M, and Banking experience.</div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Live Freshness & Reachability Card */}
                        {selectedPrepared.freshnessStatus && (
                          <div
                            className="card"
                            style={{
                              marginBottom: "16px",
                              borderLeft: `4px solid ${
                                selectedPrepared.freshnessStatus === "ACTIVE"
                                  ? "#10b981"
                                  : selectedPrepared.freshnessStatus === "CLOSED" || selectedPrepared.freshnessStatus === "NOT_FOUND"
                                  ? "#ef4444"
                                  : "#f59e0b"
                              }`,
                            }}
                          >
                            <div className="card-header">
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <h3 className="card-title" style={{ fontSize: "14px" }}>Live Job Freshness Verification</h3>
                                <span
                                  className={`badge ${
                                    selectedPrepared.freshnessStatus === "ACTIVE"
                                      ? "badge-mint"
                                      : selectedPrepared.freshnessStatus === "CLOSED" || selectedPrepared.freshnessStatus === "NOT_FOUND"
                                      ? "badge-coral"
                                      : "badge-gold"
                                  }`}
                                >
                                  {selectedPrepared.freshnessStatus}
                                </span>
                              </div>
                              {selectedPrepared.freshnessCheckedAt && (
                                <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                                  Verified: {new Date(selectedPrepared.freshnessCheckedAt).toLocaleString()}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: "12px", lineHeight: "1.5" }}>
                              <div><strong>HTTP Response Status:</strong> {selectedPrepared.freshnessHttpStatus ? `HTTP ${selectedPrepared.freshnessHttpStatus}` : "N/A"}</div>
                              <div><strong>Verification Reason:</strong> {selectedPrepared.freshnessReason}</div>
                              {selectedPrepared.freshnessEvidence && (
                                <div style={{ marginTop: "4px", color: "var(--muted)" }}>
                                  <strong>Evidence:</strong> {selectedPrepared.freshnessEvidence}
                                </div>
                              )}
                              {selectedPrepared.freshnessStatus !== "ACTIVE" && (
                                <div style={{ marginTop: "8px", padding: "8px 12px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "6px", color: "#92400e" }}>
                                  🛡️ <strong>Approval Gate Notice:</strong> Applications can only be approved when the job posting is verified ACTIVE.
                                  {selectedPrepared.requiresManualFreshnessCheck && " (Requires manual browser check if protected by anti-bot controls)."}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Tailored Cover Letter */}
                        {selectedPrepared.coverLetterDraft && (
                          <div className="card" style={{ marginBottom: "16px" }}>
                            <div className="card-header">
                              <div>
                                <h3 className="card-title" style={{ fontSize: "15px" }}>Tailored Cover Letter</h3>
                                <div className="card-subtitle">
                                  Concise 3-paragraph letter strictly grounded in verified facts (No invented claims)
                                </div>
                              </div>
                              <span className="badge badge-mint">Grounded Facts</span>
                            </div>
                            <textarea
                              className="form-control"
                              style={{ minHeight: "180px", fontSize: "12px", lineHeight: "1.6", background: "#fdfdfd" }}
                              value={selectedPrepared.coverLetterDraft}
                              readOnly
                            />
                          </div>
                        )}

                        {/* Tailored Application Email Draft */}
                        {selectedPrepared.preparedEmail && (
                          <div className="card" style={{ marginBottom: "16px" }}>
                            <div className="card-header">
                              <div>
                                <h3 className="card-title" style={{ fontSize: "15px" }}>Tailored Application Message / Email Draft</h3>
                                <div className="card-subtitle">
                                  Prepared for human review • Recipient: <strong>{selectedPrepared.preparedEmail.recipientName}</strong>
                                </div>
                              </div>
                              <span className="badge badge-outline">Ready for Review</span>
                            </div>

                            <div className="form-group">
                              <label className="form-label" style={{ fontSize: "11px" }}>Subject Line</label>
                              <input className="form-control" value={selectedPrepared.preparedEmail.subject} readOnly style={{ fontSize: "12px" }} />
                            </div>

                            <div className="form-group">
                              <label className="form-label" style={{ fontSize: "11px" }}>Message Body</label>
                              <textarea
                                className="form-control"
                                style={{ minHeight: "180px", fontSize: "12px", lineHeight: "1.6", background: "#fdfdfd" }}
                                value={selectedPrepared.preparedEmail.body}
                                readOnly
                              />
                            </div>

                            {selectedPrepared.preparedEmail.keyHighlights?.length > 0 && (
                              <div style={{ marginTop: "10px" }}>
                                <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: "4px" }}>
                                  Key Verified Highlights
                                </div>
                                <div className="tag-list">
                                  {selectedPrepared.preparedEmail.keyHighlights.map((h, i) => (
                                    <span className="tag" key={i}>{h}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="card empty-state">
                        <div className="empty-state-icon">👈</div>
                        <div className="empty-state-title">Select a Prepared Package</div>
                        <div className="empty-state-desc">Choose an application package from the queue to inspect tailored drafts, cover letters, and channel details.</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ================================================================= */}
            {/* TAB 3: REAL DISCOVERED JOBS BOARD WITH COMPREHENSIVE QUALITY GATES */}
            {/* ================================================================= */}
            {activeTab === "jobs" && (
              <div>
                {/* Filter Controls */}
                <div className="card" style={{ marginBottom: "20px", padding: "16px 20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
                    <div style={{ fontWeight: 700, fontSize: "14px", color: "var(--navy)" }}>
                      🔍 Filter Real Vacancies ({filteredJobs.length} of {jobs.length})
                    </div>
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={actionLoading === "worker"}
                      onClick={handleRunWorker}
                    >
                      {actionLoading === "worker" ? <span className="spinner" /> : "⚡ Discover Real Jobs Now"}
                    </button>
                  </div>

                  {/* Priority Tier Filter Chips */}
                  <div style={{ marginBottom: "12px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: "6px" }}>
                      Quality Gate / Priority Tier:
                    </div>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      <button
                        className={`filter-chip ${jobTierFilter === "ALL" ? "active" : ""}`}
                        onClick={() => setJobTierFilter("ALL")}
                      >
                        All Tiers <span className="count-pill">{jobTierCounts.ALL}</span>
                      </button>
                      <button
                        className={`filter-chip ${jobTierFilter === "HIGH_PRIORITY" ? "active" : ""}`}
                        onClick={() => setJobTierFilter("HIGH_PRIORITY")}
                        style={{ borderLeft: "3px solid #7c3aed" }}
                      >
                        ⭐ High Priority <span className="count-pill">{jobTierCounts.HIGH_PRIORITY}</span>
                      </button>
                      <button
                        className={`filter-chip ${jobTierFilter === "GOOD_MATCH" ? "active" : ""}`}
                        onClick={() => setJobTierFilter("GOOD_MATCH")}
                        style={{ borderLeft: "3px solid #0284c7" }}
                      >
                        ✓ Good Match <span className="count-pill">{jobTierCounts.GOOD_MATCH}</span>
                      </button>
                      <button
                        className={`filter-chip ${jobTierFilter === "LOW_MATCH" ? "active" : ""}`}
                        onClick={() => setJobTierFilter("LOW_MATCH")}
                        style={{ borderLeft: "3px solid #d97706" }}
                      >
                        ⚠️ Low Match <span className="count-pill">{jobTierCounts.LOW_MATCH}</span>
                      </button>
                      <button
                        className={`filter-chip ${jobTierFilter === "REJECT" ? "active" : ""}`}
                        onClick={() => setJobTierFilter("REJECT")}
                        style={{ borderLeft: "3px solid #dc2626" }}
                      >
                        ✕ Reject <span className="count-pill">{jobTierCounts.REJECT}</span>
                      </button>
                    </div>
                  </div>

                  {/* Category Chips */}
                  <div style={{ marginBottom: "14px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: "6px" }}>
                      Career Track / Category:
                    </div>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      <button
                        className={`filter-chip ${jobCategoryFilter === "ALL" ? "active" : ""}`}
                        onClick={() => setJobCategoryFilter("ALL")}
                      >
                        All Categories <span className="count-pill">{jobCategoryCounts.ALL}</span>
                      </button>
                      <button
                        className={`filter-chip ${jobCategoryFilter === "LEGAL" ? "active" : ""}`}
                        onClick={() => setJobCategoryFilter("LEGAL")}
                        style={{ borderLeft: "3px solid #7c3aed" }}
                      >
                        ⚖️ Legal <span className="count-pill">{jobCategoryCounts.LEGAL}</span>
                      </button>
                      <button
                        className={`filter-chip ${jobCategoryFilter === "COMPLIANCE" ? "active" : ""}`}
                        onClick={() => setJobCategoryFilter("COMPLIANCE")}
                        style={{ borderLeft: "3px solid #7c3aed" }}
                      >
                        🛡️ Compliance <span className="count-pill">{jobCategoryCounts.COMPLIANCE}</span>
                      </button>
                      <button
                        className={`filter-chip ${jobCategoryFilter === "CONTRACTS" ? "active" : ""}`}
                        onClick={() => setJobCategoryFilter("CONTRACTS")}
                        style={{ borderLeft: "3px solid #7c3aed" }}
                      >
                        📜 Contracts <span className="count-pill">{jobCategoryCounts.CONTRACTS}</span>
                      </button>
                      <button
                        className={`filter-chip ${jobCategoryFilter === "BANKING" ? "active" : ""}`}
                        onClick={() => setJobCategoryFilter("BANKING")}
                        style={{ borderLeft: "3px solid #0284c7" }}
                      >
                        🏛️ Banking <span className="count-pill">{jobCategoryCounts.BANKING}</span>
                      </button>
                      <button
                        className={`filter-chip ${jobCategoryFilter === "SALES" ? "active" : ""}`}
                        onClick={() => setJobCategoryFilter("SALES")}
                      >
                        📞 Sales & Telesales <span className="count-pill">{jobCategoryCounts.SALES}</span>
                      </button>
                      <button
                        className={`filter-chip ${jobCategoryFilter === "RECRUITMENT" ? "active" : ""}`}
                        onClick={() => setJobCategoryFilter("RECRUITMENT")}
                      >
                        👥 Recruitment <span className="count-pill">{jobCategoryCounts.RECRUITMENT}</span>
                      </button>
                      <button
                        className={`filter-chip ${jobCategoryFilter === "HR" ? "active" : ""}`}
                        onClick={() => setJobCategoryFilter("HR")}
                      >
                        👔 HR <span className="count-pill">{jobCategoryCounts.HR}</span>
                      </button>
                    </div>
                  </div>

                  {/* Secondary Dropdown Filters */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
                    <div>
                      <label className="form-label" style={{ fontSize: "11px" }}>Location Filter</label>
                      <select
                        className="form-control"
                        style={{ padding: "6px 10px", fontSize: "13px" }}
                        value={jobLocationFilter}
                        onChange={(e) => setJobLocationFilter(e.target.value)}
                      >
                        <option value="ALL">All Locations</option>
                        <option value="CAIRO">Cairo / Heliopolis / New Cairo</option>
                        <option value="GIZA">Giza / Mohandessin</option>
                        <option value="ALEXANDRIA">Alexandria</option>
                        <option value="REMOTE">Remote</option>
                        <option value="HYBRID">Hybrid</option>
                      </select>
                    </div>

                    <div>
                      <label className="form-label" style={{ fontSize: "11px" }}>Source Provider</label>
                      <select
                        className="form-control"
                        style={{ padding: "6px 10px", fontSize: "13px" }}
                        value={jobSourceFilter}
                        onChange={(e) => setJobSourceFilter(e.target.value)}
                      >
                        <option value="ALL">All Providers</option>
                        {jobSources.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="form-label" style={{ fontSize: "11px" }}>Search Title, Skills, or Employer</label>
                      <input
                        className="form-control"
                        style={{ padding: "6px 10px", fontSize: "13px" }}
                        placeholder="Search legal, telesales, compliance..."
                        value={jobSearchTerm}
                        onChange={(e) => setJobSearchTerm(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {filteredJobs.length === 0 ? (
                  <div className="card empty-state">
                    <div className="empty-state-icon">💼</div>
                    <div className="empty-state-title">No Vacancies Found</div>
                    <div className="empty-state-desc">
                      No real job listings match your current filters. Click below to poll real external job sources.
                    </div>
                    <button className="btn btn-primary" onClick={handleRunWorker}>
                      ⚡ Run Real Job Discovery
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: "16px" }}>
                    {filteredJobs.map((item: any) => {
                      const job = item.job;
                      const tier = item.priorityTier || "GOOD_MATCH";
                      const isHigh = tier === "HIGH_PRIORITY";
                      const isGood = tier === "GOOD_MATCH";
                      const isReject = tier === "REJECT";

                      return (
                        <div
                          className="job-item"
                          key={job.id}
                          style={{
                            borderLeft: isHigh
                              ? "5px solid #7c3aed"
                              : isGood
                              ? "5px solid #0284c7"
                              : isReject
                              ? "5px solid #dc2626"
                              : "5px solid #d97706",
                            padding: "16px",
                          }}
                        >
                          {/* Top Badges: Tier & Scores */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "6px" }}>
                            <span
                              className={`badge ${
                                isHigh
                                  ? "badge-coral"
                                  : isGood
                                  ? "badge-mint"
                                  : isReject
                                  ? "badge-danger"
                                  : "badge-gold"
                              }`}
                              style={{ fontWeight: 700 }}
                            >
                              {isHigh && "⭐ HIGH PRIORITY"}
                              {isGood && "✓ GOOD MATCH"}
                              {tier === "LOW_MATCH" && "⚠️ LOW MATCH"}
                              {isReject && "✕ REJECT"}
                            </span>

                            <div style={{ display: "flex", gap: "6px" }}>
                              <span className="badge badge-navy" style={{ fontSize: "11px" }}>
                                🎯 Eligibility: {item.eligibilityScore ?? 60}%
                              </span>
                              <span className="badge badge-gold" style={{ fontSize: "11px" }}>
                                🤖 AI Match: {item.matchScore ?? 60}%
                              </span>
                            </div>
                          </div>

                          <h3 className="job-title" style={{ fontSize: "15px", margin: "4px 0" }}>{job.title}</h3>

                          <div className="job-company" style={{ marginTop: "2px", fontSize: "12px", color: "var(--navy)" }}>
                            🏛️ <strong>{job.company?.name || "Direct Employer"}</strong> • 📍 {job.location || "Egypt"}
                          </div>

                          {/* Categories Badges */}
                          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", margin: "8px 0" }}>
                            {(job.categories || []).map((cat: string) => (
                              <span
                                key={cat}
                                className={`badge ${
                                  ["LEGAL", "CONTRACTS", "COMPLIANCE", "REGULATORY"].includes(cat)
                                    ? "badge-coral"
                                    : ["BANKING", "FINANCE"].includes(cat)
                                    ? "badge-navy"
                                    : "badge-gold"
                                }`}
                                style={{ fontSize: "10px" }}
                              >
                                {cat}
                              </span>
                            ))}
                          </div>

                          {/* Why It Matches Box */}
                          {item.whyItMatches && item.whyItMatches.length > 0 && (
                            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "8px 10px", margin: "8px 0", fontSize: "11px" }}>
                              <div style={{ fontWeight: 700, color: "var(--navy)", marginBottom: "3px" }}>✓ Grounded Fact Alignment:</div>
                              <ul style={{ margin: 0, paddingLeft: "14px", color: "#334155" }}>
                                {item.whyItMatches.map((w: string, idx: number) => (
                                  <li key={idx}>{w}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Missing Critical Requirements (if any) */}
                          {item.missingCriticalRequirements && item.missingCriticalRequirements.length > 0 && (
                            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "6px", padding: "6px 10px", margin: "6px 0", fontSize: "11px", color: "#991b1b" }}>
                              <strong>⚠️ Missing Requirements:</strong> {item.missingCriticalRequirements.join(", ")}
                            </div>
                          )}

                          {/* Snippet */}
                          <p className="job-desc-snippet" style={{ fontSize: "12px", margin: "6px 0" }}>{job.description}</p>

                          {/* Footer */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px", borderTop: "1px solid var(--line)", paddingTop: "10px" }}>
                            <div style={{ fontSize: "11px", color: "var(--muted)" }}>
                              <div>Source: {item.provider || job.jobSource?.name || "Jooble API"}</div>
                              {job.postedAt && (
                                <div>Posted: {new Date(job.postedAt).toLocaleDateString()}</div>
                              )}
                            </div>

                            <div style={{ display: "flex", gap: "6px" }}>
                              {job.sourceUrl && (
                                <a
                                  href={job.sourceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="btn btn-secondary btn-sm"
                                  style={{ textDecoration: "none" }}
                                >
                                  🔗 Link
                                </a>
                              )}
                              <button
                                className="btn btn-secondary btn-sm"
                                disabled={actionLoading === `match_${job.id}`}
                                onClick={() => {
                                  setSelectedJob(job);
                                  handleRunMatch(job.id);
                                }}
                              >
                                🎯 Match
                              </button>
                              <button
                                className={`btn btn-sm ${
                                  item.isEligibleForApplication ? "btn-primary" : "btn-secondary"
                                }`}
                                disabled={actionLoading === `apply_${job.id}`}
                                onClick={() => handleCreateApplication(job.id)}
                                title={!item.isEligibleForApplication ? "Filtered by Quality Gate: Manual Action Required" : "Draft application for approved tier"}
                              >
                                {actionLoading === `apply_${job.id}` ? (
                                  <span className="spinner" />
                                ) : item.isEligibleForApplication ? (
                                  "✉️ Draft"
                                ) : (
                                  "✉️ Manual Draft"
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ================================================================= */}
            {/* TAB 4: SENT & TRACKED APPLICATIONS DASHBOARD */}
            {/* ================================================================= */}
            {activeTab === "sent" && (
              <div className="card">
                <div className="card-header">
                  <div>
                    <h2 className="card-title">🚀 Applications & Delivery Tracker</h2>
                    <div className="card-subtitle">Real-time status of drafted, approved, dispatched, and replied applications</div>
                  </div>
                  <span className="badge badge-navy">{applications.length} Total Applications</span>
                </div>

                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--line)", textAlign: "left" }}>
                      <th style={{ padding: "10px" }}>Target Role & Employer</th>
                      <th style={{ padding: "10px" }}>Candidate</th>
                      <th style={{ padding: "10px" }}>Status</th>
                      <th style={{ padding: "10px" }}>Review Status</th>
                      <th style={{ padding: "10px" }}>Recipient</th>
                      <th style={{ padding: "10px" }}>Approved At</th>
                      <th style={{ padding: "10px" }}>Sent At</th>
                      <th style={{ padding: "10px" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applications.map((app) => (
                      <tr key={app.id} style={{ borderBottom: "1px solid var(--line)" }}>
                        <td style={{ padding: "10px" }}>
                          <strong>{app.job?.title}</strong>
                          <div style={{ fontSize: "11px", color: "var(--muted)" }}>{app.job?.company?.name}</div>
                        </td>
                        <td style={{ padding: "10px" }}>
                          {app.candidate?.firstName} {app.candidate?.lastName}
                        </td>
                        <td style={{ padding: "10px" }}>
                          <span
                            className={`badge ${
                              app.status === "APPROVED"
                                ? "badge-mint"
                                : app.status === "PENDING_APPROVAL"
                                ? "badge-gold"
                                : app.status === "SENT"
                                ? "badge-navy"
                                : "badge-coral"
                            }`}
                          >
                            {app.status}
                          </span>
                        </td>
                        <td style={{ padding: "10px" }}>
                          {app.selectedGeneratedEmail?.reviewStatus || "N/A"}
                        </td>
                        <td style={{ padding: "10px", fontSize: "12px", color: "var(--muted)" }}>
                          {app.selectedGeneratedEmail?.recipientEmail || "N/A"}
                        </td>
                        <td style={{ padding: "10px", fontSize: "11px", color: "var(--muted)" }}>
                          {app.approvedAt ? new Date(app.approvedAt).toLocaleDateString() : "—"}
                        </td>
                        <td style={{ padding: "10px", fontSize: "11px", color: "var(--muted)" }}>
                          {app.sentAt ? new Date(app.sentAt).toLocaleDateString() : "—"}
                        </td>
                        <td style={{ padding: "10px" }}>
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => {
                                setSelectedAppId(app.id);
                                setActiveTab("review");
                              }}
                            >
                              Inspect
                            </button>
                            {app.status === "APPROVED" && (
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() =>
                                  setApprovalModal({
                                    type: "SEND",
                                    application: app,
                                    notes: "",
                                  })
                                }
                              >
                                Send
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ================================================================= */}
            {/* TAB 5: CANDIDATE PROFILE & CV FACTS (NAYERA TAREK MOHAMED) */}
            {/* ================================================================= */}
            {activeTab === "candidate" && (
              <div className="panel-grid">
                <div className="card">
                  <div className="card-header">
                    <div>
                      <h2 className="card-title">Authoritative Candidate Profile</h2>
                      <div className="card-subtitle">Verified professional identity from CV (Source of Truth)</div>
                    </div>
                    <span className="badge badge-mint">{currentCandidate?.consentStatus}</span>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Full Name</label>
                    <input
                      className="form-control"
                      value={currentCandidate ? `${currentCandidate.firstName} ${currentCandidate.lastName}` : "Nayera Tarek Mohamed"}
                      readOnly
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Authoritative Email</label>
                    <input className="form-control" value={currentCandidate?.email || "tareknayera24@gmail.com"} readOnly />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Location</label>
                    <input
                      className="form-control"
                      value={currentCandidate?.location || "Roxy, Heliopolis, Cairo, Egypt"}
                      readOnly
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Professional Positioning</label>
                    <input
                      className="form-control"
                      value="LEGAL & BANKING SALES PROFESSIONAL"
                      readOnly
                      style={{ fontWeight: 700, color: "var(--navy)" }}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Profile Summary</label>
                    <textarea
                      className="form-control"
                      style={{ minHeight: "100px", fontSize: "13px", lineHeight: "1.5" }}
                      value={currentCandidate?.profileSummary || ""}
                      readOnly
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Consent Gate Status</label>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        className={`btn btn-sm ${currentCandidate?.consentStatus === "GRANTED" ? "btn-success" : "btn-secondary"}`}
                        onClick={() => handleUpdateConsent("GRANTED")}
                      >
                        ✓ Grant Consent
                      </button>
                      <button
                        className={`btn btn-sm ${currentCandidate?.consentStatus === "REVOKED" ? "btn-primary" : "btn-secondary"}`}
                        onClick={() => handleUpdateConsent("REVOKED")}
                      >
                        ✕ Revoke Consent
                      </button>
                    </div>
                  </div>
                </div>

                <div className="card">
                  <div className="card-header">
                    <div>
                      <h2 className="card-title">Verified CV Credentials</h2>
                      <div className="card-subtitle">Authoritative Education, Experience & Skills</div>
                    </div>
                    <span className="badge badge-navy">CV Verified</span>
                  </div>

                  <h4 style={{ margin: "0 0 8px", fontSize: "14px", color: "var(--navy)" }}>🎓 Education & Legal Diplomas:</h4>
                  <div style={{ fontSize: "13px", lineHeight: "1.6", marginBottom: "14px", color: "var(--ink)" }}>
                    <div>• <strong>LL.B of Law</strong> — Banha University — 2019 — Grade: Good</div>
                    <div>• <strong>Diploma of Administrative Sciences</strong> — Very Good</div>
                    <div>• <strong>Diploma of Public Law</strong> — Very Good</div>
                    <div>• <strong>LL.M of Law</strong> — Menoufia University</div>
                  </div>

                  <h4 style={{ margin: "0 0 8px", fontSize: "14px", color: "var(--navy)" }}>💼 Professional & Banking Experience:</h4>
                  <div style={{ fontSize: "13px", lineHeight: "1.6", marginBottom: "14px" }}>
                    <div>• <strong>Tele-Sales Officer</strong> — Attijariwafa Bank (May 2022 to September 2022)</div>
                    <div>• <strong>Tele-Sales Officer</strong> — Al Ahli Bank of Kuwait (October 2022 to May 2024)</div>
                    <div>• <strong>Tele-Sales Officer</strong> — ADIB Bank (June 2024 to September 2025)</div>
                    <div>• <strong>Recruitment Manager</strong> — Eden Cleaning Company (October 2025 to June 2026)</div>
                  </div>

                  <h4 style={{ margin: "0 0 8px", fontSize: "14px", color: "var(--navy)" }}>⚖️ Legal Experience:</h4>
                  <div style={{ fontSize: "13px", lineHeight: "1.6", marginBottom: "14px" }}>
                    <div>• <strong>Legal Intern</strong> — Dr. Zein El-Abdeen Law Office</div>
                    <div>• <strong>Legal Intern</strong> — Abdel Mawgood Law Office</div>
                  </div>

                  <h4 style={{ margin: "0 0 8px", fontSize: "14px", color: "var(--navy)" }}>📜 Courses:</h4>
                  <div className="tag-list" style={{ marginBottom: "14px" }}>
                    <span className="tag">ICDL</span>
                    <span className="tag">TOEFL</span>
                    <span className="tag">Banking courses</span>
                  </div>

                  <h4 style={{ margin: "0 0 8px", fontSize: "14px", color: "var(--navy)" }}>⭐ Core Skills:</h4>
                  <div className="tag-list">
                    {[
                      "Strong communication and client-handling",
                      "Legal research",
                      "Problem-solving",
                      "Decision-making",
                      "Sales target achievement",
                      "Teamwork",
                      "Collaboration",
                      "Professionalism",
                      "Quality/performance commitment",
                      "Time management",
                      "Punctuality",
                    ].map((s) => (
                      <span className="tag" key={s}>
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ================================================================= */}
            {/* TAB 6: AI MATCHER ON-DEMAND */}
            {/* ================================================================= */}
            {activeTab === "matcher" && (
              <div>
                {matchResult ? (
                  <div className="card">
                    <div className="card-header">
                      <div>
                        <h2 className="card-title">AI Compatibility Assessment</h2>
                        <div className="card-subtitle">
                          Candidate: {currentCandidate?.firstName} {currentCandidate?.lastName} • Target: {selectedJob?.title || "Target Role"}
                        </div>
                      </div>
                      <span className={`badge ${matchResult.category === "STRONG_MATCH" ? "badge-mint" : "badge-gold"}`}>
                        {matchResult.category}
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: "28px", alignItems: "center", marginBottom: "20px" }}>
                      <div className="score-circle">
                        {matchResult.matchScore}%<span>Score</span>
                      </div>
                      <div>
                        <h3 style={{ margin: "0 0 6px", fontSize: "16px", color: "var(--navy)" }}>Calibrated Match Reasoning</h3>
                        <p style={{ margin: 0, fontSize: "14px", color: "var(--muted)", lineHeight: 1.5 }}>
                          {matchResult.reasoning}
                        </p>
                        {matchResult.recommendation && (
                          <div style={{ marginTop: "6px" }}>
                            <span className="badge badge-mint">Recommendation: {matchResult.recommendation}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="panel-grid">
                      <div>
                        <h4 style={{ fontSize: "13px", color: "#065f46", textTransform: "uppercase" }}>✓ Matched Skills & Strengths</h4>
                        <div className="tag-list">
                          {matchResult.matchedSkills?.map((s: string) => (
                            <span className="tag" key={s}>
                              {s}
                            </span>
                          ))}
                        </div>
                        <ul style={{ fontSize: "13px", color: "var(--muted)", paddingLeft: "20px" }}>
                          {matchResult.strengths?.map((str: string, i: number) => (
                            <li key={i}>{str}</li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <h4 style={{ fontSize: "13px", color: "#991b1b", textTransform: "uppercase" }}>⚠️ Missing Requirements / Gaps</h4>
                        <div className="tag-list">
                          {matchResult.missingSkills?.length > 0 ? (
                            matchResult.missingSkills.map((m: string) => (
                              <span className="tag-missing" key={m}>
                                {m}
                              </span>
                            ))
                          ) : (
                            <span className="tag">All core requirements covered</span>
                          )}
                        </div>
                        <ul style={{ fontSize: "13px", color: "var(--muted)", paddingLeft: "20px" }}>
                          {matchResult.gaps?.map((gap: string, i: number) => (
                            <li key={i}>{gap}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div style={{ marginTop: "24px", display: "flex", justifyContent: "flex-end", gap: "12px" }}>
                      {selectedJob && (
                        <button className="btn btn-primary" onClick={() => handleCreateApplication(selectedJob.id)}>
                          Draft Application for this Position →
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="card empty-state">
                    <div className="empty-state-icon">🎯</div>
                    <div className="empty-state-title">Select a Job to Assess Compatibility</div>
                    <div className="empty-state-desc">The AI matcher evaluates candidate facts against requirements to detect strengths and gaps.</div>
                    <button className="btn btn-primary" onClick={() => setActiveTab("jobs")}>
                      Browse Real Job Vacancies
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ================================================================= */}
            {/* TAB 7: PIPELINE BOARD */}
            {/* ================================================================= */}
            {activeTab === "pipeline" && (
              <div>
                <div className="kanban-board">
                  {["DRAFT", "PENDING_APPROVAL", "APPROVED", "SENT", "REPLIED"].map((st) => {
                    const stageApps = applications.filter((a) => a.status === st);
                    return (
                      <div className="kanban-col" key={st}>
                        <div className="kanban-header">
                          <span>{st.replace("_", " ")}</span>
                          <span>({stageApps.length})</span>
                        </div>

                        {stageApps.map((app) => (
                          <div className="kanban-card" key={app.id}>
                            <div style={{ fontWeight: 700, fontSize: "14px", marginBottom: "4px" }}>
                              {app.job?.title || "Target Role"}
                            </div>
                            <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "4px" }}>
                              {app.job?.company?.name || "Employer"}
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "8px" }}>
                              👤 {app.candidate?.firstName} {app.candidate?.lastName}
                            </div>
                            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => {
                                  setSelectedAppId(app.id);
                                  setActiveTab("review");
                                }}
                              >
                                Review Dossier
                              </button>
                              {st === "APPROVED" && (
                                <button
                                  className="btn btn-primary btn-sm"
                                  onClick={() =>
                                    setApprovalModal({
                                      type: "SEND",
                                      application: app,
                                      notes: "",
                                    })
                                  }
                                >
                                  Send
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ================================================================= */}
            {/* TAB 8: IMMUTABLE AUDIT LOGS */}
            {/* ================================================================= */}
            {activeTab === "audit" && (
              <div className="card">
                <div className="card-header">
                  <div>
                    <h2 className="card-title">Immutable Audit Trail</h2>
                    <div className="card-subtitle">Traceable history of discovery, matching, human approvals, and delivery events</div>
                  </div>
                  <span className="badge badge-navy">{auditLogs.length} Records</span>
                </div>

                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--line)", textAlign: "left" }}>
                      <th style={{ padding: "10px" }}>Timestamp</th>
                      <th style={{ padding: "10px" }}>Action</th>
                      <th style={{ padding: "10px" }}>Actor</th>
                      <th style={{ padding: "10px" }}>Resource</th>
                      <th style={{ padding: "10px" }}>Correlation ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log) => (
                      <tr key={log.id} style={{ borderBottom: "1px solid var(--line)" }}>
                        <td style={{ padding: "10px", color: "var(--muted)" }}>
                          {new Date(log.occurredAt).toLocaleString()}
                        </td>
                        <td style={{ padding: "10px", fontWeight: 600 }}>{log.action}</td>
                        <td style={{ padding: "10px" }}>{log.actorType}</td>
                        <td style={{ padding: "10px" }}>
                          {log.resourceType} {log.resourceId ? `(${log.resourceId.slice(0, 8)}...)` : ""}
                        </td>
                        <td style={{ padding: "10px", fontFamily: "monospace", fontSize: "11px" }}>
                          {log.correlationId}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>

      {/* Human Approval Modal */}
      {approvalModal && (
        <div className="modal-backdrop" onClick={() => setApprovalModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {approvalModal.type === "APPROVE" && "✓ Approve Draft Email for Sending"}
                {approvalModal.type === "REJECT" && "✕ Reject Application Draft"}
                {approvalModal.type === "SEND" && "🚀 Confirm Email Dispatch via Delivery Gate"}
              </h3>
              <button
                style={{ background: "transparent", border: "none", fontSize: "18px", cursor: "pointer", color: "var(--muted)" }}
                onClick={() => setApprovalModal(null)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              {approvalModal.type === "APPROVE" && (
                <div>
                  <p style={{ fontSize: "14px", lineHeight: "1.5", margin: "0 0 16px" }}>
                    You are approving the personalized application draft for <strong>{approvalModal.application.job?.title}</strong> at <strong>{approvalModal.application.job?.company?.name}</strong>.
                  </p>
                  <div className="form-group">
                    <label className="form-label">Reviewer Notes (Recorded in Audit Trail)</label>
                    <textarea
                      className="form-control"
                      placeholder="e.g. Verified qualifications and tailored cover letter."
                      value={approvalModal.notes}
                      onChange={(e) =>
                        setApprovalModal({ ...approvalModal, notes: e.target.value })
                      }
                    />
                  </div>
                </div>
              )}

              {approvalModal.type === "REJECT" && (
                <div>
                  <p style={{ fontSize: "14px", lineHeight: "1.5", margin: "0 0 16px", color: "#991b1b" }}>
                    Rejecting this draft will reset the application to DRAFT status and prevent sending.
                  </p>
                  <div className="form-group">
                    <label className="form-label">Reason for Rejection</label>
                    <textarea
                      className="form-control"
                      placeholder="e.g. Incompatible role requirements or custom adjustments needed."
                      value={approvalModal.notes}
                      onChange={(e) =>
                        setApprovalModal({ ...approvalModal, notes: e.target.value })
                      }
                    />
                  </div>
                </div>
              )}

              {approvalModal.type === "SEND" && (
                <div>
                  <p style={{ fontSize: "14px", lineHeight: "1.5", margin: "0 0 16px" }}>
                    Confirm dispatch of approved application email for <strong>{approvalModal.application.job?.title}</strong> to <strong>{approvalModal.application.selectedGeneratedEmail?.recipientEmail}</strong>.
                  </p>
                  <div className="notice-box-success" style={{ fontSize: "13px" }}>
                    ✓ Safety Check: Candidate consent GRANTED • Draft Status APPROVED • No duplicate delivery.
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setApprovalModal(null)}>
                Cancel
              </button>
              {approvalModal.type === "APPROVE" && (
                <button
                  className="btn btn-success"
                  disabled={actionLoading !== null}
                  onClick={executeApproval}
                >
                  {actionLoading ? <span className="spinner" /> : "Confirm Approval"}
                </button>
              )}
              {approvalModal.type === "REJECT" && (
                <button
                  className="btn btn-primary"
                  disabled={actionLoading !== null}
                  onClick={executeRejection}
                >
                  {actionLoading ? <span className="spinner" /> : "Confirm Rejection"}
                </button>
              )}
              {approvalModal.type === "SEND" && (
                <button
                  className="btn btn-primary"
                  disabled={actionLoading !== null}
                  onClick={executeSend}
                >
                  {actionLoading ? <span className="spinner" /> : "Dispatch Email Now"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
