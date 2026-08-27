export interface SendEmailOptions {
  to: string;
  subject: string;
  body: string;
  candidateId: string;
  threadId?: string;
  recipientName?: string;
  resumeAttachment?: {
    filename: string;
    content: Buffer;
    mimeType?: string;
  };
}

export interface SendEmailResult {
  providerMessageId: string;
  providerThreadId?: string;
  deliveredThrough: string;
  timestamp: string;
}

export interface OAuthTokenPayload {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  scope: string;
  expiresAt: Date;
}

export interface OAuthAuthorizationUrlResult {
  authUrl: string;
  state: string;
  mode: "live" | "simulation";
  expiresAt: Date;
}

export interface EmailProviderClient {
  readonly providerName: string;
  getAuthorizationUrl(candidateId: string, redirectUri?: string): OAuthAuthorizationUrlResult;
  exchangeAuthorizationCode(code: string, state: string, candidateId: string): Promise<OAuthTokenPayload>;
  refreshAccessToken(refreshToken: string): Promise<OAuthTokenPayload>;
  sendEmail(options: SendEmailOptions, tokens?: OAuthTokenPayload): Promise<SendEmailResult>;
}
