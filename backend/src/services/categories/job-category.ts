export enum JobCategory {
  LEGAL = "LEGAL",
  BANKING = "BANKING",
  FINANCE = "FINANCE",
  SALES = "SALES",
  CUSTOMER_SERVICE = "CUSTOMER_SERVICE",
  RECRUITMENT = "RECRUITMENT",
  HR = "HR",
  COMPLIANCE = "COMPLIANCE",
  REGULATORY = "REGULATORY",
  CONTRACTS = "CONTRACTS",
  OTHER = "OTHER",
}

const CATEGORY_KEYWORDS: Record<JobCategory, Array<string | RegExp>> = {
  [JobCategory.LEGAL]: [
    "legal",
    "legal affairs",
    "legal affairs specialist",
    "legal affairs officer",
    "legal affairs manager",
    "legal counsel",
    "legal advisor",
    "legal officer",
    "legal specialist",
    "legal coordinator",
    "corporate lawyer",
    "corporate legal",
    "lawyer",
    "attorney",
    "litigation",
    "commercial law",
    "corporate law",
    "labor law",
    "employment law",
    "corporate governance",
    "legal research",
    "legal operations",
    "public law",
    "administrative law",
    "law firm",
    "law office",
    "paralegal",
    "ll.b",
    "ll.m",
    "llm",
    "llb",
    "bachelor of law",
    "master of law",
    "شؤون قانونية",
    "الشؤون القانونية",
    "مستشار قانوني",
    "محامي",
    "محاماه",
    "محاماة",
    "قانوني",
    "قانونية",
    "إدارة قانونية",
    "ادارة قانونية",
    "باحث قانوني",
    "ليسانس حقوق",
    "ماجستير حقوق",
    "محامى",
  ],
  [JobCategory.BANKING]: [
    "banking",
    "bank",
    "retail banking",
    "corporate banking",
    "branch banking",
    "credit",
    "banking operations",
    "banking sales",
    "sharia banking",
    "islamic banking",
    "central bank",
    "cbe",
    "loans",
    "credit cards",
    "personal loans",
    "mortgage",
    "treasury",
    "teller",
    "deposit",
    "بنك",
    "مصرف",
    "بنكي",
    "مصرفي",
    "عمليات بنكية",
    "مبيعات بنكية",
    "قروض",
    "بطاقات ائتمان",
    "البنك المركزي",
  ],
  [JobCategory.FINANCE]: [
    "finance",
    "financial",
    "financial services",
    "financial advisor",
    "accounting",
    "accountant",
    "auditing",
    "auditor",
    "investment",
    "financial analyst",
    "credit analyst",
    "asset management",
    "fintech",
    "تمويل",
    "خدمات مالية",
    "محاسبة",
    "محاسب",
    "تدقيق",
    "تحليل مالي",
  ],
  [JobCategory.SALES]: [
    "sales",
    "telesales",
    "tele-sales",
    "telesales officer",
    "sales officer",
    "sales representative",
    "sales rep",
    "sales executive",
    "business development",
    "customer acquisition",
    "account executive",
    "relationship officer",
    "relationship manager",
    "direct sales",
    "outbound sales",
    "inbound sales",
    "b2b sales",
    "b2c sales",
    "sales specialist",
    "cross-selling",
    "مبيعات",
    "تلي سيلز",
    "تليسيلز",
    "تسويق هاتفي",
    "مسؤول مبيعات",
    "تنفيذي مبيعات",
    "تطوير أعمال",
    "مندوب مبيعات",
    "مسؤول علاقات",
  ],
  [JobCategory.CUSTOMER_SERVICE]: [
    "customer service",
    "customer relations",
    "customer care",
    "client handling",
    "customer support",
    "call center",
    "contact center",
    "customer experience",
    "client relations",
    "خدمة عملاء",
    "خدمه عملاء",
    "رعاية العملاء",
    "مركز الاتصال",
    "كول سنتر",
    "دعم العملاء",
  ],
  [JobCategory.RECRUITMENT]: [
    "recruitment",
    "recruiter",
    "talent acquisition",
    "talent acquisition specialist",
    "recruitment manager",
    "recruitment specialist",
    "headhunter",
    "staffing",
    "candidate screening",
    "recruitment officer",
    "توظيف",
    "استقطاب مواهب",
    "مسؤول توظيف",
    "مدير توظيف",
    "أخصائي توظيف",
    "اخصائي توظيف",
  ],
  [JobCategory.HR]: [
    "hr",
    "human resources",
    "hr specialist",
    "hr generalist",
    "hr manager",
    "hr officer",
    "personnel",
    "payroll",
    "employee relations",
    "talent management",
    "موارد بشرية",
    "شؤون العاملين",
    "شئون العاملين",
    "أخصائي موارد بشرية",
    "مدير موارد بشرية",
  ],
  [JobCategory.COMPLIANCE]: [
    "compliance",
    "compliance officer",
    "compliance specialist",
    "compliance manager",
    "aml",
    "anti-money laundering",
    "kyc",
    "know your customer",
    "regulatory compliance",
    "sanctions",
    "امتثال",
    "مكافحة غسل الأموال",
    "اعرف عميلك",
    "التزام",
  ],
  [JobCategory.REGULATORY]: [
    "regulatory",
    "regulatory affairs",
    "regulatory compliance",
    "regulatory reporting",
    "regulator",
    "regulatory officer",
    "regulatory specialist",
    "شؤون تنظيمية",
    "شئون تنظيمية",
    "تنظيمي",
    "رقابي",
    "لوائح",
  ],
  [JobCategory.CONTRACTS]: [
    "contract",
    "contracts",
    "contract management",
    "contracts manager",
    "contracts specialist",
    "contract administrator",
    "contract drafting",
    "contract review",
    "agreements",
    "vendor contracts",
    "commercial contracts",
    "عقود",
    "إدارة العقود",
    "ادارة العقود",
    "صياغة العقود",
    "مراجعة العقود",
    "اتفاقيات",
  ],
  [JobCategory.OTHER]: [],
};

export function classifyJobCategories(
  title: string,
  description: string,
): JobCategory[] {
  const combinedText = `${title || ""} ${description || ""}`.toLowerCase();
  const matchedCategories = new Set<JobCategory>();

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as [
    JobCategory,
    Array<string | RegExp>,
  ][]) {
    if (category === JobCategory.OTHER) continue;

    for (const keyword of keywords) {
      if (typeof keyword === "string") {
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`(^|\\W)${escaped}(\\W|$)`, "i");
        if (regex.test(combinedText)) {
          matchedCategories.add(category);
          break;
        }
      } else if (keyword instanceof RegExp) {
        if (keyword.test(combinedText)) {
          matchedCategories.add(category);
          break;
        }
      }
    }
  }

  if (matchedCategories.size === 0) {
    return [JobCategory.OTHER];
  }

  // Preserve priority: LEGAL, BANKING, SALES, RECRUITMENT, COMPLIANCE, etc.
  const priorityOrder: JobCategory[] = [
    JobCategory.LEGAL,
    JobCategory.CONTRACTS,
    JobCategory.COMPLIANCE,
    JobCategory.REGULATORY,
    JobCategory.BANKING,
    JobCategory.SALES,
    JobCategory.RECRUITMENT,
    JobCategory.HR,
    JobCategory.FINANCE,
    JobCategory.CUSTOMER_SERVICE,
    JobCategory.OTHER,
  ];

  return priorityOrder.filter((cat) => matchedCategories.has(cat));
}

export function isLegalRelated(categories: JobCategory[]): boolean {
  return categories.some((c) =>
    [
      JobCategory.LEGAL,
      JobCategory.COMPLIANCE,
      JobCategory.REGULATORY,
      JobCategory.CONTRACTS,
    ].includes(c),
  );
}

export function isBankingOrSalesRelated(categories: JobCategory[]): boolean {
  return categories.some((c) =>
    [
      JobCategory.BANKING,
      JobCategory.SALES,
      JobCategory.FINANCE,
      JobCategory.CUSTOMER_SERVICE,
    ].includes(c),
  );
}

export function isRecruitmentOrHRRelated(categories: JobCategory[]): boolean {
  return categories.some((c) =>
    [JobCategory.RECRUITMENT, JobCategory.HR].includes(c),
  );
}
