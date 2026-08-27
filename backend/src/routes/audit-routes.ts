import { Router } from "express";
import { getAuditLogs } from "../controllers/audit-controller.js";

const auditRouter = Router();

auditRouter.get("/", getAuditLogs);

export { auditRouter };
