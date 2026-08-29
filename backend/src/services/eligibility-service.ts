import { JobCategory, classifyJobCategories } from "./categories/job-category.js";

export type PriorityTier = "HIGH_PRIORITY" | "GOOD_MATCH" | "LOW_MATCH" | "REJECT";

export interface CandidateVerifiedFacts {
  name: string;
  email: string;
  location: string;
  degrees: Array<{ title: string; institution: string; year?: number; grade?: string }>;
  diplomas: Array<{ title: string; institution: string; grade?: string }>;
  legalInternships: Array<{ office: string; role: string }>;
  workExperience: Array<{ company: string; role: string; period: string; responsibilities: string[] }>;
  skills: string[];
  certifications: string[];
  languages: string[];
}

export const NAYERA_VERIFIED_FACTS: CandidateVerifiedFacts = {
  name: "Nayera Tarek Mohamed",
  email: "tareknayera24@gmail.com",
  location: "Roxy, Heliopolis, Cairo, Egypt",
  degrees: [
    { title: "LL.B of Law", institution: "Banha University", year: 2019, grade: "Good" },
    { title: "LL.M of Law", institution: "Menoufia University" },
  ],
  diplomas: [
    { title: "Diploma of Administrative Sciences", institution: "Menoufia University", grade: "Very Good" },
    { title: "Diploma of Public Law", institution: "Menoufia University", grade: "Very Good" },
  ],
  legalInternships: [
    { office: "Dr. Zein El-Abdeen Law Office", role: "Legal Intern" },
    { office: "Abdel Mawgood Law Office", role: "Legal Intern" },
  ],
  workExperience: [
    {
      company: "Attijariwafa Bank",
      role: "Tele-Sales Officer",
      period: "May 2022 to September 2022",
      responsibilities: ["Outbound banking sales", "Client communication and target achievement"],
    },
    {
      company: "Al Ahli Bank of Kuwait",
      role: "Tele-Sales Officer",
      period: "October 2022 to May 2024",
      responsibilities: ["Tele-sales of retail loans and credit cards", "Customer relationship management"],
    },
    {
      company: "ADIB Bank",
      role: "Tele-Sales Officer",
      period: "June 2024 to September 2025",
      responsibilities: ["Outbound banking sales and customer handling", "Achieving monthly sales targets"],
    },
    {
      company: "Eden Cleaning Company",
      role: "Recruitment Manager",
      period: "October 2025 to June 2026",
      responsibilities: ["Recruitment management and candidate screening", "Talent acquisition and team coordination"],
    },
  ],
  skills: [
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
  ],
  certifications: ["ICDL", "TOEFL", "Banking courses"],
  languages: ["Arabic (Native)", "English"],
};

export interface EligibilityEvaluation {
  eligibilityScore: number; // 0-100
  priorityTier: PriorityTier;
  roleCategory: string;
  qualificationAlignment: {
    hasLawDegree: boolean;
    hasMasterDegree: boolean;
    hasPublicLawDiploma: boolean;
    hasAdminDiploma: boolean;
    hasLegalInternships: boolean;
    matchedQualifications: string[];
  };
  experienceAlignment: {
    hasBankingExperience: boolean;
    hasTelesalesExperience: boolean;
    hasRecruitmentExperience: boolean;
    matchedEmployers: string[];
    matchedRoles: string[];
  };
  locationAlignment: {
    isCompatible: boolean;
    matchedLocation: string;
  };
  seniorityAlignment: {
    isCompatible: boolean;
    level: "ENTRY" | "MID" | "SENIOR" | "EXECUTIVE";
  };
  missingCriticalRequirements: string[];
  whyItMatches: string[];
  recommendation: string;
  isEligibleForApplication: boolean;
}

// Disqualifier patterns: roles requiring technical/science/engineering degrees not possessed by candidate
const TECHNICAL_DISQUALIFIERS: RegExp[] = [
  /\b(software engineer|software developer|fullstack|frontend|backend|react|node\.js|python developer|java developer|c\+\+|devops|kubernetes|docker|aws architect)\b/i,
  /\b(semiconductor|microelectronics|chemistry specialist|chemist|chemical engineer|civil engineer|mechanical engineer|electrical engineer|petroleum)\b/i,
  /\b(wms specialist|warehouse management system|data engineer|machine learning|ai engineer|embedded systems)\b/i,
  /\b(wordpress|web developer|php developer|flutter|ios developer|android developer)\b/i,
  /\b(subtitling specialist|video editor|motion graphics|pharmacist|physician|nurse|dentist)\b/i,
];

export interface LocationEvaluationResult {
  isCompatible: boolean;
  classification: "EGYPT_LOCAL" | "EGYPT_REMOTE" | "EGYPT_HYBRID" | "FOREIGN_REJECTED" | "UNKNOWN";
  matchedLocation: string;
  reason: string;
}

export const EGYPT_LOCATION_PATTERNS = [
  /\b(egypt|cairo|giza|greater cairo|new cairo|heliopolis|nasr city|alexandria|alex|6th of october|sheikh zayed|maadi|zamalek|dokki|mohandessin|smart village|tagamoa|shorouk|obour|rehab|madinaty|banha|menoufia|monufia|tanta|mansoura|assiut|hurghada|sharm|sharm el sheikh|el gouna|port said|suez|ismailia|damietta|sohag|luxor|aswan|minya|el menia|fayoum|beni suef|bani suef|kafr el sheikh|qalyubia|beheira|matrouh|marsa matrouh|alamein|el alamein|zagazig|sharqia|gharbia|dakahlia|red sea|10th of ramadan)\b/i,
  /(مصر|القاهرة|الجيزة|مصر الجديدة|مدينة نصر|التجمع|التجمع الخامس|الاسكندرية|الإسكندرية|الشيخ زايد|أكتوبر|٦ أكتوبر|السادس من أكتوبر|المعادي|المهندسين|الدقي|الزمالك|القرية الذكية|الشروق|العبور|الرحاب|مدينتي|بنها|المنوفية|طنطا|المنصورة|أسيوط|الغردقة|شرم الشيخ|الجونة|بورسعيد|السويس|الإسماعيلية|اسماعيلية|دمياط|سوهاج|الأقصر|الاقصر|أسوان|اسوان|المنيا|الفيوم|بني سويف|كفر الشيخ|القليوبية|البحيرة|مطروح|مرسى مطروح|العلمين|الزقازيق|الشرقية|الغربية|الدقهلية|البحر الأحمر|العاشر من رمضان)/,
];

export const FOREIGN_LOCATION_PATTERNS = [
  /\b(united kingdom|\buk\b|london|england|scotland|wales|belfast|peterborough|manchester|birmingham|leeds|bristol|buckinghamshire|surrey|kent|newcastle|newport|islington|chelsea|kensington|high wycombe|west midlands|tyne & wear|essex|cambridgeshire|ely|woodston|wallsend|esher|edinburgh|glasgow|liverpool|sheffield|nottingham|leicester|oxford|cambridge|croydon|southampton|reading)\b/i,
  /\b(united states|\busa\b|\bus\b|california|texas|florida|new york|chicago|los angeles|san francisco|seattle|grady county|boston|austin|dallas|houston|atlanta|miami|denver|philadelphia|washington dc|virginia|ohio|illinois|pennsylvania|north carolina|georgia|michigan)\b/i,
  /\b(canada|toronto|vancouver|montreal|ottawa|calgary|edmonton|germany|berlin|munich|frankfurt|hamburg|cologne|france|paris|lyon|marseille|netherlands|amsterdam|rotterdam|spain|madrid|barcelona|italy|rome|milan|australia|sydney|melbourne|brisbane|perth|ireland|dublin|cork|india|bangalore|mumbai|delhi|hyderabad|singapore|south africa|johannesburg|cape town|new zealand|auckland|wellington|brazil|sao paulo|rio de janeiro|mexico|mexico city|russia|moscow|poland|warsaw|switzerland|zurich|geneva|belgium|brussels|austria|vienna)\b/i,
];

/**
 * Authoritative location evaluator for JobHunter-AI.
 * Returns detailed classification and structured rationale.
 */
export function evaluateLocationCompatibility(
  locationStr?: string | null,
  title?: string,
  description?: string,
): LocationEvaluationResult {
  const loc = (locationStr || "").toLowerCase().trim();
  const context = `${loc} ${title || ""} ${description || ""}`.toLowerCase();

  const isExplicitRemote =
    /\b(remote|work from home|telecommute|عمل عن بعد|عن بعد)\b/i.test(loc) ||
    /\b(remote - egypt|egypt remote|remote cairo|remote, egypt|remote in egypt)\b/i.test(context);

  const isExplicitHybrid =
    /\b(hybrid|هجين)\b/i.test(loc) ||
    /\b(hybrid - egypt|egypt hybrid|hybrid cairo|hybrid, egypt)\b/i.test(context);

  const hasEgyptInLocation = EGYPT_LOCATION_PATTERNS.some((p) => p.test(loc));
  const hasEgyptInContext = EGYPT_LOCATION_PATTERNS.some((p) => p.test(context));
  const hasForeignInLocation = FOREIGN_LOCATION_PATTERNS.some((p) => p.test(loc));
  const hasForeignInContext = FOREIGN_LOCATION_PATTERNS.some((p) => p.test(context));

  // 1. Explicit Egypt Local match in location string
  if (hasEgyptInLocation && !hasForeignInLocation) {
    if (isExplicitHybrid) {
      return {
        isCompatible: true,
        classification: "EGYPT_HYBRID",
        matchedLocation: locationStr || "Egypt",
        reason: "Valid hybrid role located in Egypt.",
      };
    }
    return {
      isCompatible: true,
      classification: "EGYPT_LOCAL",
      matchedLocation: locationStr || "Egypt",
      reason: "Valid Egyptian city/governorate matching candidate location.",
    };
  }

  // 2. Explicit Foreign location without Egypt remote eligibility
  if (hasForeignInLocation && !isExplicitRemote) {
    return {
      isCompatible: false,
      classification: "FOREIGN_REJECTED",
      matchedLocation: locationStr || "Foreign",
      reason: `Role located in foreign market (${locationStr}) without Egypt remote eligibility.`,
    };
  }

  // 3. Remote / Work-from-Home cases
  if (isExplicitRemote) {
    // If it mentions a foreign country with strict on-site requirement, reject
    if (hasForeignInLocation && /\b(must reside in|must be based in|only uk|only us|us only|uk only|citizens only)\b/i.test(context)) {
      return {
        isCompatible: false,
        classification: "FOREIGN_REJECTED",
        matchedLocation: locationStr || "Foreign Remote",
        reason: "Remote role restricted to foreign residents/citizens.",
      };
    }
    return {
      isCompatible: true,
      classification: "EGYPT_REMOTE",
      matchedLocation: locationStr || "Remote",
      reason: "Legitimate remote position accessible to an Egypt-based candidate.",
    };
  }

  // 4. Hybrid without explicit foreign conflict
  if (isExplicitHybrid && (hasEgyptInContext || !hasForeignInContext)) {
    return {
      isCompatible: true,
      classification: "EGYPT_HYBRID",
      matchedLocation: locationStr || "Hybrid (Egypt)",
      reason: "Hybrid role compatible with Egypt candidate.",
    };
  }

  // 5. Fallback context checks if locationStr is missing or generic
  if (!loc || loc === "unknown" || loc === "n/a") {
    if (hasEgyptInContext && !hasForeignInContext) {
      return {
        isCompatible: true,
        classification: "EGYPT_LOCAL",
        matchedLocation: "Egypt (Context)",
        reason: "Egypt location inferred from vacancy title/description.",
      };
    }
    if (hasForeignInContext && !isExplicitRemote) {
      return {
        isCompatible: false,
        classification: "FOREIGN_REJECTED",
        matchedLocation: "Foreign (Context)",
        reason: "Foreign location detected in vacancy content.",
      };
    }
    // Neutral fallback
    return {
      isCompatible: true,
      classification: "UNKNOWN",
      matchedLocation: "Egypt",
      reason: "Location neutral; accepted into Egypt pipeline.",
    };
  }

  // If location has foreign keywords, reject
  if (hasForeignInLocation || hasForeignInContext) {
    return {
      isCompatible: false,
      classification: "FOREIGN_REJECTED",
      matchedLocation: locationStr || "Foreign",
      reason: `Foreign location detected (${locationStr}).`,
    };
  }

  return {
    isCompatible: hasEgyptInContext || isExplicitRemote,
    classification: hasEgyptInContext ? "EGYPT_LOCAL" : isExplicitRemote ? "EGYPT_REMOTE" : "FOREIGN_REJECTED",
    matchedLocation: locationStr || "Egypt",
    reason: hasEgyptInContext ? "Egypt compatible location." : "Location outside Egypt target scope.",
  };
}

/**
 * Strict Location Gate for Nayera Tarek (based in Roxy, Heliopolis, Cairo, Egypt).
 * Allowed: Egypt, Cairo, Giza, Alexandria, Heliopolis, Nasr City, New Cairo, Greater Cairo, 6th of October, Maadi, Zamalek, Dokki, Mohandessin, Smart Village, etc.
 * Foreign jobs (UK, London, Europe, USA, etc.) without explicit Egypt remote eligibility are strictly rejected.
 */
export function isEgyptLocationCompatible(
  locationStr?: string | null,
  title?: string,
  description?: string,
): boolean {
  return evaluateLocationCompatibility(locationStr, title, description).isCompatible;
}

/**
 * Evaluates candidate eligibility and priority tier against a job description.
 */
export function evaluateCandidateEligibility(
  job: {
    title: string;
    description: string;
    location?: string | null;
    categories?: string[];
  },
  facts: CandidateVerifiedFacts = NAYERA_VERIFIED_FACTS,
): EligibilityEvaluation {
  const title = (job.title || "").toLowerCase();
  const desc = (job.description || "").toLowerCase();
  const combined = `${title} ${desc}`;
  const categories = (job.categories && job.categories.length > 0)
    ? (job.categories as JobCategory[])
    : classifyJobCategories(job.title, job.description);

  const matchedQualifications: string[] = [];
  const matchedEmployers: string[] = [];
  const matchedRoles: string[] = [];
  const whyItMatches: string[] = [];
  const missingCriticalRequirements: string[] = [];

  // 1. Check for Technical Disqualifiers
  const isTechnicalDisqualified = TECHNICAL_DISQUALIFIERS.some((pattern) => pattern.test(title) || pattern.test(combined));
  if (isTechnicalDisqualified) {
    missingCriticalRequirements.push("Requires specialized technical/engineering/software degree or technical skills not in candidate profile");
    return {
      eligibilityScore: 35,
      priorityTier: "REJECT",
      roleCategory: "Technical / Unrelated",
      qualificationAlignment: {
        hasLawDegree: false,
        hasMasterDegree: false,
        hasPublicLawDiploma: false,
        hasAdminDiploma: false,
        hasLegalInternships: false,
        matchedQualifications: [],
      },
      experienceAlignment: {
        hasBankingExperience: false,
        hasTelesalesExperience: false,
        hasRecruitmentExperience: false,
        matchedEmployers: [],
        matchedRoles: [],
      },
      locationAlignment: {
        isCompatible: true,
        matchedLocation: job.location || "Egypt",
      },
      seniorityAlignment: {
        isCompatible: false,
        level: "MID",
      },
      missingCriticalRequirements,
      whyItMatches: ["Technical or engineering role requiring specialized degree outside candidate background"],
      recommendation: "REJECT: Role requires technical/software engineering credentials outside candidate profile",
      isEligibleForApplication: false,
    };
  }

  // 2. Legal Alignment Checks
  const isLegalCategory = categories.includes(JobCategory.LEGAL) ||
    categories.includes(JobCategory.COMPLIANCE) ||
    categories.includes(JobCategory.CONTRACTS) ||
    categories.includes(JobCategory.REGULATORY);

  const hasLegalTitleKeyword = /\b(legal|counsel|lawyer|attorney|contracts|compliance|regulatory|شؤون قانونية|مستشار قانوني|محامي|عقود|امتثال)\b/i.test(title);
  const hasLegalDescKeywords = /\b(labor law|contract review|legal research|statutory|governance|kyc|aml|قانون العمل|صياغة العقود)\b/i.test(desc);

  let hasLawDegree = false;
  let hasMasterDegree = false;
  let hasPublicLawDiploma = false;
  let hasAdminDiploma = false;
  let hasLegalInternships = false;

  if (isLegalCategory || hasLegalTitleKeyword || hasLegalDescKeywords) {
    hasLawDegree = true;
    hasMasterDegree = true;
    hasPublicLawDiploma = true;
    hasAdminDiploma = true;
    hasLegalInternships = true;

    matchedQualifications.push(
      "LL.B of Law (Banha University, 2019, Grade: Good)",
      "Diploma of Administrative Sciences (Menoufia University, Grade: Very Good)",
      "Diploma of Public Law (Menoufia University, Grade: Very Good)",
      "LL.M of Law (Menoufia University)",
      "Legal Internships (Dr. Zein El-Abdeen & Abdel Mawgood Law Offices)",
    );
    whyItMatches.push("Academic legal foundation (LL.B 2019 Good, LL.M Menoufia, Public Law & Administrative Sciences Diplomas Very Good) and law office internships");
  }

  // 3. Banking & Sales Alignment Checks
  const isBankingSalesCategory = categories.includes(JobCategory.BANKING) ||
    categories.includes(JobCategory.SALES) ||
    categories.includes(JobCategory.CUSTOMER_SERVICE) ||
    categories.includes(JobCategory.FINANCE);

  const hasBankingSalesTitleKeyword = /\b(banking|bank|sales|telesales|tele-sales|relationship|account executive|customer service|business development|مبيعات|تلي سيلز|خدمة عملاء|بنك)\b/i.test(title);

  let hasBankingExperience = false;
  let hasTelesalesExperience = false;

  if (isBankingSalesCategory || hasBankingSalesTitleKeyword) {
    hasBankingExperience = true;
    hasTelesalesExperience = true;
    matchedEmployers.push("Attijariwafa Bank", "Al Ahli Bank of Kuwait", "ADIB Bank");
    matchedRoles.push("Tele-Sales Officer (Attijariwafa Bank May-Sep 2022, ABK Oct 2022-May 2024, ADIB Jun 2024-Sep 2025)");
    whyItMatches.push("Banking tele-sales experience across Attijariwafa Bank, Al Ahli Bank of Kuwait, and ADIB Bank with target achievement commitment");
  }

  // 4. Recruitment & HR Alignment Checks
  const isRecruitmentCategory = categories.includes(JobCategory.RECRUITMENT) || categories.includes(JobCategory.HR);
  const hasRecruitmentTitleKeyword = /\b(recruitment|recruiter|talent acquisition|hr specialist|human resources|employee relations|توظيف|موارد بشرية)\b/i.test(title);

  let hasRecruitmentExperience = false;
  if (isRecruitmentCategory || hasRecruitmentTitleKeyword) {
    hasRecruitmentExperience = true;
    matchedEmployers.push("Eden Cleaning Company");
    matchedRoles.push("Recruitment Manager (October 2025 – June 2026)");
    whyItMatches.push("Recruitment Manager experience at Eden Cleaning Company (October 2025 – June 2026) managing talent acquisition pipelines and candidate screening");
  }

  // Location compatibility check
  const isLocationCompatible = isEgyptLocationCompatible(job.location, job.title, job.description);

  if (!isLocationCompatible) {
    missingCriticalRequirements.push(
      `Job location (${job.location || "Foreign/Outside Egypt"}) is not in Egypt and not accessible to candidate based in Roxy, Heliopolis, Cairo, Egypt`
    );
    whyItMatches.push(`Location incompatible: Role located in ${job.location || "outside Egypt"}; candidate is exclusively seeking roles in Egypt/Cairo.`);

    return {
      eligibilityScore: 35,
      priorityTier: "REJECT",
      roleCategory: isLegalCategory ? "Legal & Compliance (Foreign Location)" : "Foreign Location / Incompatible",
      qualificationAlignment: {
        hasLawDegree,
        hasMasterDegree,
        hasPublicLawDiploma,
        hasAdminDiploma,
        hasLegalInternships,
        matchedQualifications,
      },
      experienceAlignment: {
        hasBankingExperience,
        hasTelesalesExperience,
        hasRecruitmentExperience,
        matchedEmployers,
        matchedRoles,
      },
      locationAlignment: {
        isCompatible: false,
        matchedLocation: job.location || "Foreign",
      },
      seniorityAlignment: {
        isCompatible: true,
        level: "MID",
      },
      missingCriticalRequirements,
      whyItMatches,
      recommendation: `REJECT: Job located outside Egypt (${job.location || "Foreign"}); Nayera is based in Cairo, Egypt.`,
      isEligibleForApplication: false,
    };
  }

  // 5. Compute Detailed Eligibility Score
  let score = 55; // Base score for non-technical real posting

  const isStrictlyLegal = hasLegalTitleKeyword || (isLegalCategory && !hasBankingSalesTitleKeyword && !hasRecruitmentTitleKeyword);

  // Tier 1: Legal & Compliance (Highest Priority: 85-98)
  if (isStrictlyLegal) {
    score = 88;
    if (/\b(labor law|employee relations|compliance|قانون العمل|امتثال)\b/i.test(combined)) {
      score += 6; // e.g. 94-96 for HR Labor Law Compliance
    }
    if (/\b(corporate counsel|legal affairs|legal specialist|مستشار قانوني|شؤون قانونية)\b/i.test(combined)) {
      score += 4;
    }
    if (/\b(contract management|commercial contracts|صياغة العقود|عقود)\b/i.test(combined)) {
      score += 2;
    }
    if (isLocationCompatible) score += 2;
    score = Math.min(98, Math.max(85, score));
  } else if (hasBankingSalesTitleKeyword || isBankingSalesCategory || hasBankingExperience) {
    // Tier 2: Banking & Tele-Sales (Good Match: 70-84)
    score = 76;
    if (/\b(banking|bank|retail banking|financial services|بنك|مصرف)\b/i.test(combined)) {
      score += 4;
    }
    if (/\b(telesales|tele-sales|outbound|تلي سيلز)\b/i.test(combined)) {
      score += 2;
    }
    if (isLocationCompatible) score += 2;
    score = Math.min(84, Math.max(70, score));
  } else if (hasRecruitmentTitleKeyword || isRecruitmentCategory || hasRecruitmentExperience) {
    // Tier 2: Recruitment & HR (Good Match: 70-84)
    score = 74;
    if (/\b(recruitment|recruiter|talent acquisition|توظيف)\b/i.test(combined)) {
      score += 4;
    }
    if (isLocationCompatible) score += 2;
    score = Math.min(84, Math.max(70, score));
  } else {
    // Tier 3: General Administrative / Office (Low Match: 50-69)
    score = 56;
    if (isLocationCompatible) score += 2;
    score = Math.min(69, Math.max(50, score));
  }

  const eligibilityScore = score;

  // Determine Priority Tier
  let priorityTier: PriorityTier;
  let recommendation: string;

  if (eligibilityScore >= 85) {
    priorityTier = "HIGH_PRIORITY";
    recommendation = "HIGH_PRIORITY: Highly recommended for candidate legal & compliance background.";
  } else if (eligibilityScore >= 70) {
    priorityTier = "GOOD_MATCH";
    recommendation = "GOOD_MATCH: Strongly recommended for candidate banking sales / recruitment experience.";
  } else if (eligibilityScore >= 50) {
    priorityTier = "LOW_MATCH";
    recommendation = "LOW_MATCH: General transferable skills only; does not meet threshold for auto-drafting.";
  } else {
    priorityTier = "REJECT";
    recommendation = "REJECT: Job requirements not aligned with candidate verified profile.";
  }

  const roleCategory = isLegalCategory
    ? "Legal & Compliance"
    : isBankingSalesCategory
    ? "Banking & Financial Sales"
    : isRecruitmentCategory
    ? "Recruitment & HR"
    : "General Operations";

  const isEligibleForApplication = priorityTier === "HIGH_PRIORITY" || priorityTier === "GOOD_MATCH";

  return {
    eligibilityScore,
    priorityTier,
    roleCategory,
    qualificationAlignment: {
      hasLawDegree,
      hasMasterDegree,
      hasPublicLawDiploma,
      hasAdminDiploma,
      hasLegalInternships,
      matchedQualifications,
    },
    experienceAlignment: {
      hasBankingExperience,
      hasTelesalesExperience,
      hasRecruitmentExperience,
      matchedEmployers,
      matchedRoles,
    },
    locationAlignment: {
      isCompatible: isLocationCompatible,
      matchedLocation: job.location || "Egypt",
    },
    seniorityAlignment: {
      isCompatible: true,
      level: "MID",
    },
    missingCriticalRequirements,
    whyItMatches,
    recommendation,
    isEligibleForApplication,
  };
}
