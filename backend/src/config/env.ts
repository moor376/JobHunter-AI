import "dotenv/config";

import { z } from "zod";

const databaseUrlSchema = z
  .string()
  .trim()
  .min(1, "DATABASE_URL is required.")
  .refine(
    (value) => {
      try {
        const url = new URL(value);
        return url.protocol === "postgresql:" || url.protocol === "postgres:";
      } catch {
        return false;
      }
    },
    { message: "DATABASE_URL must use the postgresql:// or postgres:// scheme." },
  );

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().trim().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: databaseUrlSchema.default(
    "postgresql://postgres:postgres_password@localhost:5432/jobhunter_ai?schema=public",
  ),
  GEMINI_API_KEY: z.string().trim().optional(),
  JOOBLE_API_KEY: z.string().trim().optional(),
  ADZUNA_APP_ID: z.string().trim().optional(),
  ADZUNA_APP_KEY: z.string().trim().optional(),
  GOOGLE_CLIENT_ID: z.string().trim().optional(),
  GOOGLE_CLIENT_SECRET: z.string().trim().optional(),
  GOOGLE_REDIRECT_URI: z.string().trim().optional(),
  GMAIL_MODE: z.enum(["auto", "live", "simulation"]).default("auto"),
  TOKEN_ENCRYPTION_SECRET: z
    .string()
    .trim()
    .min(16)
    .default("jobhunter-ai-secure-token-vault-key-32b"),
  JOB_WORKER_ENABLED: z.coerce.boolean().default(false),
  WORKER_ENABLED: z.coerce.boolean().optional(),
  JOB_WORKER_INTERVAL_MINUTES: z.coerce.number().int().min(1).default(30),
  WORKER_INTERVAL_MINUTES: z.coerce.number().int().min(1).optional(),
  JOB_WORKER_MATCH_THRESHOLD: z.coerce.number().min(0).max(100).default(60),
  WORKER_MATCH_THRESHOLD: z.coerce.number().min(0).max(100).optional(),
  APPLICATION_MODE: z.enum(["MANUAL", "AUTONOMOUS"]).default("MANUAL"),
  DRY_RUN: z.coerce.boolean().default(true),
  MAX_CONCURRENT_APPLICATIONS: z.coerce.number().int().min(1).max(20).default(3),
  DISCOVERY_MAX_QUERIES_PER_JOB: z.coerce.number().int().min(1).max(10).default(5),
  DISCOVERY_MAX_JOBS_PER_RUN: z.coerce.number().int().min(1).max(100).default(20),
  HTTP_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
  APP_URL: z.string().trim().default("http://localhost:3000"),
  CORS_ORIGIN: z.string().trim().default("http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001"),
  UPLOAD_DIR: z.string().trim().default("uploads"),
  MAX_RESUME_SIZE_BYTES: z.coerce.number().int().min(1024).default(5 * 1024 * 1024), // 5MB default
});

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  const result = environmentSchema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => issue.path.join(".") + ": " + issue.message)
      .join("; ");

    throw new Error("Invalid environment configuration. " + details);
  }

  const env = result.data;
  // Apply aliases
  if (env.WORKER_ENABLED !== undefined) {
    env.JOB_WORKER_ENABLED = env.WORKER_ENABLED;
  }
  if (env.WORKER_INTERVAL_MINUTES !== undefined) {
    env.JOB_WORKER_INTERVAL_MINUTES = env.WORKER_INTERVAL_MINUTES;
  }
  if (env.WORKER_MATCH_THRESHOLD !== undefined) {
    env.JOB_WORKER_MATCH_THRESHOLD = env.WORKER_MATCH_THRESHOLD;
  }

  return env;
}

export interface StartupConfigurationReport {
  isProductionReady: boolean;
  applicationMode: "MANUAL" | "AUTONOMOUS";
  dryRun: boolean;
  providers: {
    jooble: { configured: boolean; name: string };
    adzuna: { configured: boolean; name: string };
  };
  database: {
    isConfigured: boolean;
    type: "PostgreSQL" | "In-Memory Store Fallback";
  };
  emailSender: {
    isConfigured: boolean;
    mode: string;
  };
  worker: {
    enabled: boolean;
    intervalMinutes: number;
    matchThreshold: number;
  };
  missingRequiredVariables: string[];
}

export function validateStartupConfiguration(
  env: Environment = loadEnvironment(),
): StartupConfigurationReport {
  const missing: string[] = [];

  const joobleConfigured = Boolean(env.JOOBLE_API_KEY && env.JOOBLE_API_KEY.length > 5);
  const adzunaConfigured = Boolean(
    env.ADZUNA_APP_ID &&
    env.ADZUNA_APP_KEY &&
    env.ADZUNA_APP_ID.length > 2 &&
    env.ADZUNA_APP_KEY.length > 5 &&
    env.ADZUNA_APP_ID !== "your_adzuna_app_id"
  );

  if (!joobleConfigured && !adzunaConfigured) {
    missing.push("JOOBLE_API_KEY or (ADZUNA_APP_ID + ADZUNA_APP_KEY) for real job discovery");
  }

  const isDbConfigured = Boolean(
    env.DATABASE_URL &&
    (env.DATABASE_URL.startsWith("postgresql://") || env.DATABASE_URL.startsWith("postgres://"))
  );

  const googleOAuthConfigured = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

  const workerEnabled = env.JOB_WORKER_ENABLED || env.WORKER_ENABLED || false;

  const isProductionReady = Boolean(
    (joobleConfigured || adzunaConfigured) &&
    isDbConfigured
  );

  return {
    isProductionReady,
    applicationMode: env.APPLICATION_MODE,
    dryRun: env.DRY_RUN,
    providers: {
      jooble: { configured: joobleConfigured, name: "Jooble Real Jobs API" },
      adzuna: { configured: adzunaConfigured, name: "Adzuna Real Jobs API" },
    },
    database: {
      isConfigured: Boolean(env.DATABASE_URL),
      type: isDbConfigured ? "PostgreSQL" : "In-Memory Store Fallback",
    },
    emailSender: {
      isConfigured: googleOAuthConfigured,
      mode: env.GMAIL_MODE,
    },
    worker: {
      enabled: workerEnabled,
      intervalMinutes: env.JOB_WORKER_INTERVAL_MINUTES || 30,
      matchThreshold: env.JOB_WORKER_MATCH_THRESHOLD || 60,
    },
    missingRequiredVariables: missing,
  };
}
