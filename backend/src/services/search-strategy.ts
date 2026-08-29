import { JobCategory } from "./categories/job-category.js";

export interface SearchTrack {
  id: string;
  name: string;
  category: JobCategory;
  priority: number;
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

/*
 * ============================================================
 * SEARCH TRACKS
 * ============================================================
 *
 * Broad but targeted search strategy for the candidate.
 * Multiple title variants are used to increase coverage.
 */

/* 1. LEGAL / LEGAL AFFAIRS */
export const TRACK_LEGAL_AFFAIRS: SearchTrack = {
  id: "legal_affairs",
  name: "Legal Affairs & Corporate Counsel",
  category: JobCategory.LEGAL,
  priority: 1,

  keywords: [
    "Legal Affairs Egypt",
    "Legal Counsel Egypt",
    "Legal Counsel Cairo",
    "Legal Affairs Specialist Egypt",
    "Legal Specialist Egypt",
    "Legal Specialist Cairo",
    "Corporate Lawyer Egypt",
    "Corporate Counsel Egypt",
    "Legal Advisor Egypt",
    "Legal Advisor Cairo",
    "Corporate Legal Egypt",
    "Legal Researcher Egypt",
    "Legal Officer Egypt",
    "Junior Legal Counsel Egypt",
    "Legal Executive Egypt",
    "In House Counsel Egypt",
    "In-House Legal Egypt",
    "Paralegal Egypt",
    "Legal Coordinator Egypt",
    "Legal Administrator Egypt",
  ],

  arabicKeywords: [
    "شؤون قانونية مصر",
    "مستشار قانوني مصر",
    "محامي شركات مصر",
    "أخصائي قانوني مصر",
    "مسؤول قانوني مصر",
    "باحث قانوني مصر",
    "إدارة قانونية مصر",
  ],

  suggestedJobCategories: [
    JobCategory.LEGAL,
  ],
};

/* 2. COMPLIANCE / GOVERNANCE */
export const TRACK_COMPLIANCE: SearchTrack = {
  id: "compliance",
  name: "Regulatory Compliance & Governance",
  category: JobCategory.COMPLIANCE,
  priority: 1,

  keywords: [
    "Compliance Officer Egypt",
    "Compliance Specialist Egypt",
    "Compliance Officer Cairo",
    "Regulatory Compliance Egypt",
    "Regulatory Compliance Cairo",
    "Compliance Analyst Egypt",
    "AML Compliance Egypt",
    "AML Analyst Egypt",
    "KYC Compliance Egypt",
    "KYC Analyst Egypt",
    "Financial Crime Compliance Egypt",
    "Risk Compliance Egypt",
    "Regulatory Affairs Egypt",
    "Regulatory Affairs Cairo",
    "Governance Specialist Egypt",
    "Corporate Governance Egypt",
    "Internal Compliance Egypt",
    "Compliance Associate Egypt",
    "Compliance Manager Egypt",
  ],

  arabicKeywords: [
    "امتثال مصر",
    "مسؤول امتثال مصر",
    "أخصائي امتثال مصر",
    "مكافحة غسل الأموال مصر",
    "اعرف عميلك مصر",
    "شؤون تنظيمية مصر",
    "حوكمة الشركات مصر",
  ],

  suggestedJobCategories: [
    JobCategory.COMPLIANCE,
    JobCategory.REGULATORY,
  ],
};

/* 3. CONTRACTS */
export const TRACK_CONTRACTS: SearchTrack = {
  id: "contracts",
  name: "Contracts & Commercial Agreements",
  category: JobCategory.CONTRACTS,
  priority: 1,

  keywords: [
    "Contracts Specialist Egypt",
    "Contract Specialist Egypt",
    "Contract Management Egypt",
    "Contract Management Cairo",
    "Contracts Administrator Egypt",
    "Contracts Administrator Cairo",
    "Commercial Contracts Egypt",
    "Commercial Contract Specialist Egypt",
    "Contract Analyst Egypt",
    "Contract Coordinator Egypt",
    "Contract Officer Egypt",
    "Contract Drafting Egypt",
    "Contract Review Egypt",
    "Commercial Agreements Egypt",
    "Legal Contracts Egypt",
    "Contract Compliance Egypt",
    "Contract Negotiation Egypt",
    "Contracts Manager Egypt",
  ],

  arabicKeywords: [
    "وظائف عقود مصر",
    "أخصائي عقود مصر",
    "إدارة عقود مصر",
    "مراجعة عقود مصر",
    "صياغة عقود مصر",
    "مسؤول عقود مصر",
  ],

  suggestedJobCategories: [
    JobCategory.CONTRACTS,
    JobCategory.LEGAL,
  ],
};

/* 4. BANKING / FINANCE */
export const TRACK_BANKING: SearchTrack = {
  id: "banking",
  name: "Banking & Financial Operations",
  category: JobCategory.BANKING,
  priority: 2,

  keywords: [
    "Banking Egypt",
    "Banking Cairo",
    "Banking Officer Egypt",
    "Banking Operations Egypt",
    "Banking Operations Cairo",
    "Retail Banking Egypt",
    "Branch Banking Egypt",
    "Relationship Officer Bank Egypt",
    "Customer Service Bank Egypt",
    "Banking Specialist Egypt",
    "Banking Associate Egypt",
    "Credit Officer Egypt",
    "Credit Analyst Egypt",
    "Financial Operations Egypt",
    "Banking Administration Egypt",
    "Back Office Banking Egypt",
    "Banking Support Egypt",
  ],

  arabicKeywords: [
    "وظائف بنوك مصر",
    "عمليات بنكية مصر",
    "خدمة عملاء بنك مصر",
    "موظف بنك مصر",
    "عمليات مصرفية مصر",
    "خدمات مصرفية مصر",
  ],

  suggestedJobCategories: [
    JobCategory.BANKING,
    JobCategory.FINANCE,
  ],
};

/* 5. BANKING SALES / TELESALES */
export const TRACK_BANKING_SALES: SearchTrack = {
  id: "banking_sales",
  name: "Banking Sales & Outbound Telesales",
  category: JobCategory.SALES,
  priority: 2,

  keywords: [
    "Banking Sales Egypt",
    "Banking Sales Cairo",
    "Telesales Egypt",
    "Telesales Cairo",
    "Banking Tele-Sales Egypt",
    "Outbound Sales Egypt",
    "Outbound Sales Cairo",
    "Sales Representative Egypt",
    "Sales Representative Cairo",
    "Retail Sales Officer Egypt",
    "Relationship Manager Bank Egypt",
    "Relationship Officer Bank Egypt",
    "Inside Sales Egypt",
    "Call Center Sales Egypt",
    "Telemarketing Egypt",
    "Direct Sales Egypt",
    "Business Development Sales Egypt",
  ],

  arabicKeywords: [
    "مبيعات بنكية مصر",
    "تلي سيلز مصر",
    "تلي سيلز القاهرة",
    "مبيعات هاتفية مصر",
    "مبيعات بنوك مصر",
    "موظف مبيعات بنك مصر",
  ],

  suggestedJobCategories: [
    JobCategory.SALES,
    JobCategory.BANKING,
  ],
};

/* 6. CUSTOMER RELATIONS / CUSTOMER SERVICE */
export const TRACK_CUSTOMER_RELATIONS: SearchTrack = {
  id: "customer_relations",
  name: "Customer Relations & Client Management",
  category: JobCategory.CUSTOMER_SERVICE,
  priority: 3,

  keywords: [
    "Customer Relations Egypt",
    "Customer Relations Cairo",
    "Customer Service Egypt",
    "Customer Service Cairo",
    "Customer Care Egypt",
    "Customer Support Egypt",
    "Client Relations Egypt",
    "Client Service Egypt",
    "Client Handling Egypt",
    "Relationship Officer Egypt",
    "Relationship Manager Egypt",
    "Account Coordinator Egypt",
    "Account Executive Egypt",
    "Customer Success Egypt",
    "Customer Experience Egypt",
    "Call Center Representative Egypt",
    "Customer Support Specialist Egypt",
  ],

  arabicKeywords: [
    "خدمة عملاء مصر",
    "خدمة عملاء القاهرة",
    "علاقات عملاء مصر",
    "مسؤول خدمة عملاء مصر",
    "دعم العملاء مصر",
    "علاقات العملاء مصر",
  ],

  suggestedJobCategories: [
    JobCategory.CUSTOMER_SERVICE,
    JobCategory.SALES,
  ],
};

/* 7. RECRUITMENT / HR */
export const TRACK_RECRUITMENT_HR: SearchTrack = {
  id: "recruitment_hr",
  name: "Recruitment & Talent Acquisition Management",
  category: JobCategory.RECRUITMENT,
  priority: 3,

  keywords: [
    "Recruitment Specialist Egypt",
    "Recruitment Specialist Cairo",
    "Recruiter Egypt",
    "Recruiter Cairo",
    "Talent Acquisition Egypt",
    "Talent Acquisition Cairo",
    "HR Specialist Egypt",
    "HR Specialist Cairo",
    "HR Recruiter Egypt",
    "Technical Recruiter Egypt",
    "Recruitment Coordinator Egypt",
    "Recruitment Officer Egypt",
    "Recruitment Manager Egypt",
    "Talent Acquisition Specialist Egypt",
    "Employee Relations Egypt",
    "Human Resources Egypt",
    "HR Coordinator Egypt",
    "HR Generalist Egypt",
  ],

  arabicKeywords: [
    "وظائف موارد بشرية مصر",
    "وظائف توظيف مصر",
    "أخصائي توظيف مصر",
    "مسؤول توظيف مصر",
    "استقطاب مواهب مصر",
    "موارد بشرية القاهرة",
    "توظيف القاهرة",
  ],

  suggestedJobCategories: [
    JobCategory.RECRUITMENT,
    JobCategory.HR,
  ],
};

/*
 * ============================================================
 * MASTER PROFILE
 * ============================================================
 */

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
  "New Cairo",
  "Heliopolis",
  "Nasr City",
  "Maadi",
  "6th of October",
  "Sheikh Zayed",
  "Smart Village",
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

/*
 * ============================================================
 * KEYWORD HELPERS
 * ============================================================
 */

export function getAllSearchKeywords(): string[] {
  const keywordsSet = new Set<string>();

  for (const track of NAYERA_CAREER_TRACKS) {
    for (const keyword of track.keywords) {
      const normalized = keyword.trim();

      if (normalized) {
        keywordsSet.add(normalized);
      }
    }

    for (const keyword of track.arabicKeywords) {
      const normalized = keyword.trim();

      if (normalized) {
        keywordsSet.add(normalized);
      }
    }
  }

  return Array.from(keywordsSet);
}

/*
 * ============================================================
 * SEARCH PLAN
 * ============================================================
 *
 * Default:
 * - 5 English queries per track
 * - 2 Arabic queries per track
 *
 * Priority 1 tracks run first.
 */

export function getNayeraSearchPlan(options?: {
  maxQueriesPerTrack?: number;
  maxArabicQueriesPerTrack?: number;
  primaryLocationOnly?: boolean;
}): SearchQueryItem[] {
  const maxEnglish =
    options?.maxQueriesPerTrack ?? 5;

  const maxArabic =
    options?.maxArabicQueriesPerTrack ?? 2;

  /*
   * The current profile is Egypt-first.
   * The provider receives "Egypt" as the primary location.
   */
  const location = "Egypt";

  const plan: SearchQueryItem[] = [];

  /*
   * Priority ordering:
   * 1 = Legal / Compliance / Contracts
   * 2 = Banking / Banking Sales
   * 3 = Customer Relations / Recruitment
   */
  const sortedTracks = [...NAYERA_CAREER_TRACKS].sort(
    (a, b) => a.priority - b.priority,
  );

  for (const track of sortedTracks) {
    /*
     * English queries
     */
    const englishQueries = track.keywords
      .map((query) => query.trim())
      .filter(Boolean)
      .slice(0, maxEnglish);

    for (const query of englishQueries) {
      plan.push({
        trackId: track.id,
        trackName: track.name,
        category: track.category,
        query,
        language: "en",
        location,
        priority: track.priority,
      });
    }

    /*
     * Arabic queries
     */
    const arabicQueries = track.arabicKeywords
      .map((query) => query.trim())
      .filter(Boolean)
      .slice(0, maxArabic);

    for (const query of arabicQueries) {
      plan.push({
        trackId: track.id,
        trackName: track.name,
        category: track.category,
        query,
        language: "ar",
        location,
        priority: track.priority,
      });
    }
  }

  /*
   * Remove duplicate query/location combinations.
   */
  const seen = new Set<string>();

  return plan.filter((item) => {
    const key =
      `${item.language}|${item.query.toLowerCase()}|${item.location.toLowerCase()}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

/*
 * ============================================================
 * SEARCH PLAN SUMMARY
 * ============================================================
 */

export function getSearchPlanSummary(): {
  totalQueries: number;
  englishQueries: number;
  arabicQueries: number;
  priority1Queries: number;
  priority2Queries: number;
  priority3Queries: number;
} {
  const plan = getNayeraSearchPlan({
    maxQueriesPerTrack: 5,
    maxArabicQueriesPerTrack: 2,
  });

  return {
    totalQueries: plan.length,
    englishQueries: plan.filter(
      (item) => item.language === "en",
    ).length,
    arabicQueries: plan.filter(
      (item) => item.language === "ar",
    ).length,
    priority1Queries: plan.filter(
      (item) => item.priority === 1,
    ).length,
    priority2Queries: plan.filter(
      (item) => item.priority === 2,
    ).length,
    priority3Queries: plan.filter(
      (item) => item.priority === 3,
    ).length,
  };
}