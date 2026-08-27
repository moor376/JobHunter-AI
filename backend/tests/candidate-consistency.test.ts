import { describe, expect, it } from "vitest";
import { NAYERA_VERIFIED_FACTS, evaluateCandidateEligibility } from "../src/services/eligibility-service.js";
import { RuleBasedAIProvider } from "../src/services/ai/ai-provider.js";
import { memoryStore } from "../src/store/db-store.js";

describe("Candidate Data Consistency & CV Ground Truth Verification", () => {
  it("verifies NAYERA_VERIFIED_FACTS exactly matches the verified CV facts without invention", () => {
    // 1. Identity & Location
    expect(NAYERA_VERIFIED_FACTS.name).toBe("Nayera Tarek Mohamed");
    expect(NAYERA_VERIFIED_FACTS.email).toBe("tareknayera24@gmail.com");
    expect(NAYERA_VERIFIED_FACTS.location).toBe("Roxy, Heliopolis, Cairo, Egypt");

    // 2. Education
    expect(NAYERA_VERIFIED_FACTS.degrees).toEqual([
      { title: "LL.B of Law", institution: "Banha University", year: 2019, grade: "Good" },
      { title: "LL.M of Law", institution: "Menoufia University" },
    ]);
    expect(NAYERA_VERIFIED_FACTS.diplomas).toEqual([
      { title: "Diploma of Administrative Sciences", institution: "Menoufia University", grade: "Very Good" },
      { title: "Diploma of Public Law", institution: "Menoufia University", grade: "Very Good" },
    ]);

    // 3. Work Experience & Exact Dates
    expect(NAYERA_VERIFIED_FACTS.workExperience).toHaveLength(4);
    expect(NAYERA_VERIFIED_FACTS.workExperience[0]).toMatchObject({
      company: "Attijariwafa Bank",
      role: "Tele-Sales Officer",
      period: "May 2022 to September 2022",
    });
    expect(NAYERA_VERIFIED_FACTS.workExperience[1]).toMatchObject({
      company: "Al Ahli Bank of Kuwait",
      role: "Tele-Sales Officer",
      period: "October 2022 to May 2024",
    });
    expect(NAYERA_VERIFIED_FACTS.workExperience[2]).toMatchObject({
      company: "ADIB Bank",
      role: "Tele-Sales Officer",
      period: "June 2024 to September 2025",
    });
    expect(NAYERA_VERIFIED_FACTS.workExperience[3]).toMatchObject({
      company: "Eden Cleaning Company",
      role: "Recruitment Manager",
      period: "October 2025 to June 2026",
    });

    // 4. Legal Experience
    expect(NAYERA_VERIFIED_FACTS.legalInternships).toEqual([
      { office: "Dr. Zein El-Abdeen Law Office", role: "Legal Intern" },
      { office: "Abdel Mawgood Law Office", role: "Legal Intern" },
    ]);

    // 5. Skills
    const expectedSkills = [
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
    ];
    expect(NAYERA_VERIFIED_FACTS.skills).toEqual(expectedSkills);

    // 6. Courses
    expect(NAYERA_VERIFIED_FACTS.certifications).toEqual(["ICDL", "TOEFL", "Banking courses"]);
  });

  it("proves the database seed matches the authoritative CV facts", () => {
    const candidate = Array.from(memoryStore.candidates.values())[0];
    expect(candidate).toBeDefined();
    expect(candidate.firstName).toBe("Nayera");
    expect(candidate.lastName).toBe("Tarek Mohamed");
    expect(candidate.email).toBe("tareknayera24@gmail.com");
    expect(candidate.location).toBe("Roxy, Heliopolis, Cairo, Egypt");

    const resume = Array.from(memoryStore.resumes.values())[0];
    expect(resume).toBeDefined();
    expect(resume.parsedData?.education).toHaveLength(4);
    expect(resume.parsedData?.workExperience).toHaveLength(4);
    expect(resume.parsedData?.legalExperience).toHaveLength(2);
  });

  it("generates grounded email drafts strictly from verified CV facts without hallucinating responsibilities", async () => {
    const ai = new RuleBasedAIProvider();
    const legalJob = {
      title: "Legal & Regulatory Affairs Specialist",
      companyName: "Cairo Commercial Group",
      description: "Managing legal affairs, regulatory research, and contract reviews.",
      location: "Cairo, Egypt",
    };

    const draft = await ai.generateEmailDraft(NAYERA_VERIFIED_FACTS, legalJob);
    expect(draft.subject).toContain("Nayera Tarek Mohamed");
    expect(draft.body).toContain("Banha University (2019, Grade: Good)");
    expect(draft.body).toContain("LL.M of Law from Menoufia University");
    expect(draft.body).toContain("Diploma of Administrative Sciences (Very Good)");
    expect(draft.body).toContain("Diploma of Public Law (Very Good)");
    expect(draft.body).toContain("Dr. Zein El-Abdeen Law Office");
    expect(draft.body).toContain("Abdel Mawgood Law Office");
    expect(draft.body).toContain("Roxy, Heliopolis, Cairo, Egypt");
    expect(draft.body).toContain("tareknayera24@gmail.com");
  });
});
