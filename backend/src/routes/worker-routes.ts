import { Router } from "express";
import {
  getWorkerStatus,
  postWorkerConfigure,
  postWorkerDisable,
  postWorkerEnable,
  postWorkerRun,
} from "../controllers/worker-controller.js";

const workerRouter = Router();

workerRouter.get("/status", getWorkerStatus);
workerRouter.post("/run", postWorkerRun);
workerRouter.post("/enable", postWorkerEnable);
workerRouter.post("/disable", postWorkerDisable);
workerRouter.post("/configure", postWorkerConfigure);

export { workerRouter };
