import { JobCategory } from "./categories/job-category.js";

export interface SearchTrack {
  id: string;
  name: string;
  category: JobCategory;
  priority: number; // 1 = highest priority (Legal, Compliance, Contracts)
  keywords: string[];
  arabicKeywords: string[];
  suggestedJobCategories: JobCategory[];
}

export interface SearchQueryItem {
  trackId: string;
  trackName: string;
  category: JobCategory;
  query: string;
  language: "en" | "ar";
  location: string;
  priority: number;
}

export interface CandidateSearchProfile {
  candidateId: string;
  candidateName: string;
  locations: string[];
  tracks: SearchTrack[];
  defaultTrackId?: string;
}

// 1. LEGAL / LEGAL AFFAIRS (Priority 1)
export const TRACK_LEGAL_AFFAIRS: SearchTrack = {
  id: "legal_affairs",
  name: "Legal Affairs & Corporate Counsel",
  category: JobCategory.LEGAL,
  priority: 1,
  keywords: [
    "Legal Affairs Egypt",
    "Legal Counsel Cairo",
    "Legal Affairs Specialist Egypt",
    "Legal Specialist Cairo",
    "Corporate Lawyer Egypt",
    "Legal Advisor Cairo",
    "Corporate Legal Egypt",
    "Legal Researcher Cairo",
  ],
  arabicKeywords: [
    "وظائف شؤون قانونية مصر",
    "شؤون قانونية القاهرة",
    "وظائف قانونية مصر",
    "مستشار قانوني القاهرة",
    "محامي شركات مصر",
    "إدارة قانونية القاهرة",
  ],
  suggestedJobCategories: [JobCategory.LEGAL],
};

// 2. COMPLIANCE (Priority 1)
export const TRACK_COMPLIANCE: SearchTrack = {
  id: "compliance",
  name: "Regulatory Compliance & Governance",
  category: JobCategory.COMPLIANCE,
  priority: 1,
  keywords: [
    "Compliance Officer Egypt",
    "Regulatory Compliance Cairo",
    "Compliance Specialist Egypt",
    "AML Compliance Cairo",
    "KYC Compliance Egypt",
    "Regulatory Affairs Cairo",
  ],
  arabicKeywords: [
    "وظائف امتثال مصر",
    "امتثال القاهرة",
    "شؤون تنظيمية مصر",
    "مكافحة غسل الأموال مصر",
  ],
  suggestedJobCategories: [JobCategory.COMPLIANCE, JobCategory.REGULATORY],
};

// 3. CONTRACTS (Priority 1)
export const TRACK_CONTRACTS: SearchTrack = {
  id: "contracts",
  name: "Contracts & Commercial Agreements",
  category: JobCategory.CONTRACTS,
  priority: 1,
  keywords: [
    "Contracts Specialist Egypt",
    "Contract Management Cairo",
    "Commercial Contracts Egypt",
    "Contracts Administrator Cairo",
    "Contract Drafting Egypt",
  ],
  arabicKeywords: [
    "وظائف عقود القاهرة",
    "إدارة عقود مصر",
    "صياغة عقود مصر",
    "مراجعة عقود القاهرة",
  ],
  suggestedJobCategories: [JobCategory.CONTRACTS, JobCategory.LEGAL],
};

// 4. BANKING (Priority 2)
export const TRACK_BANKING: SearchTrack = {
  id: "banking",
  name: "Banking & Financial Operations",
  category: JobCategory.BANKING,
  priority: 2,
  keywords: [
    "Banking Cairo",
    "Banking Officer Egypt",
    "Branch Banking Cairo",
    "Banking Operations Egypt",
    "Retail Banking Cairo",
  ],
  arabicKeywords: [
    "وظائف بنوك مصر",
    "عمليات بنكية القاهرة",
    "خدمات مصرفية مصر",
  ],
  suggestedJobCategories: [JobCategory.BANKING, JobCategory.FINANCE],
};

// 5. BANKING SALES / TELE-SALES (Priority 2)
export const TRACK_BANKING_SALES: SearchTrack = {
  id: "banking_sales",
  name: "Banking Sales & Outbound Telesales",
  category: JobCategory.SALES,
  priority: 2,
  keywords: [
    "Banking Sales Egypt",
    "Telesales Cairo",
    "Banking Tele-Sales Egypt",
    "Outbound Sales Cairo",
    "Retail Sales Officer Egypt",
  ],
  arabicKeywords: [
    "مبيعات بنكية مصر",
    "تلي سيلز القاهرة",
    "تسويق هاتفي بنوك مصر",
    "مسؤول مبيعات بنوك القاهرة",
  ],
  suggestedJobCategories: [JobCategory.SALES, JobCategory.BANKING],
};

// 6. CUSTOMER RELATIONS (Priority 3)
export const TRACK_CUSTOMER_RELATIONS: SearchTrack = {
  id: "customer_relations",
  name: "Customer Relations & Client Management",
  category: JobCategory.CUSTOMER_SERVICE,
  priority: 3,
  keywords: [
    "Customer Relations Cairo",
    "Relationship Officer Egypt",
    "Customer Service Cairo",
    "Client Handling Egypt",
    "Relationship Manager Cairo",
  ],
  arabicKeywords: [
    "خدمة عملاء القاهرة",
    "علاقات عملاء مصر",
    "مسؤول علاقات القاهرة",
  ],
  suggestedJobCategories: [JobCategory.CUSTOMER_SERVICE, JobCategory.SALES],
};

// 7. RECRUITMENT / HR (Priority 3)
export const TRACK_RECRUITMENT_HR: SearchTrack = {
  id: "recruitment_hr",
  name: "Recruitment & Talent Acquisition Management",
  category: JobCategory.RECRUITMENT,
  priority: 3,
  keywords: [
    "Recruitment Specialist Cairo",
    "HR Specialist Egypt",
    "Talent Acquisition Cairo",
    "Recruitment Manager Cairo",
    "Employee Relations Egypt",
  ],
  arabicKeywords: [
    "وظائف موارد بشرية القاهرة",
    "وظائف توظيف مصر",
    "استقطاب مواهب القاهرة",
    "مسؤول موارد بشرية مصر",
  ],
  suggestedJobCategories: [JobCategory.RECRUITMENT, JobCategory.HR],
};

export const NAYERA_CAREER_TRACKS: SearchTrack[] = [
  TRACK_LEGAL_AFFAIRS,
  TRACK_COMPLIANCE,
  TRACK_CONTRACTS,
  TRACK_BANKING,
  TRACK_BANKING_SALES,
  TRACK_CUSTOMER_RELATIONS,
  TRACK_RECRUITMENT_HR,
];

export const NAYERA_TARGET_LOCATIONS: string[] = [
  "Egypt",
  "Cairo",
  "Giza",
  "Alexandria",
  "Remote",
  "Hybrid",
];

export const DEFAULT_NAYERA_SEARCH_PROFILE: CandidateSearchProfile = {
  candidateId: "c1000000-0000-0000-0000-000000000001",
  candidateName: "Nayera Tarek Mohamed",
  locations: NAYERA_TARGET_LOCATIONS,
  defaultTrackId: "legal_affairs",
  tracks: NAYERA_CAREER_TRACKS,
};

/**
 * Returns all distinct search keywords across all 7 career tracks.
 */
export function getAllSearchKeywords(): string[] {
  const keywordsSet = new Set<string>();
  for (const track of NAYERA_CAREER_TRACKS) {
    track.keywords.forEach((k) => keywordsSet.add(k));
    track.arabicKeywords.forEach((k) => keywordsSet.add(k));
  }
  return Array.from(keywordsSet);
}

/**
 * Generates an expanded, prioritized search query plan for Nayera Tarek.
 * Priority 1 (Legal, Compliance, Contracts) queries appear first, followed by
 * Priority 2 (Banking, Telesales) and Priority 3 (Customer Relations, HR).
 */
export function getNayeraSearchPlan(options?: {
  maxQueriesPerTrack?: number;
  primaryLocationOnly?: boolean;
}): SearchQueryItem[] {
  const maxPerTrack = options?.maxQueriesPerTrack ?? 2;
  const location = "Egypt";
  const plan: SearchQueryItem[] = [];

  // Sort tracks by priority (1 = highest)
  const sortedTracks = [...NAYERA_CAREER_TRACKS].sort((a, b) => a.priority - b.priority);

  for (const track of sortedTracks) {
    // English queries for this track
    const enSelected = track.keywords.slice(0, maxPerTrack);
    for (const q of enSelected) {
      plan.push({
        trackId: track.id,
        trackName: track.name,
        category: track.category,
        query: q,
        language: "en",
        location,
        priority: track.priority,
      });
    }

    // Arabic query for this track
    const arSelected = track.arabicKeywords.slice(0, 1);
    for (const q of arSelected) {
      plan.push({
        trackId: track.id,
        trackName: track.name,
        category: track.category,
        query: q,
        language: "ar",
        location,
        priority: track.priority,
      });
    }
  }

  return plan;
}
