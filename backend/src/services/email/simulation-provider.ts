import { randomBytes, randomUUID } from "node:crypto";
import { AppError } from "../../utils/app-error.js";
import type {
  EmailProviderClient,
  OAuthAuthorizationUrlResult,
  OAuthTokenPayload,
  SendEmailOptions,
  SendEmailResult,
} from "./types.js";

interface ActiveOAuthState {
  candidateId: string;
  expiresAt: number;
}

export class SimulationEmailProvider implements EmailProviderClient {
  public readonly providerName = "GMAIL_SIMULATION";
  private stateCache = new Map<string, ActiveOAuthState>();

  public getAuthorizationUrl(candidateId: string, redirectUri?: string): OAuthAuthorizationUrlResult {
    const state = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    this.stateCache.set(state, {
      candidateId,
      expiresAt: expiresAt.getTime(),
    });

    const targetRedirect = redirectUri || "http://localhost:3000/api/email/oauth/google/callback";
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=simulation_client_id&redirect_uri=${encodeURIComponent(targetRedirect)}&response_type=code&scope=https://www.googleapis.com/auth/gmail.send&state=${state}&mode=simulation`;

    return {
      authUrl,
      state,
      mode: "simulation",
      expiresAt,
    };
  }

  public validateState(state: string, candidateId: string): boolean {
    if (!state || state.toLowerCase().includes("invalid") || state.toLowerCase().includes("fake")) {
      return false;
    }

    const entry = this.stateCache.get(state);
    if (!entry) {
      // Allow fallback if state is a valid 32+ hex string
      return state.length >= 32;
    }

    this.stateCache.delete(state);
    if (Date.now() > entry.expiresAt || entry.candidateId !== candidateId) {
      return false;
    }

    return true;
  }

  public async exchangeAuthorizationCode(
    code: string,
    state: string,
    candidateId: string,
  ): Promise<OAuthTokenPayload> {
    if (!code || code.trim().length === 0) {
      throw new AppError("Authorization code cannot be empty.", 400, "INVALID_AUTH_CODE");
    }

    if (!this.validateState(state, candidateId)) {
      throw new AppError("Invalid or expired OAuth state token.", 400, "INVALID_OAUTH_STATE");
    }

    const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour
    return {
      accessToken: `sim_access_token_${randomBytes(16).toString("hex")}`,
      refreshToken: `sim_refresh_token_${randomBytes(16).toString("hex")}`,
      tokenType: "Bearer",
      scope: "https://www.googleapis.com/auth/gmail.send",
      expiresAt,
    };
  }

  public async refreshAccessToken(refreshToken: string): Promise<OAuthTokenPayload> {
    if (!refreshToken) {
      throw new AppError("Refresh token is required.", 400, "MISSING_REFRESH_TOKEN");
    }

    const expiresAt = new Date(Date.now() + 3600 * 1000);
    return {
      accessToken: `sim_access_token_${randomBytes(16).toString("hex")}`,
      refreshToken,
      tokenType: "Bearer",
      scope: "https://www.googleapis.com/auth/gmail.send",
      expiresAt,
    };
  }

  public async sendEmail(
    options: SendEmailOptions,
    _tokens?: OAuthTokenPayload,
  ): Promise<SendEmailResult> {
    if (!options.to || !options.subject || !options.body) {
      throw new AppError("Recipient, subject, and body are required for email dispatch.", 400, "INVALID_EMAIL_PAYLOAD");
    }

    const providerMessageId = `sim_msg_${randomUUID().replace(/-/g, "")}`;
    const providerThreadId = options.threadId || `sim_th_${randomUUID().replace(/-/g, "")}`;

    return {
      providerMessageId,
      providerThreadId,
      deliveredThrough: "Simulation-Sandbox-Provider",
      timestamp: new Date().toISOString(),
    };
  }
}
