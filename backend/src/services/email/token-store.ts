import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { loadEnvironment } from "../../config/env.js";
import { AppError } from "../../utils/app-error.js";
import type { OAuthTokenPayload } from "./types.js";

interface EncryptedRecord {
  ciphertext: string;
  iv: string;
  tag: string;
  updatedAt: Date;
}

class SecureTokenStore {
  private store = new Map<string, EncryptedRecord>();

  private getEncryptionKey(): Buffer {
    const env = loadEnvironment();
    const secret = env.TOKEN_ENCRYPTION_SECRET || "jobhunter-ai-secure-token-vault-key-32b";
    return createHash("sha256").update(secret).digest();
  }

  public async saveTokens(referenceKey: string, payload: OAuthTokenPayload): Promise<void> {
    if (!referenceKey) {
      throw new AppError("Token reference key cannot be empty.", 400, "INVALID_TOKEN_REFERENCE");
    }

    try {
      const key = this.getEncryptionKey();
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);

      const plaintext = JSON.stringify(payload);
      let encrypted = cipher.update(plaintext, "utf8", "hex");
      encrypted += cipher.final("hex");
      const tag = cipher.getAuthTag().toString("hex");

      this.store.set(referenceKey, {
        ciphertext: encrypted,
        iv: iv.toString("hex"),
        tag,
        updatedAt: new Date(),
      });
    } catch (err) {
      throw new AppError("Failed to securely encrypt token payload.", 500, "ENCRYPTION_ERROR");
    }
  }

  public async getTokens(referenceKey: string): Promise<OAuthTokenPayload | null> {
    const record = this.store.get(referenceKey);
    if (!record) {
      return null;
    }

    try {
      const key = this.getEncryptionKey();
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(record.iv, "hex"),
      );
      decipher.setAuthTag(Buffer.from(record.tag, "hex"));

      let decrypted = decipher.update(record.ciphertext, "hex", "utf8");
      decrypted += decipher.final("utf8");

      const parsed = JSON.parse(decrypted);
      return {
        ...parsed,
        expiresAt: new Date(parsed.expiresAt),
      };
    } catch (err) {
      throw new AppError("Failed to securely decrypt token payload.", 500, "DECRYPTION_ERROR");
    }
  }

  public async deleteTokens(referenceKey: string): Promise<void> {
    this.store.delete(referenceKey);
  }

  public hasTokens(referenceKey: string): boolean {
    return this.store.has(referenceKey);
  }
}

export const tokenStore = new SecureTokenStore();
