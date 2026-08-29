import { Router } from "express";
import { getDashboard } from "../controllers/dashboard-controller.js";

const dashboardRouter = Router();

dashboardRouter.get("/", getDashboard);
dashboardRouter.get("/summary", getDashboard);

export { dashboardRouter };
