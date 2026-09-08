import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import packagesRouter from "./packages";
import batchesRouter from "./batches";
import customersRouter from "./customers";
import adminsRouter from "./admins";
import dashboardRouter from "./dashboard";
import reportsRouter from "./reports";
import paymentsRouter from "./payments";
import settingsRouter from "./settings";
import pengeluaranRouter from "./pengeluaran";
import shiftsRouter from "./shifts";
import transactionsRouter from "./transactions";
import voidsRouter from "./voids";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/packages", packagesRouter);
router.use("/batches", batchesRouter);
router.use("/customers", customersRouter);
router.use("/admins", adminsRouter);
router.use("/dashboard", dashboardRouter);
router.use("/reports", reportsRouter);
router.use("/payments", paymentsRouter);
router.use("/settings", settingsRouter);
router.use("/pengeluaran", pengeluaranRouter);
router.use("/shifts", shiftsRouter);
router.use("/transactions", transactionsRouter);
router.use("/voids", voidsRouter);

export default router;
