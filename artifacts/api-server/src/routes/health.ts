import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get(["/healthz", "/health"], (_req, res) => {
  res.json({ status: "ok" });
});

export default router;
