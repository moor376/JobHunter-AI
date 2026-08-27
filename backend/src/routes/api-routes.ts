import { Router } from "express";

import { applicationRouter } from "./application-routes.js";
import { auditRouter } from "./audit-routes.js";
import { candidateRouter } from "./candidate-routes.js";
import { emailRouter } from "./email-routes.js";
import { healthRouter } from "./health-routes.js";
import { jobRouter } from "./job-routes.js";
import { jobSourceRouter } from "./job-source-routes.js";
import { workerRouter } from "./worker-routes.js";

const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/candidates", candidateRouter);
apiRouter.use("/job-sources", jobSourceRouter);
apiRouter.use("/jobs", jobRouter);
apiRouter.use("/applications", applicationRouter);
apiRouter.use("/email", emailRouter);
apiRouter.use("/email-accounts", emailRouter);
apiRouter.use("/worker", workerRouter);
apiRouter.use("/audit-logs", auditRouter);

export { apiRouter };
