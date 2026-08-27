import { loadEnvironment } from "../../config/env.js";
import { LiveGmailProvider } from "./gmail-provider.js";
import { SimulationEmailProvider } from "./simulation-provider.js";
import type { EmailProviderClient } from "./types.js";

const liveGmailProvider = new LiveGmailProvider();
const simulationProvider = new SimulationEmailProvider();

export function isLiveGmailConfigured(): boolean {
  const env = loadEnvironment();
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export function getEmailProvider(): EmailProviderClient {
  const env = loadEnvironment();

  if (env.GMAIL_MODE === "live") {
    if (!isLiveGmailConfigured()) {
      // In live-forced mode without credentials, log warning and use simulation
      return simulationProvider;
    }
    return liveGmailProvider;
  }

  if (env.GMAIL_MODE === "simulation") {
    return simulationProvider;
  }

  // Auto mode: use live if credentials exist, else fallback to simulation
  if (isLiveGmailConfigured()) {
    return liveGmailProvider;
  }

  return simulationProvider;
}

export function getEmailProviderStatus(): {
  mode: "live" | "simulation";
  isConfigured: boolean;
  providerName: string;
} {
  const isConfigured = isLiveGmailConfigured();
  const provider = getEmailProvider();
  return {
    mode: provider.providerName === "GMAIL_LIVE" ? "live" : "simulation",
    isConfigured,
    providerName: provider.providerName,
  };
}
