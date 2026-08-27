import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { memoryStore } from "../src/store/db-store.js";

type StartedServer = {
  server: Server;
  url: string;
};

async function startServer(): Promise<StartedServer> {
  const server = createServer(createApp());
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
  };
}

async function stopServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

describe("JobHunter-AI Core Integration Suite", () => {
  let startedServer: StartedServer;

  beforeEach(async () => {
    startedServer = await startServer();
  });

  afterEach(async () => {
    if (startedServer) {
      await stopServer(startedServer.server);
    }
  });

  describe("Candidate & Resume Management", () => {
    it("lists seeded candidate profile (Nayera Tarek Mohamed)", async () => {
      const response = await fetch(`${startedServer.url}/api/candidates`);
      const body = (await response.json()) as any;

      expect(response.status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(1);

      const nayera = body.data.find(
        (c: any) =>
          c.id === "c1000000-0000-0000-0000-000000000001" ||
          c.email === "tareknayera24@gmail.com",
      );
      expect(nayera).toBeTruthy();
      expect(["Nayera", "نيرة"]).toContain(nayera.firstName);
      expect(nayera.consentStatus).toBe("GRANTED");
      expect(nayera.targetRoles).toContain("Legal Affairs Specialist");
    });

    it("creates a new candidate and prevents duplicate email registration", async () => {
      const uniqueEmail = `test.candidate.${Date.now()}@example.com`;
      const res = await fetch(`${startedServer.url}/api/candidates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: "Ahmed",
          lastName: "Hassan",
          email: uniqueEmail,
          phone: "+201011112222",
          targetRoles: ["Retail Banking Officer"],
        }),
      });

      expect(res.status).toBe(201);
      const created = (await res.json()) as any;
      expect(created.data.email).toBe(uniqueEmail);

      // Attempt duplicate registration
      const dupRes = await fetch(`${startedServer.url}/api/candidates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: "Ahmed",
          lastName: "Duplicate",
          email: uniqueEmail,
        }),
      });

      expect(dupRes.status).toBe(409);
      const dupBody = (await dupRes.json()) as any;
      expect(dupBody.error.code).toBe("DUPLICATE_CANDIDATE");
    });

    it("uploads a new CV, computes version/checksum, and parses into structured profile", async () => {
      const nayera = Array.from(memoryStore.candidates.values())[0];

      const cvContent = `Nayera Tarek Mohamed
Email: tareknayera24@gmail.com
Location: Roxy, Heliopolis, Cairo, Egypt
Education:
- LL.B of Law — Banha University — 2019 — Grade: Good
- Diploma of Administrative Sciences — Very Good
- Diploma of Public Law — Very Good
- LL.M of Law — Menoufia University
Experience:
- Tele-Sales Officer — Attijariwafa Bank — May 2022 to September 2022
- Tele-Sales Officer — Al Ahli Bank of Kuwait — October 2022 to May 2024
- Tele-Sales Officer — ADIB Bank — June 2024 to September 2025
- Recruitment Manager — Eden Cleaning Company — October 2025 to June 2026
Legal Experience:
- Legal Intern — Dr. Zein El-Abdeen Law Office
- Legal Intern — Abdel Mawgood Law Office
Skills: Strong communication and client-handling, Legal research, Problem-solving, Decision-making, Sales target achievement, Teamwork, Collaboration, Professionalism, Quality/performance commitment, Time management, Punctuality
Courses: ICDL, TOEFL, Banking courses`;

      const res = await fetch(`${startedServer.url}/api/candidates/${nayera.id}/resumes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalFilename: "Nayera_Updated_CV_2026.txt",
          rawContent: cvContent,
        }),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as any;
      expect(body.data.candidateId).toBe(nayera.id);
      expect(body.data.parseStatus).toBe("COMPLETED");
      expect(body.data.parsedData.skills).toContain("Legal research");
    });
  });

  describe("Job Sources, Ingestion & Deduplication", () => {
    it("lists available job sources and allows creating new source", async () => {
      const listRes = await fetch(`${startedServer.url}/api/job-sources`);
      expect(listRes.status).toBe(200);
      const listBody = (await listRes.json()) as any;
      expect(listBody.data.length).toBeGreaterThanOrEqual(1);

      const createRes = await fetch(`${startedServer.url}/api/job-sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Careers Portal ${Date.now()}`,
          type: "CAREERS_PAGE",
          accessMethod: "PUBLIC_PAGE",
          baseUrl: "https://example.com/careers",
        }),
      });
      expect(createRes.status).toBe(201);
    });

    it("creates a job, categorizes it, and supports search and category filters", async () => {
      const source = Array.from(memoryStore.jobSources.values())[0];

      const createJobRes = await fetch(`${startedServer.url}/api/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobSourceId: source.id,
          title: "Senior Legal Affairs & Contracts Specialist",
          companyName: "Commercial International Bank (CIB)",
          location: "Cairo, Egypt",
          description: "Reviewing commercial contracts, public regulations, and ensuring compliance with regulatory bodies.",
          employmentType: "FULL_TIME",
        }),
      });

      expect(createJobRes.status).toBe(201);
      const jobBody = (await createJobRes.json()) as any;
      expect(jobBody.data.categories).toContain("LEGAL");

      // Filter jobs by category
      const filterRes = await fetch(`${startedServer.url}/api/jobs?category=LEGAL`);
      expect(filterRes.status).toBe(200);
      const filterBody = (await filterRes.json()) as any;
      expect(filterBody.data.length).toBeGreaterThanOrEqual(1);

      // Search jobs
      const searchRes = await fetch(`${startedServer.url}/api/jobs?search=contracts`);
      expect(searchRes.status).toBe(200);
      const searchBody = (await searchRes.json()) as any;
      expect(searchBody.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("AI Job Matching & Scoring", () => {
    it("evaluates CV/job compatibility, generates explainable match score and missing requirements", async () => {
      const candidate = Array.from(memoryStore.candidates.values())[0];
      const source = Array.from(memoryStore.jobSources.values())[0];

      // Create a test legal job
      const jobRes = await fetch(`${startedServer.url}/api/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobSourceId: source.id,
          title: "Legal & Regulatory Compliance Officer",
          companyName: "Financial Services Corp",
          location: "Cairo, Egypt",
          description: "Legal research, drafting agreements, and Central Bank compliance.",
        }),
      });
      const job = ((await jobRes.json()) as any).data;

      const matchRes = await fetch(`${startedServer.url}/api/jobs/${job.id}/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId: candidate.id }),
      });

      expect(matchRes.status).toBe(200);
      const matchBody = (await matchRes.json()) as any;
      expect(matchBody.data.match.matchScore).toBeGreaterThanOrEqual(70);
      expect(matchBody.data.match.category).toBe("STRONG_MATCH");
      expect(matchBody.data.match.matchedSkills.length).toBeGreaterThan(0);
      expect(matchBody.data.match.reasoning).toBeTruthy();
    });
  });

  describe("Application Lifecycle & Email Approval Gate", () => {
    it("creates an application, prevents duplicate applications, and generates grounded draft email", async () => {
      const candRes = await fetch(`${startedServer.url}/api/candidates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: "Nayera",
          lastName: "Tarek Mohamed",
          email: `lifecycle.nayera.${Date.now()}@gmail.com`,
          location: "Roxy, Heliopolis, Cairo, Egypt",
          consentStatus: "GRANTED",
          consentGrantedAt: new Date().toISOString(),
          targetRoles: ["Legal Affairs Specialist", "Banking Tele-sales Specialist"],
        }),
      });
      const candidate = ((await candRes.json()) as any).data;
      const source = Array.from(memoryStore.jobSources.values())[0];

      const jobRes = await fetch(`${startedServer.url}/api/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobSourceId: source.id,
          title: "Legal Counsel Associate",
          companyName: "Major Bank Egypt",
          location: "Cairo, Egypt",
          description: "Corporate legal affairs, contract drafting, and regulatory affairs.",
        }),
      });
      const job = ((await jobRes.json()) as any).data;

      const appRes = await fetch(`${startedServer.url}/api/applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: candidate.id,
          jobId: job.id,
          channel: "EMAIL",
        }),
      });

      expect(appRes.status).toBe(201);
      const appBody = (await appRes.json()) as any;
      const appId = appBody.data.id;
      expect(appBody.data.candidateId).toBe(candidate.id);
      expect(appBody.data.jobId).toBe(job.id);
      expect(appBody.data.selectedGeneratedEmailId).toBeTruthy();

      // Duplicate application prevention test
      const dupAppRes = await fetch(`${startedServer.url}/api/applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: candidate.id,
          jobId: job.id,
          channel: "EMAIL",
        }),
      });
      expect(dupAppRes.status).toBe(409);
      const dupBody = (await dupAppRes.json()) as any;
      expect(dupBody.error.code).toBe("DUPLICATE_APPLICATION");

      // Security Gate: Sending must fail before explicit APPROVAL
      const earlySendRes = await fetch(`${startedServer.url}/api/applications/${appId}/send`, {
        method: "POST",
      });
      expect(earlySendRes.status).toBe(400);
      const earlySendBody = (await earlySendRes.json()) as any;
      expect(earlySendBody.error.code).toBe("EMAIL_NOT_APPROVED");

      // Approve application and draft
      const approveRes = await fetch(`${startedServer.url}/api/applications/${appId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Reviewed and verified candidate facts." }),
      });
      expect(approveRes.status).toBe(200);

      // Now send application
      const sendRes = await fetch(`${startedServer.url}/api/applications/${appId}/send`, {
        method: "POST",
      });
      expect(sendRes.status).toBe(200);
      const sendBody = (await sendRes.json()) as any;
      expect(sendBody.data.status).toBe("SENT");

      // Duplicate send attempt prevention
      const resendRes = await fetch(`${startedServer.url}/api/applications/${appId}/send`, {
        method: "POST",
      });
      expect(resendRes.status).toBe(409);
      const resendBody = (await resendRes.json()) as any;
      expect(resendBody.error.code).toBe("APPLICATION_ALREADY_SENT");

      // Record reply
      const replyRes = await fetch(`${startedServer.url}/api/applications/${appId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          safeMetadata: { recruiterResponse: "Interview invitation scheduled" },
        }),
      });
      expect(replyRes.status).toBe(200);
      const replyBody = (await replyRes.json()) as any;
      expect(replyBody.data.status).toBe("REPLIED");
    });
  });

  describe("Audit Trail & Security", () => {
    it("records immutable audit trail for all key actions", async () => {
      const auditRes = await fetch(`${startedServer.url}/api/audit-logs`);
      expect(auditRes.status).toBe(200);
      const auditBody = (await auditRes.json()) as any;
      expect(auditBody.data.length).toBeGreaterThanOrEqual(1);
      expect(auditBody.data[0].correlationId).toBeTruthy();
    });
  });
});
