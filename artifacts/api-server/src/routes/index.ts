import { Router, type IRouter } from "express";
import healthRouter from "./health";
import botRouter from "./bot";
import tradesRouter from "./trades";
import analyticsRouter from "./analytics";
import marketRouter from "./market";
import learningRouter from "./learning";
import backtestRouter from "./backtest";
import brokerRouter from "./broker";
import newsRouter from "./news";
import regimeRouter from "./regime";
import montecarloRouter from "./montecarlo";
import paperRouter from "./paper";

const router: IRouter = Router();

router.use(healthRouter);
router.use(botRouter);
router.use(tradesRouter);
router.use(analyticsRouter);
router.use(marketRouter);
router.use(learningRouter);
router.use(backtestRouter);
router.use(brokerRouter);
router.use(newsRouter);
router.use(regimeRouter);
router.use(montecarloRouter);
router.use(paperRouter);

export default router;
