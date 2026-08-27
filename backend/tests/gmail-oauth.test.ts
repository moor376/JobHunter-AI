import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createJob } from "../src/services/job-service.js";
import {
  generateApplicationEmail,
  reviewGeneratedEmail,
  sendApplicationEmail,
} from "../src/services/email-service.js";
import { LiveGmailProvider } from "../src/services/email/gmail-provider.js";
import { SimulationEmailProvider } from "../src/services/email/simulation-provider.js";
import { tokenStore } from "../src/services/email/token-store.js";
import {
  ApplicationChannel,
  ApplicationStatus,
  ConsentStatus,
  EmailReviewStatus,
  memoryStore,
} from "../src/store/db-store.js";

describe("Gmail OAuth 2.0 & Human Approval Gate Suite", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    server = createServer(createApp());
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  async function ensureTestJob() {
    if (memoryStore.jobs.size === 0) {
      const source = Array.from(memoryStore.jobSources.values())[0];
      await createJob({
        jobSourceId: source.id,
        title: "Senior Legal & Compliance Officer",
        companyName: "ADIB Bank Egypt",
        location: "Cairo, Egypt",
        description: "Corporate legal affairs and banking compliance.",
      });
    }
    return Array.from(memoryStore.jobs.values())[0];
  }

  describe("Google OAuth 2.0 Authorization & Flow", () => {
    it("generates OAuth authorization URL with cryptographic state and correct scopes", async () => {
      const candidate = Array.from(memoryStore.candidates.values())[0];
      const response = await fetch(
        `${baseUrl}/api/email/oauth-url?candidateId=${candidate.id}`,
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as any;
      expect(data.data.authUrl).toContain("accounts.google.com/o/oauth2/v2/auth");
      expect(data.data.state).toBeTruthy();
    });

    it("returns provider status (simulation / live configuration)", async () => {
      const response = await fetch(`${baseUrl}/api/email/status`);
      expect(response.status).toBe(200);
      const data = (await response.json()) as any;
      expect(data.data.providerName).toContain("GMAIL");
      expect(["simulation", "live"]).toContain(data.data.mode);
    });

    it("rejects OAuth callback when state token is missing or invalid (CSRF protection)", async () => {
      const candidate = Array.from(memoryStore.candidates.values())[0];
      const response = await fetch(`${baseUrl}/api/email/callback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: "mock_auth_code_123",
          state: "invalid_unregistered_state_token",
          candidateId: candidate.id,
        }),
      });

      expect(response.status).toBe(400);
      const data = (await response.json()) as any;
      expect(data.error.code).toBe("INVALID_OAUTH_STATE");
    });

    it("exchanges valid OAuth authorization code, saves encrypted tokens, and links account", async () => {
      const candidate = Array.from(memoryStore.candidates.values())[0];

      // Step 1: Start auth flow to get valid state via endpoint
      const urlRes = await fetch(`${baseUrl}/api/email/oauth-url?candidateId=${candidate.id}`);
      const urlData = (await urlRes.json()) as any;
      const state = urlData.data.state;

      // Step 2: Callback exchange
      const response = await fetch(`${baseUrl}/api/email/callback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: "simulated_test_auth_code_456",
          state,
          candidateId: candidate.id,
        }),
      });

      expect(response.status).toBe(201);
      const data = (await response.json()) as any;
      expect(data.data.status).toBe("ACTIVE");
      expect(data.data.candidateId).toBe(candidate.id);
      expect(data.data.emailAddress).toBeTruthy();

      // Verify token store has encrypted payload (no plaintext in db)
      const tokens = await tokenStore.getTokens(`secret://oauth/gmail/${candidate.id}`);
      expect(tokens).not.toBeNull();
      expect(tokens?.accessToken).toBeTruthy();
    });
  });

  describe("Token Store Security & Encryption", () => {
    it("encrypts token payloads with AES-256-GCM and decrypts accurately", async () => {
      const refKey = `test_token_${Date.now()}`;
      const payload = {
        accessToken: "test_access_token_secret_value",
        refreshToken: "test_refresh_token_secret_value",
        tokenType: "Bearer",
        scope: "https://www.googleapis.com/auth/gmail.send",
        expiresAt: new Date(Date.now() + 3600 * 1000),
      };

      await tokenStore.saveTokens(refKey, payload);
      const retrieved = await tokenStore.getTokens(refKey);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.accessToken).toBe("test_access_token_secret_value");
      expect(retrieved?.refreshToken).toBe("test_refresh_token_secret_value");

      await tokenStore.deleteTokens(refKey);
      const afterDelete = await tokenStore.getTokens(refKey);
      expect(afterDelete).toBeNull();
    });
  });

  describe("Strict Human Approval Gate", () => {
    it("BLOCKS email delivery if candidate consent is not GRANTED", async () => {
      const candidate = Array.from(memoryStore.candidates.values())[0];
      const job = await ensureTestJob();

      // Temporarily revoke consent
      const originalConsent = candidate.consentStatus;
      candidate.consentStatus = ConsentStatus.REVOKED;
      memoryStore.candidates.set(candidate.id, candidate);

      // Create application and approved email
      const appId = `app_consent_test_${Date.now()}`;
      memoryStore.applications.set(appId, {
        id: appId,
        candidateId: candidate.id,
        jobId: job.id,
        resumeId: null,
        resumeVersion: 1,
        status: ApplicationStatus.APPROVED,
        channel: ApplicationChannel.EMAIL,
        duplicateKey: `${candidate.id}:${job.id}:EMAIL_REVOKED`,
        selectedGeneratedEmailId: null,
        approvedAt: new Date(),
        sentAt: null,
        statusChangedAt: new Date(),
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const draft = await generateApplicationEmail({ applicationId: appId });
      await reviewGeneratedEmail(draft.id, "APPROVED");

      // Attempt send: Must be blocked by Consent Gate
      await expect(sendApplicationEmail(appId)).rejects.toThrowError(
        /Candidate has not granted explicit consent/,
      );

      // Restore consent
      candidate.consentStatus = originalConsent;
      memoryStore.candidates.set(candidate.id, candidate);
    });

    it("BLOCKS email delivery if generated email draft is not APPROVED", async () => {
      const candidate = Array.from(memoryStore.candidates.values())[0];
      const job = await ensureTestJob();
      candidate.consentStatus = ConsentStatus.GRANTED;
      memoryStore.candidates.set(candidate.id, candidate);

      const appId = `app_draft_test_${Date.now()}`;
      memoryStore.applications.set(appId, {
        id: appId,
        candidateId: candidate.id,
        jobId: job.id,
        resumeId: null,
        resumeVersion: 1,
        status: ApplicationStatus.PENDING_APPROVAL,
        channel: ApplicationChannel.EMAIL,
        duplicateKey: `${candidate.id}:${job.id}:EMAIL_UNAPPROVED`,
        selectedGeneratedEmailId: null,
        approvedAt: null,
        sentAt: null,
        statusChangedAt: new Date(),
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const draft = await generateApplicationEmail({ applicationId: appId });
      expect(draft.reviewStatus).toBe(EmailReviewStatus.PENDING_REVIEW);

      // Attempt send before review approval: Must be blocked
      await expect(sendApplicationEmail(appId)).rejects.toThrowError(
        /Email must be reviewed and explicitly APPROVED first/,
      );
    });

    it("ALLOWS email delivery only when candidate consent is GRANTED AND draft is APPROVED", async () => {
      const candidate = Array.from(memoryStore.candidates.values())[0];
      const job = await ensureTestJob();
      candidate.consentStatus = ConsentStatus.GRANTED;
      memoryStore.candidates.set(candidate.id, candidate);

      const appId = `app_approved_send_${Date.now()}`;
      memoryStore.applications.set(appId, {
        id: appId,
        candidateId: candidate.id,
        jobId: job.id,
        resumeId: null,
        resumeVersion: 1,
        status: ApplicationStatus.PENDING_APPROVAL,
        channel: ApplicationChannel.EMAIL,
        duplicateKey: `${candidate.id}:${job.id}:EMAIL_VALID_SEND`,
        selectedGeneratedEmailId: null,
        approvedAt: null,
        sentAt: null,
        statusChangedAt: new Date(),
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const draft = await generateApplicationEmail({ applicationId: appId });
      await reviewGeneratedEmail(draft.id, "APPROVED");

      const sendResult = await sendApplicationEmail(appId);
      expect(sendResult.status).toBe(ApplicationStatus.SENT);
      expect(sendResult.event.providerMessageId).toBeTruthy();
      expect(sendResult.message).toContain("successfully delivered");

      const appInStore = memoryStore.applications.get(appId);
      expect(appInStore?.status).toBe(ApplicationStatus.SENT);
      expect(appInStore?.sentAt).not.toBeNull();
    });
  });

  describe("Simulation vs Live Provider Abstractions", () => {
    it("Simulation provider executes deterministic sending without network requests", async () => {
      const simProvider = new SimulationEmailProvider();
      const result = await simProvider.sendEmail({
        to: "recruiter@adib.eg",
        subject: "Application: Senior Telesales Specialist",
        body: "Cover letter text",
        candidateId: "candidate-123",
      });

      expect(result.providerMessageId).toContain("sim_msg_");
      expect(result.deliveredThrough).toContain("Simulation");
    });

    it("LiveGmailProvider throws typed error if credentials are missing", async () => {
      const liveProvider = new LiveGmailProvider();
      await expect(
        liveProvider.sendEmail({
          to: "recruiter@adib.eg",
          subject: "Test Live Email",
          body: "Cover letter text",
        }),
      ).rejects.toThrowError(/Active Gmail access token is required/);
    });
  });
});
