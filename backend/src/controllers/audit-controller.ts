import type { RequestHandler } from "express";
import { listAuditLogs } from "../services/audit-service.js";
import { asyncHandler } from "../utils/async-handler.js";

export const getAuditLogs: RequestHandler = asyncHandler(
  async (request, response) => {
    const { candidateId } = request.query;
    const logs = await listAuditLogs(
      typeof candidateId === "string" ? candidateId : undefined,
    );
    response.status(200).json({
      data: logs,
      total: logs.length,
    });
  },
);
