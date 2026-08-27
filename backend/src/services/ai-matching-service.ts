import { randomUUID } from "node:crypto";
import { prisma } from "../config/prisma.js";
import {
  AIAnalysisStatus,
  AIAnalysisType,
  ReviewDecision,
  type AIAnalysisRecord,
  isDbConnected,
  memoryStore,
} from "../store/db-store.js";
import { AppError } from "../utils/app-error.js";
import { getAIProvider, type JobMatchResult } from "./ai/ai-provider.js";
import { createAuditLog } from "./audit-service.js";
import { getCandidateById, getResumeById, listResumes } from "./candidate-service.js";
import { getJobById } from "./job-service.js";

export interface MatchEvaluationResponse {
  analysisId: string;
  candidateId: string;
  jobId: string;
  match: JobMatchResult;
  resumeId: string;
}

export async function evaluateCandidateJobMatch(
  candidateId: string,
  jobId: string,
  resumeId?: string,
): Promise<MatchEvaluationResponse> {
  const candidate = await getCandidateById(candidateId);
  const job = await getJobById(jobId);

  let targetResumeId = resumeId;
  if (!targetResumeId) {
    const resumes = await listResumes(candidateId);

    if (resumes.length === 0) {
      throw new AppError(
        "Candidate has no uploaded resumes to evaluate.",
        400,
        "RESUME_REQUIRED",
      );
    }
    targetResumeId = resumes[0].id;
  }

  const resume = await getResumeById(targetResumeId);
  const candidateFacts = {
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    targetRoles: candidate.targetRoles,
    profileSummary: candidate.profileSummary,
    skills: resume.parsedData?.skills || [
      "Banking Sales",
      "Telesales",
      "Customer Relationship Management",
    ],
    workExperience: resume.parsedData?.workExperience || [],
    education: resume.parsedData?.education || [],
  };

  const jobDetails = {
    title: job.title,
    description: job.description,
    location: job.location,
    companyName: job.company?.name,
    employmentType: job.employmentType,
  };

  const ai = getAIProvider();
  const matchResult = await ai.evaluateJobMatch(candidateFacts, jobDetails);

  const analysisId = randomUUID();
  const now = new Date();
  const analysisRecord: AIAnalysisRecord = {
    id: analysisId,
    candidateId,
    resumeId: targetResumeId,
    jobId,
    analysisType: AIAnalysisType.JOB_MATCH,
    status: AIAnalysisStatus.VALIDATED,
    reviewDecision: ReviewDecision.PENDING,
    modelProvider: matchResult.modelProvider,
    modelName: "JobMatchEvaluator-v1",
    promptVersion: matchResult.promptVersion,
    inputRecordVersions: { candidateVersion: candidate.updatedAt, resumeVersion: resume.version },
    structuredResult: matchResult as any,
    explanation: { reasoning: matchResult.reasoning, strengths: matchResult.strengths, gaps: matchResult.gaps },
    matchScore: matchResult.matchScore,
    createdAt: now,
    updatedAt: now,
  };

  if (await isDbConnected()) {
    try {
      await prisma.aIAnalysis.create({
        data: {
          id: analysisRecord.id,
          candidateId: analysisRecord.candidateId,
          resumeId: analysisRecord.resumeId,
          jobId: analysisRecord.jobId,
          analysisType: analysisRecord.analysisType,
          status: analysisRecord.status,
          reviewDecision: analysisRecord.reviewDecision,
          modelProvider: analysisRecord.modelProvider,
          modelName: analysisRecord.modelName,
          promptVersion: analysisRecord.promptVersion,
          inputRecordVersions: analysisRecord.inputRecordVersions as any,
          structuredResult: analysisRecord.structuredResult as any,
          explanation: analysisRecord.explanation as any,
          matchScore: analysisRecord.matchScore,
          createdAt: analysisRecord.createdAt,
          updatedAt: analysisRecord.updatedAt,
        },
      });
    } catch {
      // Safe fallback
    }
  }

  memoryStore.aiAnalyses.set(analysisId, analysisRecord);

  await createAuditLog({
    candidateId,
    action: "JOB_MATCH_EVALUATED",
    resourceType: "AIAnalysis",
    resourceId: analysisId,
    eventType: "MATCH_SCORE_CALCULATED",
    safeMetadata: { jobId, score: matchResult.matchScore, category: matchResult.category },
  });

  return {
    analysisId,
    candidateId,
    jobId,
    resumeId: targetResumeId,
    match: matchResult,
  };
}

export async function getAnalysisById(id: string): Promise<AIAnalysisRecord> {
  if (await isDbConnected()) {
    const analysis = await prisma.aIAnalysis.findUnique({ where: { id } });
    if (!analysis) {
      throw new AppError(`AI Analysis with ID ${id} not found.`, 404, "ANALYSIS_NOT_FOUND");
    }
    return analysis as AIAnalysisRecord;
  }

  const analysis = memoryStore.aiAnalyses.get(id);
  if (!analysis) {
    throw new AppError(`AI Analysis with ID ${id} not found.`, 404, "ANALYSIS_NOT_FOUND");
  }
  return analysis;
}

import {
  evaluateCandidateEligibility,
  type PriorityTier,
} from "./eligibility-service.js";

export interface RankedJobMatch {
  job: any;
  matchScore: number;
  eligibilityScore: number;
  priorityTier: PriorityTier;
  category: "STRONG_MATCH" | "POTENTIAL_MATCH" | "LOW_MATCH";
  recommendation: string;
  matchedSkills: string[];
  missingSkills: string[];
  reasoning: string;
  strengths: string[];
  primaryCategory: string;
  trackName?: string;
  searchQuery?: string;
  provider?: string;
  whyItMatches: string[];
  missingCriticalRequirements: string[];
  isEligibleForApplication: boolean;
}

export async function getRankedJobsForCandidate(
  candidateId: string,
  options?: { minScore?: number; limit?: number; tierFilter?: PriorityTier },
): Promise<RankedJobMatch[]> {
  const { listJobs } = await import("./job-service.js");
  const allJobs = await listJobs();
  const rankedResults: RankedJobMatch[] = [];

  for (const job of allJobs) {
    try {
      const evalResult = await evaluateCandidateJobMatch(candidateId, job.id);
      const match = evalResult.match;

      const eligibility = evaluateCandidateEligibility({
        title: job.title,
        description: job.description,
        location: job.location,
        categories: job.categories,
      });

      if (options?.tierFilter && eligibility.priorityTier !== options.tierFilter) {
        continue;
      }

      if (options?.minScore && match.matchScore < options.minScore) {
        continue;
      }

      const rawMeta = (job.rawReferenceMetadata as Record<string, any>) || {};
      const primaryCat = job.categories?.[0] || "OTHER";

      rankedResults.push({
        job,
        matchScore: match.matchScore,
        eligibilityScore: eligibility.eligibilityScore,
        priorityTier: eligibility.priorityTier,
        category: match.category,
        recommendation: eligibility.recommendation,
        matchedSkills: match.matchedSkills,
        missingSkills: match.missingSkills,
        reasoning: match.reasoning,
        strengths: match.strengths,
        primaryCategory: primaryCat,
        trackName: rawMeta.trackName || rawMeta.trackId || primaryCat,
        searchQuery: rawMeta.searchQuery,
        provider: rawMeta.provider || job.jobSource?.name || "Jooble Real Jobs API",
        whyItMatches: eligibility.whyItMatches,
        missingCriticalRequirements: eligibility.missingCriticalRequirements,
        isEligibleForApplication: eligibility.isEligibleForApplication,
      });
    } catch {
      // Ignore individual match error
    }
  }

  const getTierOrder = (tier: PriorityTier): number => {
    switch (tier) {
      case "HIGH_PRIORITY": return 4;
      case "GOOD_MATCH": return 3;
      case "LOW_MATCH": return 2;
      case "REJECT": return 1;
      default: return 0;
    }
  };

  rankedResults.sort((a, b) => {
    // 1. Priority Tier
    const tierDiff = getTierOrder(b.priorityTier) - getTierOrder(a.priorityTier);
    if (tierDiff !== 0) return tierDiff;

    // 2. Eligibility Score
    const eligDiff = b.eligibilityScore - a.eligibilityScore;
    if (eligDiff !== 0) return eligDiff;

    // 3. AI Match Score
    const matchDiff = b.matchScore - a.matchScore;
    if (matchDiff !== 0) return matchDiff;

    // 4. Newest posted date
    const dateA = a.job.postedAt ? new Date(a.job.postedAt).getTime() : 0;
    const dateB = b.job.postedAt ? new Date(b.job.postedAt).getTime() : 0;
    return dateB - dateA;
  });

  if (options?.limit) {
    return rankedResults.slice(0, options.limit);
  }

  return rankedResults;
}

