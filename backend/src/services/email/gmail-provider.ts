import { randomBytes } from "node:crypto";
import { loadEnvironment } from "../../config/env.js";
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

export class LiveGmailProvider implements EmailProviderClient {
  public readonly providerName = "GMAIL_LIVE";
  private stateCache = new Map<string, ActiveOAuthState>();

  private getCredentials() {
    const env = loadEnvironment();
    const clientId = env.GOOGLE_CLIENT_ID;
    const clientSecret = env.GOOGLE_CLIENT_SECRET;
    const redirectUri = env.GOOGLE_REDIRECT_URI || `${env.APP_URL}/api/email/oauth/google/callback`;

    if (!clientId || !clientSecret) {
      throw new AppError(
        "Google OAuth 2.0 credentials (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET) are not configured.",
        503,
        "GMAIL_CREDENTIALS_MISSING",
      );
    }

    return { clientId, clientSecret, redirectUri };
  }

  public getAuthorizationUrl(candidateId: string, customRedirectUri?: string): OAuthAuthorizationUrlResult {
    const { clientId, redirectUri } = this.getCredentials();
    const effectiveRedirectUri = customRedirectUri || redirectUri;

    // Generate cryptographic state token
    const state = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    this.stateCache.set(state, {
      candidateId,
      expiresAt: expiresAt.getTime(),
    });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: effectiveRedirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/gmail.send",
      access_type: "offline",
      prompt: "consent",
      state,
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    return {
      authUrl,
      state,
      mode: "live",
      expiresAt,
    };
  }

  public validateState(state: string, candidateId: string): boolean {
    const entry = this.stateCache.get(state);
    if (!entry) {
      return false;
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
    if (!this.validateState(state, candidateId)) {
      throw new AppError("Invalid or expired OAuth state token.", 400, "INVALID_OAUTH_STATE");
    }

    const { clientId, clientSecret, redirectUri } = this.getCredentials();

    try {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }).toString(),
        signal: AbortSignal.timeout(10_000),
      });

      const data = (await response.json()) as any;

      if (!response.ok || data.error) {
        throw new AppError(
          `Google OAuth token exchange failed: ${data.error_description || data.error || "Unknown error"}`,
          400,
          "OAUTH_EXCHANGE_FAILED",
        );
      }

      const expiresInSeconds = data.expires_in || 3600;
      const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        tokenType: data.token_type || "Bearer",
        scope: data.scope || "https://www.googleapis.com/auth/gmail.send",
        expiresAt,
      };
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new AppError("Failed to communicate with Google OAuth token service.", 502, "GOOGLE_AUTH_UNAVAILABLE");
    }
  }

  public async refreshAccessToken(refreshToken: string): Promise<OAuthTokenPayload> {
    const { clientId, clientSecret } = this.getCredentials();

    try {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "refresh_token",
        }).toString(),
        signal: AbortSignal.timeout(10_000),
      });

      const data = (await response.json()) as any;

      if (!response.ok || data.error) {
        throw new AppError(
          `Google token refresh failed: ${data.error_description || data.error}`,
          401,
          "TOKEN_REFRESH_FAILED",
        );
      }

      const expiresInSeconds = data.expires_in || 3600;
      const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken,
        tokenType: data.token_type || "Bearer",
        scope: data.scope || "https://www.googleapis.com/auth/gmail.send",
        expiresAt,
      };
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new AppError("Failed to refresh Google OAuth access token.", 502, "TOKEN_REFRESH_ERROR");
    }
  }

  public async sendEmail(
    options: SendEmailOptions,
    tokens?: OAuthTokenPayload,
  ): Promise<SendEmailResult> {
    if (!tokens?.accessToken) {
      throw new AppError("Active Gmail access token is required to dispatch email.", 401, "UNAUTHORIZED_GMAIL");
    }

    // Build standard RFC 2822 email payload
    const utf8Subject = `=?utf-8?B?${Buffer.from(options.subject, "utf-8").toString("base64")}?=`;
    const messageParts = [
      `To: ${options.to}`,
      `Subject: ${utf8Subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      ``,
      Buffer.from(options.body, "utf-8").toString("base64"),
    ];

    const rawRfc2822 = messageParts.join("\r\n");
    // Standard URL-safe Base64 encoding for Gmail API
    const base64UrlMessage = Buffer.from(rawRfc2822, "utf-8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    try {
      const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          raw: base64UrlMessage,
          threadId: options.threadId || undefined,
        }),
        signal: AbortSignal.timeout(10_000),
      });

      const data = (await response.json()) as any;

      if (!response.ok || data.error) {
        throw new AppError(
          `Gmail API delivery error: ${data.error?.message || "Failed to send message"}`,
          response.status || 500,
          "GMAIL_SEND_ERROR",
        );
      }

      return {
        providerMessageId: data.id || `gmail_${Date.now()}`,
        providerThreadId: data.threadId || options.threadId,
        deliveredThrough: "Gmail-Live-OAuth2-API",
        timestamp: new Date().toISOString(),
      };
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new AppError("Network failure while calling Gmail Send API.", 502, "GMAIL_NETWORK_ERROR");
    }
  }
}
