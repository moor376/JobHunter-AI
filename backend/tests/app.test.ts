import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";

type StartedServer = {
  server: Server;
  url: string;
};

type ErrorResponse = {
  error: {
    code: string;
  };
};

async function startServer(): Promise<StartedServer> {
  const server = createServer(createApp());

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();

  if (address === null || typeof address === "string") {
    throw new Error("Test server did not expose a TCP address.");
  }

  const { port } = address as AddressInfo;

  return {
    server,
    url: "http://127.0.0.1:" + port,
  };
}

async function stopServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

describe("Phase 1 API foundation", () => {
  let activeServer: Server | undefined;

  afterEach(async () => {
    if (activeServer) {
      await stopServer(activeServer);
      activeServer = undefined;
    }
  });

  it("returns a database-independent health response", async () => {
    const startedServer = await startServer();
    activeServer = startedServer.server;

    const response = await fetch(startedServer.url + "/api/health");
    const payload = (await response.json()) as {
      data: {
        service: string;
        status: string;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({
      service: "jobhunter-ai-backend",
      status: "ok",
    });
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });

  it("rejects invalid candidate input before database access", async () => {
    const startedServer = await startServer();
    activeServer = startedServer.server;

    const response = await fetch(startedServer.url + "/api/candidates", {
      body: JSON.stringify({
        firstName: "",
        lastName: "Candidate",
        email: "not-an-email",
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });
    const payload = (await response.json()) as ErrorResponse;

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns a stable not-found error for unknown routes", async () => {
    const startedServer = await startServer();
    activeServer = startedServer.server;

    const response = await fetch(startedServer.url + "/api/unknown");
    const payload = (await response.json()) as ErrorResponse;

    expect(response.status).toBe(404);
    expect(payload.error.code).toBe("NOT_FOUND");
  });

  it("rejects malformed JSON with a client error", async () => {
    const startedServer = await startServer();
    activeServer = startedServer.server;

    const response = await fetch(startedServer.url + "/api/candidates", {
      body: "{",
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });
    const payload = (await response.json()) as ErrorResponse;

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_JSON");
  });
});
